"""
Guardian Mode API Routes
Handles guardian setup and approval workflow
"""
import logging
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID

from app.db.database import get_db
from app.db.models import User, Guardian, Transaction, TransactionStatus
from app.schemas import GuardianCreate, GuardianResponse
from app.services import get_notification_service
from app.api.deps import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/guardian", tags=["Guardian Mode"])


# ── Helper: notify all active guardians of a user ──
async def notify_guardians_of_transaction(
    user_id: str,
    transaction_data: dict,
    risk_result: dict,
    db: AsyncSession,
):
    """Send notification to all active guardians when a high-risk txn is created."""
    # Fetch user
    usr = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    user_name = usr.full_name if usr else "A user"

    # Fetch active guardians
    result = await db.execute(
        select(Guardian).where(Guardian.user_id == user_id, Guardian.status == "active")
    )
    guardians = result.scalars().all()

    notification_service = get_notification_service()
    amount = transaction_data.get("amount", 0)
    recipient = transaction_data.get("recipient_upi", "unknown")
    risk_level = risk_result.get("risk_level", "high")

    for g in guardians:
        # Prefer guardian_id (user account); fall back to phone
        target = str(g.guardian_id) if g.guardian_id else g.guardian_phone

        await notification_service.create_notification(
            user_id=target,
            notification_type="guardian_approval",
            title=f"\ud83d\udea8 {user_name} needs your approval",
            message=(
                f"{user_name} is trying to send \u20b9{amount:,.0f} to {recipient}. "
                f"Risk level: {risk_level.upper()}. Please review."
            ),
            data={
                "action_required": True,
                "user_name": user_name,
                "amount": amount,
                "recipient_upi": recipient,
                "risk_level": risk_level,
                "risk_score": risk_result.get("ensemble_score", 0),
                "risk_factors": risk_result.get("risk_factors", []),
            },
        )
    logger.info("Notified %d guardians for user %s", len(guardians), user_id)


@router.post("/setup", response_model=GuardianResponse)
async def setup_guardian(
    guardian_data: GuardianCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Set up guardian for a user"""

    # Try to resolve guardian user by phone number
    guardian_user = (
        await db.execute(
            select(User).where(User.phone_number == guardian_data.guardian_phone)
        )
    ).scalar_one_or_none()

    guardian = Guardian(
        user_id=user_id,
        guardian_id=guardian_user.id if guardian_user else None,
        guardian_phone=guardian_data.guardian_phone,
        guardian_name=guardian_data.guardian_name,
        relation_type=guardian_data.relationship,
        status="active" if guardian_user else "pending",
    )
    db.add(guardian)

    # Update user settings
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.guardian_enabled = True
        user.guardian_threshold = guardian_data.approval_threshold

    await db.commit()
    await db.refresh(guardian)

    notification_service = get_notification_service()
    # Notify by guardian user_id if linked, otherwise by phone
    notify_target = str(guardian_user.id) if guardian_user else guardian_data.guardian_phone
    ward_name = user.full_name if user else "Someone"
    await notification_service.create_notification(
        user_id=notify_target,
        notification_type="guardian_invitation",
        title="🛡️ You've been added as a Guardian!",
        message=(
            f"{ward_name} has added you as their guardian. "
            f"You will receive alerts when they attempt high-risk transactions."
        ),
        data={
            "guardian_id": str(guardian.id),
            "ward_name": ward_name,
            "relationship": guardian_data.relationship,
        },
    )

    return GuardianResponse(
        id=guardian.id,
        guardian_phone=guardian.guardian_phone,
        guardian_name=guardian.guardian_name,
        relationship=guardian.relation_type,
        status=guardian.status,
        created_at=guardian.created_at
    )


@router.get("/list", response_model=List[GuardianResponse])
async def list_guardians(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """List guardians for a user"""
    query = select(Guardian).where(Guardian.user_id == user_id)
    
    result = await db.execute(query)
    guardians = result.scalars().all()
    
    return [
        GuardianResponse(
            id=g.id,
            guardian_phone=g.guardian_phone,
            guardian_name=g.guardian_name,
            relationship=g.relation_type,
            status=g.status,
            created_at=g.created_at
        )
        for g in guardians
    ]


@router.post("/accept/{guardian_id}")
async def accept_guardian_invite(
    guardian_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Accept guardian invitation"""
    result = await db.execute(
        select(Guardian).where(Guardian.id == guardian_id)
    )
    guardian = result.scalar_one_or_none()
    
    if not guardian:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guardian invitation not found"
        )
    
    guardian.status = "active"
    await db.commit()
    
    return {"message": "Guardian invitation accepted", "status": "active"}


@router.post("/decline/{guardian_id}")
async def decline_guardian_invite(
    guardian_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Decline guardian invitation"""
    result = await db.execute(
        select(Guardian).where(Guardian.id == guardian_id)
    )
    guardian = result.scalar_one_or_none()
    
    if not guardian:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guardian invitation not found"
        )
    
    guardian.status = "declined"
    await db.commit()
    
    return {"message": "Guardian invitation declined"}


@router.delete("/{guardian_id}")
async def remove_guardian(
    guardian_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Remove a guardian"""
    result = await db.execute(
        select(Guardian).where(Guardian.id == guardian_id)
    )
    guardian = result.scalar_one_or_none()
    
    if not guardian:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guardian not found"
        )
    
    await db.delete(guardian)
    await db.commit()
    
    return {"message": "Guardian removed"}


@router.get("/my-wards")
async def get_my_wards(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Get the list of people I am guarding (i.e. I am THEIR guardian)"""
    # Look up current user's phone
    me = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not me:
        return []

    # Match by guardian_id OR guardian_phone (deduplicate)
    result = await db.execute(
        select(Guardian).where(
            or_(
                Guardian.guardian_id == user_id,
                Guardian.guardian_phone == me.phone_number,
            )
        ).distinct()
    )
    wards = result.scalars().all()

    # Deduplicate by guardian id (safety net since OR may match same row)
    seen = set()
    out = []
    for g in wards:
        gid = str(g.id)
        if gid in seen:
            continue
        seen.add(gid)
        ward_user = None
        if g.user_id:
            ward_user = (await db.execute(select(User).where(User.id == g.user_id))).scalar_one_or_none()
        out.append({
            "guardian_id": str(g.id),
            "ward_user_id": str(g.user_id) if g.user_id else None,
            "ward_name": ward_user.full_name if ward_user else "Unknown",
            "ward_phone": ward_user.phone_number if ward_user else None,
            "relationship": g.relation_type,
            "status": g.status,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        })
    return out


@router.get("/pending-approvals")
async def get_pending_approvals(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Get pending transaction approvals for this guardian's wards"""
    # Find which users this person is guardian of
    me = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    ward_ids = set()
    if me:
        result = await db.execute(
            select(Guardian.user_id).where(
                or_(
                    Guardian.guardian_id == user_id,
                    Guardian.guardian_phone == me.phone_number,
                ),
                Guardian.status == "active",
            )
        )
        ward_ids = {str(r[0]) for r in result.all() if r[0]}

    if not ward_ids:
        # Fallback: return all pending (for demo / when no guardian link yet)
        result = await db.execute(
            select(Transaction)
            .where(Transaction.status == TransactionStatus.GUARDIAN_PENDING)
        )
    else:
        result = await db.execute(
            select(Transaction)
            .where(Transaction.status == TransactionStatus.GUARDIAN_PENDING)
            .where(Transaction.user_id.in_(ward_ids))
        )
    transactions = result.scalars().all()

    out = []
    for t in transactions:
        # Fetch ward name
        ward = (await db.execute(select(User).where(User.id == t.user_id))).scalar_one_or_none()
        out.append({
            "transaction_id": str(t.id),
            "ward_name": ward.full_name if ward else "Unknown",
            "amount": float(t.amount),
            "recipient_upi": t.recipient_upi,
            "risk_level": t.risk_level.value if t.risk_level else "medium",
            "risk_score": float(t.risk_score) if t.risk_score else 0.0,
            "risk_factors": t.risk_factors,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return out


@router.post("/approve/{transaction_id}")
async def approve_transaction(
    transaction_id: UUID,
    db: AsyncSession = Depends(get_db),
    guardian_id: str = None
):
    """Approve a pending transaction"""
    result = await db.execute(
        select(Transaction).where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    if transaction.status != TransactionStatus.GUARDIAN_PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction is not pending approval"
        )
    
    transaction.status = TransactionStatus.COMPLETED
    transaction.guardian_approved = True
    transaction.completed_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    # Notify user
    notification_service = get_notification_service()
    await notification_service.create_notification(
        user_id=str(transaction.user_id) if transaction.user_id else "demo-user",
        notification_type="guardian_approval",
        title="Transaction Approved",
        message=f"Your guardian approved the ₹{transaction.amount} transaction",
        data={"transaction_id": str(transaction.id)}
    )
    
    return {"message": "Transaction approved", "transaction_id": str(transaction_id)}


@router.post("/reject/{transaction_id}")
async def reject_transaction(
    transaction_id: UUID,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Reject a pending transaction"""
    result = await db.execute(
        select(Transaction).where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    transaction.status = TransactionStatus.BLOCKED
    transaction.guardian_approved = False
    
    await db.commit()
    
    # Notify user
    notification_service = get_notification_service()
    await notification_service.create_notification(
        user_id=str(transaction.user_id) if transaction.user_id else "demo-user",
        notification_type="guardian_approval",
        title="Transaction Rejected",
        message=f"Your guardian rejected the ₹{transaction.amount} transaction"
                + (f". Reason: {reason}" if reason else ""),
        data={"transaction_id": str(transaction.id), "reason": reason}
    )
    
    return {"message": "Transaction rejected", "transaction_id": str(transaction_id)}
