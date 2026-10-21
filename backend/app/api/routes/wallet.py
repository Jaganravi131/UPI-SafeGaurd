"""
Wallet & Sandbox Banking API Routes
Implements the /wallet/* endpoints the frontend dashboard, payment flow and
admin pages already call — balance, wallet info, history, transfers, and a
sandbox "Add Money" top-up so demo accounts that start at Rs.0 can transact
and pay other users like a real UPI app.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.database import get_db
from app.db.models import (
    Transaction, User, Wallet, TransactionStatus, RiskLevel,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wallet", tags=["Wallet"])

SANDBOX_TOPUP_MAX = 10000.0  # per top-up cap for demo safety


async def _ensure_wallet(db: AsyncSession, user: User) -> Wallet:
    result = await db.execute(select(Wallet).where(Wallet.user_id == user.id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(user_id=user.id, balance=0.0, currency="INR")
        db.add(wallet)
        await db.flush()
    return wallet


async def _get_user_or_404(db: AsyncSession, user_id: str) -> User:
    try:
        uid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _assert_owner(user_id_from_token: str, path_user_id: str) -> None:
    if str(user_id_from_token).lower() not in (str(UUID(path_user_id)).lower(), str(path_user_id).lower()):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your wallet")


# ── Schemas ──────────────────────────────────────────────────────────────────

class TransferRequest(BaseModel):
    recipient_upi: str = Field(..., min_length=3, max_length=100)
    amount: float = Field(..., gt=0)
    note: Optional[str] = Field(None, max_length=255)


class TopUpRequest(BaseModel):
    amount: float = Field(..., gt=0, le=SANDBOX_TOPUP_MAX)
    note: Optional[str] = Field(None, max_length=255)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/balance/{user_id}")
async def get_balance(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    """Current wallet balance for the authenticated user."""
    user = await _get_user_or_404(db, user_id)
    _assert_owner(token_user, str(user.id))
    wallet = await _ensure_wallet(db, user)
    return {
        "balance": float(wallet.balance or 0),
        "currency": wallet.currency or "INR",
        "daily_spent": float(wallet.daily_spent or 0),
        "daily_limit": float(wallet.daily_limit or 0),
    }


@router.get("/info/{user_id}")
async def get_wallet_info(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    """Wallet info combined with the owning user's profile snapshot."""
    user = await _get_user_or_404(db, user_id)
    _assert_owner(token_user, str(user.id))
    wallet = await _ensure_wallet(db, user)
    return {
        "wallet_id": str(wallet.id),
        "user": {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone_number": user.phone_number,
            "upi_id": user.upi_id,
        },
        "upi_id": user.upi_id,
        "balance": float(wallet.balance or 0),
        "currency": wallet.currency or "INR",
        "daily_spent": float(wallet.daily_spent or 0),
        "daily_limit": float(wallet.daily_limit or 0),
        "is_sandbox": True,
    }


@router.get("/transactions/{user_id}")
async def get_wallet_transactions(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    """Recent wallet history for the authenticated user."""
    user = await _get_user_or_404(db, user_id)
    _assert_owner(token_user, str(user.id))

    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(desc(Transaction.created_at))
        .limit(limit)
    )
    txns = result.scalars().all()
    return {
        "transactions": [
            {
                "id": str(t.id),
                "recipient_upi": t.recipient_upi,
                "recipient_name": t.recipient_name,
                "amount": float(t.amount or 0),
                "purpose": t.purpose,
                "status": t.status.value if t.status else "pending",
                "risk_level": t.risk_level.value if t.risk_level else "low",
                "created_at": t.created_at.isoformat() if t.created_at else None,
                # Top-ups and incoming transfers show as credits
                "type": "credit" if (t.recipient_upi or "").startswith("topup@") or (t.purpose or "").startswith(("Transfer received", "Payment received")) else "debit",
            }
            for t in txns
        ]
    }


@router.post("/transfer/{user_id}")
async def wallet_transfer(
    user_id: str,
    request: TransferRequest,
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    """Direct wallet-to-wallet transfer between sandbox users by UPI id."""
    user = await _get_user_or_404(db, user_id)
    _assert_owner(token_user, str(user.id))
    sender_wallet = await _ensure_wallet(db, user)

    current_balance = float(sender_wallet.balance or 0)
    if current_balance < request.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient wallet balance. Available: Rs.{current_balance:.2f}",
        )

    # Find the recipient sandbox user by UPI id
    result = await db.execute(select(User).where(User.upi_id == request.recipient_upi))
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No UPI SafeGuard user found for that UPI ID. Add Money first or use another handle.",
        )
    if recipient.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot pay yourself")

    recipient_wallet = await _ensure_wallet(db, recipient)

    # Debit sender, credit recipient
    sender_wallet.balance = current_balance - float(request.amount)
    sender_wallet.daily_spent = float(sender_wallet.daily_spent or 0) + float(request.amount)
    recipient_wallet.balance = float(recipient_wallet.balance or 0) + float(request.amount)

    ledger = Transaction(
        user_id=user.id,
        recipient_upi=request.recipient_upi,
        recipient_name=recipient.full_name,
        amount=request.amount,
        purpose=request.note or "UPI transfer",
        status=TransactionStatus.COMPLETED,
        risk_level=RiskLevel.LOW,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(ledger)
    # Recipient-side credit ledger so their history shows the incoming payment
    credit_ledger = Transaction(
        user_id=recipient.id,
        recipient_upi=user.upi_id or f"sender:{user.phone_number}",
        recipient_name=user.full_name,
        amount=request.amount,
        purpose=f"Transfer received — {request.note}" if request.note else "Transfer received",
        status=TransactionStatus.COMPLETED,
        risk_level=RiskLevel.LOW,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(credit_ledger)
    await db.commit()

    return {
        "success": True,
        "message": f"Paid Rs.{request.amount:.2f} to {recipient.full_name}",
        "transaction_id": str(ledger.id),
        "balance": float(sender_wallet.balance),
        "new_balance": float(sender_wallet.balance),
        "currency": sender_wallet.currency or "INR",
    }


@router.post("/topup/{user_id}")
async def wallet_topup(
    user_id: str,
    request: TopUpRequest,
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    """Sandbox 'Add Money'. Credits the authenticated user's wallet and records
    a COMPLETED credit transaction so payment flows work exactly like a
    funded UPI account."""
    user = await _get_user_or_404(db, user_id)
    _assert_owner(token_user, str(user.id))
    wallet = await _ensure_wallet(db, user)

    wallet.balance = float(wallet.balance or 0) + float(request.amount)

    ledger = Transaction(
        user_id=user.id,
        recipient_upi=f"topup@upisafeguard",
        recipient_name="Add Money (Sandbox Bank)",
        amount=request.amount,
        purpose=request.note or "Sandbox top-up",
        status=TransactionStatus.COMPLETED,
        risk_level=RiskLevel.LOW,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(ledger)
    await db.commit()

    return {
        "success": True,
        "message": f"Added Rs.{request.amount:.2f} to your wallet",
        "transaction_id": str(ledger.id),
        "balance": float(wallet.balance),
        "currency": wallet.currency or "INR",
    }
