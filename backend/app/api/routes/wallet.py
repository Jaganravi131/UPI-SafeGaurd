"""
Sandbox Banking API Routes
===========================
Provides endpoints for balance, transactions, and transfers
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

from app.services.sandbox_bank import (
    get_wallet, get_balance, get_transactions,
    transfer_money, search_wallets, search_transactions,
    get_all_transactions, initialize_wallet, create_demo_account
)
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/wallet", tags=["Sandbox Wallet"])


# ============================================
# SCHEMAS
# ============================================

class WalletResponse(BaseModel):
    user_id: str
    phone_number: str
    balance: float
    currency: str = "INR"
    bank_name: str
    account_number: str
    ifsc_code: str


class TransactionResponse(BaseModel):
    id: str
    type: str  # credit/debit
    amount: float
    description: str
    recipient_upi: str
    sender_upi: str
    status: str
    risk_score: float
    is_flagged: bool
    timestamp: str
    reference_id: str


class TransferRequest(BaseModel):
    recipient_upi: str = Field(..., description="Recipient's UPI ID")
    amount: float = Field(..., gt=0, le=100000)
    note: Optional[str] = Field(None, max_length=50)
    risk_score: float = Field(0.0, ge=0, le=100)


class TransferResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    transaction: Optional[TransactionResponse] = None
    new_balance: Optional[float] = None


# ============================================
# USER ENDPOINTS
# ============================================

@router.get("/balance/{user_id}")
async def get_user_balance(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    """Get user's wallet balance"""
    if user_id != auth_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    wallet = await get_wallet(user_id)
    
    if not wallet:
        # Return zero balance — wallet will be created on first real deposit/registration
        return {
            "balance": 0,
            "currency": "INR",
            "formatted": "₹0.00",
            "bank_name": "SafeGuard Sandbox Bank",
            "account_number": "",
        }
    
    return {
        "balance": wallet.get("balance", 0),
        "currency": "INR",
        "formatted": f"₹{wallet.get('balance', 0):,.2f}",
        "bank_name": wallet.get("bank_name", "SafeGuard Sandbox Bank"),
        "account_number": wallet.get("account_number", ""),
    }


@router.get("/info/{user_id}", response_model=WalletResponse)
async def get_wallet_info(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    """Get full wallet information"""
    if user_id != auth_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    wallet = await get_wallet(user_id)
    
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    return WalletResponse(**wallet)


@router.get("/transactions/{user_id}")
async def get_user_transactions(
    user_id: str,
    auth_user_id: str = Depends(get_current_user_id),
    limit: int = Query(20, ge=1, le=100)
):
    """Get user's transaction history"""
    if user_id != auth_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    transactions = await get_transactions(user_id, limit)
    
    return {
        "transactions": transactions,
        "count": len(transactions),
        "user_id": user_id
    }


@router.post("/transfer/{user_id}", response_model=TransferResponse)
async def make_transfer(user_id: str, request: TransferRequest, auth_user_id: str = Depends(get_current_user_id)):
    """Transfer money to another UPI ID (sandbox)"""
    if user_id != auth_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    wallet = await get_wallet(user_id)
    
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    sender_upi = wallet.get("phone_number", "").replace("+91", "") + "@upisafeguard"
    
    result = await transfer_money(
        sender_user_id=user_id,
        sender_upi=sender_upi,
        recipient_upi=request.recipient_upi,
        amount=request.amount,
        note=request.note or "",
        risk_score=request.risk_score
    )
    
    return TransferResponse(**result)


# ============================================
# ADMIN ENDPOINTS
# ============================================

@router.get("/admin/all-transactions")
async def admin_get_all_transactions(limit: int = Query(100, ge=1, le=500)):
    """[Admin] Get all transactions across all users"""
    transactions = await get_all_transactions(limit)
    return {
        "transactions": transactions,
        "count": len(transactions)
    }


@router.get("/admin/search")
async def admin_search(
    q: str = Query(..., min_length=2),
    search_type: str = Query("all", regex="^(wallets|transactions|all)$")
):
    """[Admin] Search wallets and transactions"""
    results = {
        "query": q,
        "wallets": [],
        "transactions": []
    }
    
    if search_type in ["wallets", "all"]:
        results["wallets"] = await search_wallets(q)
    
    if search_type in ["transactions", "all"]:
        results["transactions"] = await search_transactions(q)
    
    return results


@router.post("/admin/init-demo")
async def admin_init_demo():
    """[Admin] Initialize demo account with sample data"""
    wallet = await create_demo_account()
    return {
        "message": "Demo account initialized",
        "wallet": wallet
    }
