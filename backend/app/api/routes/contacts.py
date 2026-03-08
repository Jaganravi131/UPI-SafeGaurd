"""
Contacts & UPI Lookup API Routes
================================
Phone number → UPI ID lookup (like real UPI apps)
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from ...db.excel_database import ExcelDatabase
from ...db.database import get_db
from ...db.models import User
from datetime import datetime

router = APIRouter(prefix="/contacts", tags=["contacts"])


# Helper to detect bank name from UPI handle
def _detect_bank_from_upi(upi_id: str) -> str:
    """Detect bank name from the @handle in a UPI ID"""
    if not upi_id or '@' not in upi_id:
        return "Unknown Bank"
    handle = upi_id.split('@')[-1].lower()
    bank_handles = {
        'okaxis': 'Axis Bank', 'okhdfc': 'HDFC Bank', 'oksbi': 'SBI',
        'okicici': 'ICICI Bank', 'kotak': 'Kotak Mahindra',
        'ybl': 'Yes Bank / PhonePe', 'paytm': 'Paytm Payments Bank',
        'icici': 'ICICI Bank', 'sbi': 'State Bank of India',
        'hdfc': 'HDFC Bank', 'apl': 'Amazon Pay',
        'ibl': 'IDBI Bank', 'axl': 'Axis Lite',
        'upisafeguard': 'UPI SafeGuard',
    }
    return bank_handles.get(handle, f"{handle.upper()} Bank")


class ContactResponse(BaseModel):
    phone: str
    name: str
    upi_id: str
    bank: str
    is_verified: bool
    trust_score: float
    account_age_days: int


class ScammerAlert(BaseModel):
    is_scammer: bool
    upi_id: Optional[str] = None
    scam_type: Optional[str] = None
    risk_level: Optional[str] = None
    report_count: Optional[int] = None
    warning_message: Optional[str] = None


class LookupResponse(BaseModel):
    found: bool
    contact: Optional[ContactResponse] = None
    scammer_alert: Optional[ScammerAlert] = None


@router.get("/search", response_model=LookupResponse)
async def search_contact(
    phone: Optional[str] = Query(None, description="Phone number to search"),
    upi_id: Optional[str] = Query(None, description="UPI ID to search"),
    db: AsyncSession = Depends(get_db)
):
    """
    Search for a contact by phone number or UPI ID.
    Also checks if the contact is a known scammer.
    Searches both contacts.xlsx AND registered users in the database.
    """
    if not phone and not upi_id:
        raise HTTPException(status_code=400, detail="Please provide either phone or upi_id")
    
    contact = None
    scammer_info = None
    
    # Search by phone
    if phone:
        clean_phone = phone.replace('+91', '').replace(' ', '').replace('-', '').strip()
        
        # First check scammer database
        scammer_info = ExcelDatabase.check_scammer_by_phone(clean_phone)
        
        # Then check contacts (Excel)
        contact = ExcelDatabase.get_contact_by_phone(clean_phone)
        
        # Fallback: search registered users in SQLAlchemy DB
        if not contact:
            result = await db.execute(
                select(User).where(
                    or_(
                        User.phone_number == clean_phone,
                        User.phone_number == f"+91{clean_phone}",
                        User.phone_number == clean_phone.lstrip('+91')
                    )
                )
            )
            db_user = result.scalar_one_or_none()
            if db_user and db_user.upi_id:
                bank_name = _detect_bank_from_upi(db_user.upi_id)
                account_age = (datetime.utcnow() - db_user.created_at).days if db_user.created_at else 0
                contact = {
                    'phone': clean_phone,
                    'name': db_user.full_name,
                    'upi_id': db_user.upi_id,
                    'bank': bank_name,
                    'is_verified': True,
                    'trust_score': float(db_user.security_score or 50),
                    'account_age_days': account_age
                }
    
    # Search by UPI ID
    elif upi_id:
        # Check scammer database
        scammer_info = ExcelDatabase.check_scammer(upi_id)
        
        # Check contacts (Excel)
        contact = ExcelDatabase.get_contact_by_upi(upi_id)
        
        # Fallback: search registered users in SQLAlchemy DB
        if not contact:
            result = await db.execute(
                select(User).where(func.lower(User.upi_id) == upi_id.lower())
            )
            db_user = result.scalar_one_or_none()
            if db_user:
                phone_clean = (db_user.phone_number or '').replace('+91', '').replace(' ', '').strip()
                bank_name = _detect_bank_from_upi(db_user.upi_id)
                account_age = (datetime.utcnow() - db_user.created_at).days if db_user.created_at else 0
                contact = {
                    'phone': phone_clean,
                    'name': db_user.full_name,
                    'upi_id': db_user.upi_id,
                    'bank': bank_name,
                    'is_verified': True,
                    'trust_score': float(db_user.security_score or 50),
                    'account_age_days': account_age
                }
    
    # Build response
    response = LookupResponse(found=contact is not None)
    
    if contact:
        response.contact = ContactResponse(**contact)
    
    if scammer_info:
        warning_messages = {
            'lottery_scam': '⚠️ WARNING: This number is linked to lottery/prize scams!',
            'kyc_fraud': '⚠️ WARNING: This number is linked to fake KYC verification scams!',
            'digital_arrest': '🚨 DANGER: This number is linked to "Digital Arrest" scams! NO government agency asks for money online!',
            'fake_support': '⚠️ WARNING: This is a fake customer support number!',
            'refund_scam': '⚠️ WARNING: This number is linked to fake refund scams!',
            'marketplace_fraud': '⚠️ WARNING: This number is linked to OLX/marketplace fraud!',
            'phishing': '🚨 DANGER: This number is linked to phishing attacks!',
            'job_scam': '⚠️ WARNING: This number is linked to job scams!',
            'investment_scam': '🚨 DANGER: This number is linked to investment fraud!',
            'crypto_scam': '🚨 DANGER: This number is linked to cryptocurrency scams!'
        }
        
        response.scammer_alert = ScammerAlert(
            is_scammer=True,
            upi_id=scammer_info['upi_id'],
            scam_type=scammer_info['scam_type'],
            risk_level=scammer_info['risk_level'],
            report_count=scammer_info['report_count'],
            warning_message=warning_messages.get(
                scammer_info['scam_type'],
                '⚠️ WARNING: This number has been reported for fraudulent activities!'
            )
        )
    else:
        response.scammer_alert = ScammerAlert(is_scammer=False)
    
    return response


@router.get("/verify-upi/{upi_id}")
async def verify_upi(upi_id: str, db: AsyncSession = Depends(get_db)):
    """
    Verify if a UPI ID exists and get associated details.
    Checks scammer DB, contacts.xlsx, AND registered users.
    """
    # Check scammer database first
    scammer = ExcelDatabase.check_scammer(upi_id)
    if scammer:
        return {
            "valid": True,
            "upi_id": upi_id,
            "name": "BLOCKED USER",  # Scammers don't show real name
            "bank": upi_id.split('@')[-1].upper() if '@' in upi_id else "Unknown",
            "is_scammer": True,
            "warning": f"🚨 This UPI ID has been reported {scammer['report_count']} times for {scammer['scam_type'].replace('_', ' ')}!"
        }
    
    # Check contacts database (Excel)
    contact = ExcelDatabase.get_contact_by_upi(upi_id)
    if contact:
        return {
            "valid": True,
            "upi_id": contact['upi_id'],
            "name": contact['name'],
            "bank": contact['bank'],
            "is_verified": contact['is_verified'],
            "trust_score": contact['trust_score'],
            "is_scammer": False
        }
    
    # Check registered users in SQLAlchemy DB
    result = await db.execute(
        select(User).where(func.lower(User.upi_id) == upi_id.lower())
    )
    db_user = result.scalar_one_or_none()
    if db_user:
        bank_name = _detect_bank_from_upi(db_user.upi_id)
        return {
            "valid": True,
            "upi_id": db_user.upi_id,
            "name": db_user.full_name,
            "bank": bank_name,
            "is_verified": True,
            "trust_score": float(db_user.security_score or 50),
            "is_scammer": False
        }
    
    # Unknown UPI ID - simulate bank verification
    if '@' in upi_id:
        bank_handles = {
            'okaxis': 'Axis Bank',
            'ybl': 'Yes Bank / PhonePe',
            'paytm': 'Paytm Payments Bank',
            'icici': 'ICICI Bank',
            'sbi': 'State Bank of India',
            'hdfc': 'HDFC Bank',
            'apl': 'Amazon Pay',
            'ibl': 'IDBI Bank',
            'axl': 'Axis Lite'
        }
        handle = upi_id.split('@')[-1].lower()
        bank = bank_handles.get(handle, f"{handle.upper()} Bank")
        
        # Generate a plausible name from UPI ID
        name_part = upi_id.split('@')[0].replace('.', ' ').replace('_', ' ').title()
        
        return {
            "valid": True,
            "upi_id": upi_id,
            "name": name_part,
            "bank": bank,
            "is_verified": False,
            "trust_score": 50,  # Unknown user gets neutral score
            "is_scammer": False,
            "warning": "⚠️ First time sending to this UPI ID. Please verify the recipient."
        }
    
    return {
        "valid": False,
        "error": "Invalid UPI ID format. Must contain @"
    }


@router.get("/all", response_model=List[ContactResponse])
async def get_all_contacts():
    """Get all contacts from the database"""
    contacts = ExcelDatabase.get_all_contacts()
    return [ContactResponse(**c) for c in contacts]


@router.get("/scammers")
async def get_known_scammers():
    """Get all known scammers (for admin/awareness)"""
    scammers = ExcelDatabase.get_all_scammers()
    return {
        "count": len(scammers),
        "scammers": scammers,
        "disclaimer": "This list is maintained to protect users from known fraudsters."
    }
