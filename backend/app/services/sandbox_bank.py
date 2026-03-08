"""
Sandbox Banking Service
========================
Simulates a real bank account for UPI SafeGuard demo/testing.
Provides:
- Wallet balance management
- Transaction history
- Money transfer simulation
- Fake bank account data

This is a LOCAL sandbox - no real money involved!
"""
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4
import random

# File-based storage for sandbox data
SANDBOX_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'sandbox_data')
WALLETS_FILE = os.path.join(SANDBOX_DATA_DIR, 'wallets.json')
TRANSACTIONS_FILE = os.path.join(SANDBOX_DATA_DIR, 'transactions.json')

# Ensure directory exists
os.makedirs(SANDBOX_DATA_DIR, exist_ok=True)


def _load_json(file_path: str) -> dict:
    """Load JSON file or return empty dict"""
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}


def _save_json(file_path: str, data: dict):
    """Save data to JSON file"""
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2, default=str)


# ============================================
# WALLET MANAGEMENT
# ============================================

async def initialize_wallet(user_id: str, phone_number: str, initial_balance: float = 0.0, upi_id: str = "") -> dict:
    """Initialize a new sandbox wallet for a user"""
    wallets = _load_json(WALLETS_FILE)
    
    if user_id in wallets:
        return wallets[user_id]
    
    phone_clean = phone_number.replace("+91", "")
    wallet = {
        "user_id": user_id,
        "phone_number": phone_number,
        "upi_id": upi_id or f"{phone_clean}@upisafeguard",
        "balance": initial_balance,
        "currency": "INR",
        "bank_name": "SafeGuard Sandbox Bank",
        "account_number": f"SBSB{random.randint(100000000, 999999999)}",
        "ifsc_code": "SBSB0001234",
        "created_at": datetime.utcnow().isoformat(),
        "last_updated": datetime.utcnow().isoformat(),
    }
    
    wallets[user_id] = wallet
    _save_json(WALLETS_FILE, wallets)
    
    # Only create welcome transaction if initial_balance > 0
    if initial_balance > 0:
        await add_transaction(
            user_id=user_id,
            transaction_type="credit",
            amount=initial_balance,
            description="Bank account opening deposit",
            recipient_upi=upi_id or phone_number.replace("+91", "") + "@upisafeguard",
        sender_upi=phone_number.replace("+91", "") + "@upisafeguard",
        status="completed"
    )
    
    return wallet


async def get_wallet(user_id: str) -> Optional[dict]:
    """Get user's wallet"""
    wallets = _load_json(WALLETS_FILE)
    return wallets.get(user_id)


async def find_wallet_by_upi(upi_id: str, exclude_user_id: str = "") -> Optional[dict]:
    """Find a wallet by UPI ID (flexible matching: exact UPI → phone@upisafeguard → phone prefix)"""
    wallets = _load_json(WALLETS_FILE)
    upi_clean = upi_id.lower().strip()
    # Extract phone from UPI (e.g., "9876543210@ybl" → "9876543210")
    upi_phone = upi_clean.split('@')[0] if '@' in upi_clean else upi_clean
    
    # Pass 1: Exact UPI ID match
    for uid, wallet in wallets.items():
        if uid == exclude_user_id:
            continue
        wallet_upi = wallet.get("upi_id", "").lower()
        if wallet_upi and upi_clean == wallet_upi:
            return wallet
    
    # Pass 2: phone@upisafeguard pattern
    for uid, wallet in wallets.items():
        if uid == exclude_user_id:
            continue
        phone = wallet.get("phone_number", "").replace("+91", "").strip()
        if phone and upi_clean == f"{phone}@upisafeguard":
            return wallet
    
    # Pass 3: Match by phone number across any bank suffix
    if upi_phone and len(upi_phone) >= 10:
        for uid, wallet in wallets.items():
            if uid == exclude_user_id:
                continue
            phone = wallet.get("phone_number", "").replace("+91", "").strip()
            wallet_upi_phone = wallet.get("upi_id", "").split('@')[0].lower() if wallet.get("upi_id") else ""
            if upi_phone == phone or (wallet_upi_phone and upi_phone == wallet_upi_phone):
                return wallet
    
    return None


async def get_balance(user_id: str) -> float:
    """Get user's current balance"""
    wallet = await get_wallet(user_id)
    return wallet.get("balance", 0.0) if wallet else 0.0


async def update_balance(user_id: str, amount: float, operation: str = "debit") -> dict:
    """Update user's balance (debit or credit)"""
    wallets = _load_json(WALLETS_FILE)
    
    if user_id not in wallets:
        raise ValueError("Wallet not found")
    
    if operation == "debit":
        if wallets[user_id]["balance"] < amount:
            raise ValueError("Insufficient balance")
        wallets[user_id]["balance"] -= amount
    else:  # credit
        wallets[user_id]["balance"] += amount
    
    wallets[user_id]["last_updated"] = datetime.utcnow().isoformat()
    _save_json(WALLETS_FILE, wallets)
    
    return wallets[user_id]


# ============================================
# TRANSACTION MANAGEMENT
# ============================================

async def add_transaction(
    user_id: str,
    transaction_type: str,  # "credit" or "debit"
    amount: float,
    description: str,
    recipient_upi: str,
    sender_upi: str,
    status: str = "completed",
    risk_score: float = 0.0,
    is_flagged: bool = False
) -> dict:
    """Add a new transaction to history"""
    transactions = _load_json(TRANSACTIONS_FILE)
    
    if user_id not in transactions:
        transactions[user_id] = []
    
    txn = {
        "id": str(uuid4()),
        "user_id": user_id,
        "type": transaction_type,
        "amount": amount,
        "description": description,
        "recipient_upi": recipient_upi,
        "sender_upi": sender_upi,
        "status": status,
        "risk_score": risk_score,
        "is_flagged": is_flagged,
        "timestamp": datetime.utcnow().isoformat(),
        "reference_id": f"TXN{random.randint(100000000000, 999999999999)}",
    }
    
    transactions[user_id].insert(0, txn)  # Add to beginning (most recent first)
    
    # Keep only last 100 transactions per user
    transactions[user_id] = transactions[user_id][:100]
    
    _save_json(TRANSACTIONS_FILE, transactions)
    return txn


async def get_transactions(user_id: str, limit: int = 20) -> List[dict]:
    """Get user's transaction history"""
    transactions = _load_json(TRANSACTIONS_FILE)
    user_txns = transactions.get(user_id, [])
    return user_txns[:limit]


async def get_all_transactions(limit: int = 100) -> List[dict]:
    """Get all transactions (for admin)"""
    transactions = _load_json(TRANSACTIONS_FILE)
    all_txns = []
    for user_id, txns in transactions.items():
        all_txns.extend(txns)
    
    # Sort by timestamp descending
    all_txns.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return all_txns[:limit]


# ============================================
# MONEY TRANSFER (SANDBOX)
# ============================================

async def transfer_money(
    sender_user_id: str,
    sender_upi: str,
    recipient_upi: str,
    amount: float,
    note: str = "",
    risk_score: float = 0.0
) -> dict:
    """
    Transfer money between sandbox accounts.
    Returns transaction details.
    """
    # Debit sender
    try:
        await update_balance(sender_user_id, amount, "debit")
    except ValueError as e:
        return {
            "success": False,
            "error": str(e),
            "transaction": None
        }
    
    # Record transaction for sender
    txn = await add_transaction(
        user_id=sender_user_id,
        transaction_type="debit",
        amount=amount,
        description=note or f"Payment to {recipient_upi}",
        recipient_upi=recipient_upi,
        sender_upi=sender_upi,
        status="completed",
        risk_score=risk_score,
        is_flagged=risk_score > 50
    )
    
    # Credit recipient if they have a wallet in our sandbox
    recipient_wallet = await find_wallet_by_upi(recipient_upi, exclude_user_id=sender_user_id)
    if recipient_wallet:
        try:
            await update_balance(recipient_wallet["user_id"], amount, "credit")
            await add_transaction(
                user_id=recipient_wallet["user_id"],
                transaction_type="credit",
                amount=amount,
                description=f"Received from {sender_upi}",
                recipient_upi=recipient_wallet.get("upi_id", recipient_upi),
                sender_upi=sender_upi,
                status="completed",
                risk_score=0.0
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to credit recipient {recipient_upi}: {e}")
            # Don't fail sender's txn if recipient credit fails
    
    return {
        "success": True,
        "error": None,
        "transaction": txn,
        "new_balance": await get_balance(sender_user_id)
    }


# ============================================
# DEMO DATA INITIALIZATION
# ============================================

async def create_demo_account():
    """Create demo account with sample transaction history"""
    demo_user_id = "demo-user-123"
    demo_phone = "+919876543210"
    
    wallets = _load_json(WALLETS_FILE)
    
    if demo_user_id in wallets:
        return wallets[demo_user_id]
    
    # Initialize demo wallet with ₹25,000
    wallet = await initialize_wallet(demo_user_id, demo_phone, 25000.0)
    
    # Add sample transaction history
    sample_transactions = [
        {"type": "debit", "amount": 499, "desc": "Netflix Subscription", "to": "netflix@axisbank", "risk": 5},
        {"type": "credit", "amount": 15000, "desc": "Salary Credit", "to": demo_phone.replace("+91", "") + "@upisafeguard", "risk": 0},
        {"type": "debit", "amount": 1200, "desc": "Electricity Bill", "to": "bescom@paytm", "risk": 2},
        {"type": "debit", "amount": 350, "desc": "Swiggy Order", "to": "swiggy@icici", "risk": 3},
        {"type": "debit", "amount": 2500, "desc": "Amazon Shopping", "to": "amazon@apl", "risk": 8},
        {"type": "credit", "amount": 5000, "desc": "From Rahul", "to": demo_phone.replace("+91", "") + "@upisafeguard", "risk": 0},
        {"type": "debit", "amount": 150, "desc": "Uber Ride", "to": "uber@icici", "risk": 2},
        {"type": "debit", "amount": 899, "desc": "Spotify Premium", "to": "spotify@ybl", "risk": 5},
        {"type": "debit", "amount": 3500, "desc": "Rent to Landlord", "to": "landlord@sbi", "risk": 10},
    ]
    
    transactions = _load_json(TRANSACTIONS_FILE)
    transactions[demo_user_id] = []
    
    for i, txn_data in enumerate(sample_transactions):
        days_ago = i * 3  # Space transactions 3 days apart
        txn = {
            "id": str(uuid4()),
            "user_id": demo_user_id,
            "type": txn_data["type"],
            "amount": txn_data["amount"],
            "description": txn_data["desc"],
            "recipient_upi": txn_data["to"],
            "sender_upi": demo_phone.replace("+91", "") + "@upisafeguard",
            "status": "completed",
            "risk_score": txn_data["risk"],
            "is_flagged": txn_data["risk"] > 50,
            "timestamp": (datetime.utcnow() - timedelta(days=days_ago)).isoformat(),
            "reference_id": f"TXN{random.randint(100000000000, 999999999999)}",
        }
        transactions[demo_user_id].append(txn)
    
    _save_json(TRANSACTIONS_FILE, transactions)
    
    return wallet


# ============================================
# SEARCH FUNCTIONS (FOR ADMIN)
# ============================================

async def search_wallets(query: str) -> List[dict]:
    """Search wallets by phone number or user_id"""
    wallets = _load_json(WALLETS_FILE)
    results = []
    
    query_lower = query.lower()
    for user_id, wallet in wallets.items():
        if (query_lower in user_id.lower() or 
            query_lower in wallet.get("phone_number", "").lower() or
            query_lower in wallet.get("account_number", "").lower()):
            results.append(wallet)
    
    return results


async def search_transactions(query: str) -> List[dict]:
    """Search transactions by UPI ID, description, or reference ID"""
    transactions = _load_json(TRANSACTIONS_FILE)
    results = []
    
    query_lower = query.lower()
    for user_id, txns in transactions.items():
        for txn in txns:
            if (query_lower in txn.get("recipient_upi", "").lower() or
                query_lower in txn.get("sender_upi", "").lower() or
                query_lower in txn.get("description", "").lower() or
                query_lower in txn.get("reference_id", "").lower() or
                query_lower in user_id.lower()):
                results.append(txn)
    
    # Sort by timestamp
    results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return results[:50]


# Demo account created on demand via /admin/auth/demo-login, not auto-initialized
# To create a demo account manually, call create_demo_account()
