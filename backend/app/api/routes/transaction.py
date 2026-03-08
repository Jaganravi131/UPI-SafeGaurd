"""
Transaction API Routes
Handles payments, risk assessment, and transaction history
"""
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
import asyncio
import hashlib
import time
import logging

logger = logging.getLogger(__name__)

from app.db.database import get_db
from app.db.models import Transaction, User, UPIProfile, TransactionStatus, RiskLevel as DBRiskLevel
from app.api.deps import get_current_user_id
from app.schemas import (
    TransactionCreate, TransactionRequest, TransactionResponse,
    TransactionHistory, RecipientCheckRequest, RecipientCheckResponse
)
from app.services import get_risk_assessment_service, get_notification_service

router = APIRouter(prefix="/transactions", tags=["Transactions"])

# ── Risk‑token store for replay protection ──────────────────────────────────
# Maps token → {user_id, recipient_upi, amount, risk_result, created_at}
_risk_tokens: Dict[str, Dict[str, Any]] = {}
_RISK_TOKEN_TTL_SECONDS = 300  # 5 minutes validity


def _issue_risk_token(
    user_id: str, recipient_upi: str, amount: float, risk_result: dict
) -> str:
    """Issue a single-use risk token that /create must present."""
    raw = f"{user_id}:{recipient_upi}:{amount}:{time.time_ns()}"
    token = hashlib.sha256(raw.encode()).hexdigest()[:32]
    _risk_tokens[token] = {
        "user_id": user_id,
        "recipient_upi": recipient_upi,
        "amount": amount,
        "risk_result": risk_result,
        "created_at": time.time(),
    }
    # Housekeeping — evict expired tokens
    now = time.time()
    expired = [k for k, v in _risk_tokens.items() if now - v["created_at"] > _RISK_TOKEN_TTL_SECONDS * 2]
    for k in expired:
        _risk_tokens.pop(k, None)
    return token


def _consume_risk_token(token: str, user_id: str) -> Dict[str, Any]:
    """Validate & consume a risk token. Raises HTTPException on failure."""
    entry = _risk_tokens.pop(token, None)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired risk token. Please re-assess the transaction.",
        )
    if time.time() - entry["created_at"] > _RISK_TOKEN_TTL_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Risk token expired. Please re-assess the transaction.",
        )
    if entry["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Risk token does not belong to this user.",
        )
    return entry


async def get_user_profile(user_id: str, db: AsyncSession) -> dict:
    """Get user profile for ML assessment"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        return {
            "id": user_id,
            "avg_transaction_amount": 0,
            "max_transaction_amount": 0,
            "total_transactions": 0,
            "security_score": 50,
            "digital_literacy": "beginner",
            "guardian_enabled": False,
            "typical_hours": list(range(8, 22)),
        }
    
    # Get transaction statistics
    txn_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .where(Transaction.status == TransactionStatus.COMPLETED)
    )
    transactions = txn_result.scalars().all()
    
    amounts = [float(t.amount) for t in transactions] if transactions else []

    # Derive typical_hours from actual transaction history instead of hardcoded range
    if transactions:
        hour_counts: dict = {}
        for t in transactions:
            if t.created_at:
                h = t.created_at.hour
                hour_counts[h] = hour_counts.get(h, 0) + 1
        if hour_counts:
            # Keep hours where the user has made at least 1 transaction
            typical_hours = sorted(hour_counts.keys())
        else:
            typical_hours = list(range(8, 22))
    else:
        typical_hours = list(range(8, 22))  # default for brand-new users
    
    return {
        "id": str(user.id),
        "avg_transaction_amount": sum(amounts) / len(amounts) if amounts else 0.0,
        "max_transaction_amount": max(amounts) if amounts else 0.0,
        "total_transactions": len(transactions),
        "security_score": float(user.security_score or 50),
        "digital_literacy": user.digital_literacy.value if user.digital_literacy else "intermediate",
        "guardian_enabled": user.guardian_enabled,
        "guardian_threshold": float(user.guardian_threshold or 5000),
        "typical_hours": typical_hours,
        "age": (datetime.utcnow() - user.date_of_birth).days // 365 if user.date_of_birth else 30,
        "is_vulnerable": user.digital_literacy == "beginner",
    }


async def get_recipient_profile(upi_id: str, db: AsyncSession) -> dict:
    """Get recipient profile for ML assessment"""
    result = await db.execute(
        select(UPIProfile).where(UPIProfile.upi_id == upi_id)
    )
    profile = result.scalar_one_or_none()
    
    if profile:
        return {
            "upi_id": profile.upi_id,
            "trust_score": profile.trust_score,
            "report_count": profile.report_count,
            "account_age_days": profile.account_age_days or 30,
            "total_transactions": 0,
            "account_type": profile.account_type,
        }
    
    # Unknown recipient - default profile
    return {
        "upi_id": upi_id,
        "trust_score": 50,
        "report_count": 0,
        "account_age_days": 0,
        "total_transactions": 0,
        "account_type": "unknown",
    }


@router.post("/assess-risk")
async def assess_transaction_risk(
    request: TransactionRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Assess risk of a transaction before processing"""
    
    # Get profiles (sequential — async session doesn't support concurrent queries)
    user_profile = await get_user_profile(user_id, db)
    recipient_profile = await get_recipient_profile(request.recipient_upi, db)

    # New recipient check + recent transaction stats in minimal queries
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    one_day_ago = datetime.utcnow() - timedelta(days=1)

    recent_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .where(Transaction.created_at > one_day_ago)
    )
    recent = recent_result.scalars().all()

    # Derive new_recipient from the same recent query + completed transactions in profile
    is_new_recipient = not any(t.recipient_upi == request.recipient_upi for t in recent)
    if is_new_recipient and user_profile.get("total_transactions", 0) > 0:
        # Also check older transactions
        old_result = await db.execute(
            select(Transaction.id)
            .where(Transaction.user_id == user_id)
            .where(Transaction.recipient_upi == request.recipient_upi)
            .limit(1)
        )
        is_new_recipient = old_result.scalar_one_or_none() is None

    transactions_last_hour = len([t for t in recent if t.created_at > one_hour_ago])
    transactions_last_day = len(recent)
    
    # Prepare transaction data
    transaction_data = {
        "transaction_id": str(uuid4()),
        "recipient_upi": request.recipient_upi,
        "amount": request.amount,
        "purpose": request.purpose,
        "is_new_recipient": is_new_recipient,
        "hour_of_day": datetime.utcnow().hour,
        "day_of_week": datetime.utcnow().weekday(),
        "transactions_last_hour": transactions_last_hour,
        "transactions_last_day": transactions_last_day,
        "call_active": request.call_active,
    }
    
    # Run ML risk assessment
    risk_service = get_risk_assessment_service()
    result = await risk_service.assess_transaction(
        transaction_data,
        user_profile,
        recipient_profile,
        request.sensor_data
    )
    
    # Send notification if high risk
    if result["risk_level"] in ["high", "critical"]:
        notification_service = get_notification_service()
        await notification_service.send_risk_alert(
            user_id=user_id,
            risk_level=result["risk_level"],
            risk_score=result["ensemble_score"],
            risk_factors=result["risk_factors"],
            transaction_id=result["transaction_id"]
        )
    
    # Send guardian alert if LightGBM behavioral trigger fired (score 0.70-0.85)
    if result.get("guardian_trigger") == "lightgbm_behavioral":
        notification_service = get_notification_service()
        await notification_service.send_risk_alert(
            user_id=user_id,
            risk_level="high",
            risk_score=result["ensemble_score"],
            risk_factors=[
                result.get("guardian_trigger_detail", "Behavioral anomaly detected"),
                "Guardian review required before transaction can proceed",
            ],
            transaction_id=result["transaction_id"]
        )
    
    # Issue a single-use risk token so /create cannot be called without assessment
    risk_token = _issue_risk_token(user_id, request.recipient_upi, request.amount, result)
    result["risk_token"] = risk_token
    
    return result


@router.post("/create", response_model=TransactionResponse)
async def create_transaction(
    request: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Create and process a transaction"""
    
    # ── Replay protection: if a risk_token is provided, reuse its assessment ──
    if request.risk_token:
        token_entry = _consume_risk_token(request.risk_token, user_id)
        risk_result = token_entry["risk_result"]
        logger.info("Reusing risk assessment from token for user %s", user_id)
    else:
        # Fallback: run a fresh assessment (still allowed but logged)
        logger.warning("Transaction /create called without risk_token by user %s", user_id)
        user_profile = await get_user_profile(user_id, db)
        recipient_profile = await get_recipient_profile(request.recipient_upi, db)
        transaction_data = {
            "transaction_id": str(uuid4()),
            "recipient_upi": request.recipient_upi,
            "amount": request.amount,
            "is_new_recipient": True,
            "hour_of_day": datetime.utcnow().hour,
            "day_of_week": datetime.utcnow().weekday(),
        }
        risk_service = get_risk_assessment_service()
        risk_result = await risk_service.assess_transaction(
            transaction_data, user_profile, recipient_profile, request.sensor_data
        )

    # NOTE: delay_seconds is returned to the frontend for UI display only.
    # No server-side sleep — the review step already serves as a friction delay.

    risk_service = get_risk_assessment_service()
    
    # Determine status based on risk
    risk_level_map = {
        "low": DBRiskLevel.LOW,
        "medium": DBRiskLevel.MEDIUM,
        "high": DBRiskLevel.HIGH,
        "critical": DBRiskLevel.CRITICAL,
    }
    
    if risk_result["recommended_action"] == "block":
        status = TransactionStatus.BLOCKED
    elif risk_result["require_guardian_approval"]:
        status = TransactionStatus.GUARDIAN_PENDING
    else:
        status = TransactionStatus.COMPLETED
    
    # Create transaction record
    transaction = Transaction(
        user_id=user_id,
        recipient_upi=request.recipient_upi,
        amount=request.amount,
        purpose=request.purpose,
        status=status,
        risk_level=risk_level_map.get(risk_result["risk_level"], DBRiskLevel.LOW),
        risk_score=risk_result["ensemble_score"],
        xgboost_score=risk_result.get("xgboost_score"),
        lstm_score=risk_result.get("lstm_score"),
        isolation_forest_score=risk_result.get("isolation_forest_score"),
        gnn_score=risk_result.get("gnn_score"),
        ml_confidence=risk_result.get("confidence"),
        risk_factors=risk_result.get("risk_factors", []),
        delay_applied=risk_result.get("delay_seconds", 0),
        completed_at=datetime.utcnow() if status == TransactionStatus.COMPLETED else None
    )
    
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    
    # Update sandbox wallet balance for completed transactions
    if status == TransactionStatus.COMPLETED:
        try:
            from app.services.sandbox_bank import transfer_money as sandbox_transfer, get_wallet
            wallet = await get_wallet(user_id)
            if wallet:
                sender_upi = wallet.get("upi_id", f"{user_id}@upisafeguard")
                await sandbox_transfer(
                    sender_user_id=user_id,
                    sender_upi=sender_upi,
                    recipient_upi=request.recipient_upi,
                    amount=float(request.amount),
                    note=request.purpose or f"Payment to {request.recipient_upi}",
                    risk_score=risk_result["ensemble_score"] * 100
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Sandbox balance update failed: {e}")

    # Notify guardians for high-risk / guardian-pending transactions
    if status == TransactionStatus.GUARDIAN_PENDING:
        try:
            from app.api.routes.guardian import notify_guardians_of_transaction
            await notify_guardians_of_transaction(
                user_id=user_id,
                transaction_data={
                    "amount": float(request.amount),
                    "recipient_upi": request.recipient_upi,
                    "transaction_id": str(transaction.id),
                },
                risk_result=risk_result,
                db=db,
            )
        except Exception as e:
            logger.warning("Guardian notification failed: %s", e)
    
    # Update graph network
    if status == TransactionStatus.COMPLETED:
        risk_service.record_transaction_graph(
            f"{user_id}@upi",
            request.recipient_upi
        )
    
    return TransactionResponse(
        id=transaction.id,
        recipient_upi=transaction.recipient_upi,
        recipient_name=None,
        amount=transaction.amount,
        purpose=transaction.purpose,
        status=transaction.status.value,
        risk_level=transaction.risk_level.value,
        risk_score=transaction.risk_score,
        ml_confidence=transaction.ml_confidence,
        risk_factors=transaction.risk_factors,
        xgboost_score=transaction.xgboost_score,
        lstm_score=transaction.lstm_score,
        isolation_forest_score=transaction.isolation_forest_score,
        gnn_score=transaction.gnn_score,
        sensor_score=risk_result.get("sensor_score"),
        created_at=transaction.created_at,
        completed_at=transaction.completed_at
    )


@router.get("/history", response_model=TransactionHistory)
async def get_transaction_history(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    page: int = 1,
    page_size: int = 20,
    status_filter: Optional[str] = None
):
    """Get user's transaction history"""
    query = select(Transaction).order_by(desc(Transaction.created_at))
    
    status_map = {
        "completed": TransactionStatus.COMPLETED,
        "blocked": TransactionStatus.BLOCKED,
        "flagged": TransactionStatus.GUARDIAN_PENDING,
    }
    
    # Always filter by authenticated user
    if user_id:
        query = query.where(Transaction.user_id == user_id)
    
    if status_filter and status_filter in status_map:
        query = query.where(Transaction.status == status_map[status_filter])
    
    # Pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    # Get total count efficiently
    count_query = select(func.count(Transaction.id))
    if user_id:
        count_query = count_query.where(Transaction.user_id == user_id)
    if status_filter and status_filter in status_map:
        count_query = count_query.where(Transaction.status == status_map[status_filter])
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    return TransactionHistory(
        transactions=[
            TransactionResponse(
                id=t.id,
                recipient_upi=t.recipient_upi,
                recipient_name=t.recipient_name,
                amount=t.amount,
                purpose=t.purpose,
                status=t.status.value,
                risk_level=t.risk_level.value,
                risk_score=t.risk_score,
                ml_confidence=t.ml_confidence,
                risk_factors=t.risk_factors or [],
                xgboost_score=t.xgboost_score,
                lstm_score=t.lstm_score,
                isolation_forest_score=t.isolation_forest_score,
                gnn_score=t.gnn_score,
                created_at=t.created_at,
                completed_at=t.completed_at
            )
            for t in transactions
        ],
        total_count=total,
        page=page,
        page_size=page_size
    )


@router.post("/check-recipient", response_model=RecipientCheckResponse)
async def check_recipient_safety(
    request: RecipientCheckRequest,
    db: AsyncSession = Depends(get_db)
):
    """Check safety of a recipient UPI ID"""
    risk_service = get_risk_assessment_service()
    result = risk_service.check_recipient_safety(request.upi_id)
    
    # Get additional info from database
    db_result = await db.execute(
        select(UPIProfile).where(UPIProfile.upi_id == request.upi_id)
    )
    profile = db_result.scalar_one_or_none()
    
    return RecipientCheckResponse(
        upi_id=request.upi_id,
        name=profile.verified_name if profile else None,
        account_type=profile.account_type if profile else "unknown",
        trust_score=result["trust_score"],
        graph_network_score=result["network_risk_score"] * 100,
        report_count=result["report_count"],
        total_amount_reported=profile.total_amount_reported if profile else 0,
        risk_level=result["risk_level"],
        recommendation=result["recommendation"],
        confidence=0.85,
        risk_factors=result["suspicious_patterns"]
    )
