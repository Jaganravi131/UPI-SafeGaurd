"""
Authentication API Routes
Handles user registration, login, OTP verification
Includes single-device session management
"""
from fastapi import APIRouter, HTTPException, Depends, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timedelta
from jose import jwt, JWTError
import random
import string
import uuid
from typing import Optional

from app.db.database import get_db
from app.db.models import User, UserLiteracy
from app.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    OTPRequest, OTPVerify
)
from app.config import settings
from app.services.sms_service import send_otp_sms, is_demo_number, format_phone_display
from app.api.deps import get_current_user_id as get_current_user_id_dep

router = APIRouter(prefix="/auth", tags=["Authentication"])

# In-memory OTP store (use Redis in production)
otp_store: dict = {}

# Session store - tracks active sessions per user
# Key: user_id, Value: {"session_id": str, "device_info": str, "created_at": datetime}
active_sessions: dict = {}


def generate_otp() -> str:
    """Generate 6-digit OTP"""
    return ''.join(random.choices(string.digits, k=6))


def generate_session_id() -> str:
    """Generate unique session ID"""
    return str(uuid.uuid4())


def create_access_token(data: dict, session_id: str = None) -> str:
    """Create JWT access token with session tracking"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    to_encode.update({
        "exp": expire,
        "session_id": session_id or generate_session_id()
    })
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def invalidate_other_sessions(user_id: str, new_session_id: str, device_info: str = "Unknown"):
    """Invalidate all sessions except the new one - single device enforcement"""
    active_sessions[user_id] = {
        "session_id": new_session_id,
        "device_info": device_info,
        "created_at": datetime.utcnow()
    }


def is_session_valid(user_id: str, session_id: str) -> bool:
    """Check if a session is still valid (not logged out from another device)"""
    current_session = active_sessions.get(user_id)
    if not current_session:
        return True  # No session tracking yet, allow
    return current_session["session_id"] == session_id


@router.post("/request-otp")
async def request_otp(request: OTPRequest):
    """
    Request OTP for phone number
    - Demo numbers (from contacts.xlsx): OTP displayed on screen
    - Real numbers: OTP sent via Twilio SMS
    """
    otp = generate_otp()
    otp_store[request.phone_number] = {
        "otp": otp,
        "expires": datetime.utcnow() + timedelta(minutes=5),
        "attempts": 0
    }
    
    # Send OTP via SMS service
    success, message, display_otp = send_otp_sms(request.phone_number, otp)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP. Please try again."
        )
    
    response = {
        "success": True,
        "message": message,
        "phone_display": format_phone_display(request.phone_number),
        "expires_in": 300,
        "is_demo": is_demo_number(request.phone_number)
    }
    
    # Only include OTP in response for demo numbers
    if display_otp:
        response["demo_otp"] = display_otp
    
    return response


@router.post("/verify-otp")
async def verify_otp(
    request: OTPVerify,
    db: AsyncSession = Depends(get_db),
    x_device_info: Optional[str] = Header(None, alias="X-Device-Info")
):
    """Verify OTP and login/register user with single-device session"""
    # Check OTP
    stored = otp_store.get(request.phone_number)
    
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP not found. Please request a new OTP."
        )
    
    if stored["expires"] < datetime.utcnow():
        del otp_store[request.phone_number]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired. Please request a new OTP."
        )
    
    stored["attempts"] += 1
    if stored["attempts"] > 3:
        del otp_store[request.phone_number]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many attempts. Please request a new OTP."
        )
    
    if stored["otp"] != request.otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP"
        )
    
    # OTP verified, clean up
    del otp_store[request.phone_number]
    
    # Check if user exists
    result = await db.execute(
        select(User).where(User.phone_number == request.phone_number)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # User doesn't exist - check if phone is in contacts database for auto-fill
        from app.db.excel_database import ExcelDatabase
        clean_phone = request.phone_number.replace('+91', '').replace(' ', '')
        contact_info = ExcelDatabase.get_contact_by_phone(clean_phone)
        
        # Return suggested data for registration
        return {
            "access_token": "",
            "token_type": "bearer",
            "user": None,
            "is_new_user": True,
            "phone_number": request.phone_number,
            "suggested_name": contact_info.get("name") if contact_info else None,
            "suggested_upi_id": contact_info.get("upi_id") if contact_info else None,
            "bank_name": contact_info.get("bank") if contact_info else None
        }
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # Create new session and invalidate previous sessions (single-device enforcement)
    new_session_id = generate_session_id()
    device_info = x_device_info or "Unknown Device"
    
    # Check if user was logged in elsewhere
    previous_session = active_sessions.get(str(user.id))
    logged_out_elsewhere = previous_session is not None
    
    # Invalidate all other sessions
    invalidate_other_sessions(str(user.id), new_session_id, device_info)
    
    # Ensure sandbox wallet exists (creates if missing, preserves existing balance)
    from app.services.sandbox_bank import get_wallet, initialize_wallet
    existing_wallet = await get_wallet(str(user.id))
    if not existing_wallet:
        upi_id = user.upi_id or user.phone_number.replace("+91", "").replace(" ", "") + "@upisafeguard"
        await initialize_wallet(str(user.id), user.phone_number, initial_balance=10000.0, upi_id=upi_id)
    
    # Create token with session ID
    token = create_access_token(
        {"sub": str(user.id), "phone": user.phone_number},
        session_id=new_session_id
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user),
        "is_new_user": False,
        "logged_out_elsewhere": logged_out_elsewhere,
        "session_id": new_session_id
    }


from pydantic import BaseModel

class FirebaseTokenRequest(BaseModel):
    id_token: str

@router.post("/verify-firebase-token")
async def verify_firebase_token(
    request: FirebaseTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Verify Firebase ID token and login/register user
    This is called after successful Firebase Phone Authentication
    """
    from app.services.firebase_service import verify_firebase_token as verify_token
    
    # Verify the Firebase token
    firebase_user = verify_token(request.id_token)
    
    if not firebase_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token"
        )
    
    phone_number = firebase_user.get("phone_number")
    if not phone_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number not found in Firebase token"
        )
    
    # Check if user exists
    result = await db.execute(
        select(User).where(User.phone_number == phone_number)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # User doesn't exist - return indication for registration
        return {
            "access_token": "",
            "token_type": "bearer",
            "user": None,
            "is_new_user": True,
            "phone_number": phone_number,
            "firebase_uid": firebase_user.get("uid")
        }
    
    # Update last login
    user.last_login = datetime.utcnow()
    if not user.firebase_uid and firebase_user.get("uid"):
        user.firebase_uid = firebase_user.get("uid")
    await db.commit()
    
    # Create token
    token = create_access_token({"sub": str(user.id), "phone": user.phone_number})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user),
        "is_new_user": False
    }


@router.post("/register", response_model=TokenResponse)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    x_device_info: Optional[str] = Header(None, alias="X-Device-Info")
):
    """Register a new user with sandbox balance"""
    # Check if user already exists
    result = await db.execute(
        select(User).where(User.phone_number == user_data.phone_number)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this phone number already exists"
        )
    
    # Check if UPI ID is taken
    if user_data.upi_id:
        result = await db.execute(
            select(User).where(User.upi_id == user_data.upi_id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This UPI ID is already taken"
            )
    
    # Create new user
    literacy_map = {
        "beginner": UserLiteracy.BEGINNER,
        "intermediate": UserLiteracy.INTERMEDIATE,
        "advanced": UserLiteracy.ADVANCED
    }
    
    # Generate UPI ID if not provided
    phone_clean = user_data.phone_number.replace("+91", "").replace(" ", "")
    upi_id = user_data.upi_id or f"{phone_clean}@upisafeguard"
    
    user = User(
        phone_number=user_data.phone_number,
        full_name=user_data.full_name,
        email=user_data.email,
        date_of_birth=user_data.date_of_birth,
        preferred_language=user_data.preferred_language,
        digital_literacy=literacy_map.get(user_data.digital_literacy, UserLiteracy.INTERMEDIATE),
        upi_id=upi_id,
        security_score=50.0,
        behavior_score=50.0,
        last_login=datetime.utcnow()
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Initialize sandbox wallet with ₹10,000 (simulated bank deposit)
    from app.services.sandbox_bank import initialize_wallet
    await initialize_wallet(str(user.id), user.phone_number, initial_balance=10000.0, upi_id=upi_id)
    
    # Add user to contacts database so they are searchable by other users
    from app.db.excel_database import ExcelDatabase
    bank_handles = {
        'okaxis': 'Axis Bank', 'okhdfc': 'HDFC Bank', 'oksbi': 'SBI',
        'okicici': 'ICICI Bank', 'kotak': 'Kotak Mahindra',
        'ybl': 'Yes Bank / PhonePe', 'paytm': 'Paytm Payments Bank',
        'upisafeguard': 'UPI SafeGuard',
    }
    upi_handle = upi_id.split('@')[-1].lower() if '@' in upi_id else ''
    bank_name = bank_handles.get(upi_handle, f"{upi_handle.upper()} Bank") if upi_handle else 'UPI SafeGuard'
    ExcelDatabase.add_contact(
        phone=phone_clean,
        name=user_data.full_name,
        upi_id=upi_id,
        bank=bank_name,
        is_verified=True,
        trust_score=50.0,
        account_age_days=0
    )
    
    # Create new session (single-device enforcement)
    new_session_id = generate_session_id()
    device_info = x_device_info or "Unknown Device"
    invalidate_other_sessions(str(user.id), new_session_id, device_info)
    
    # Create token with session ID
    token = create_access_token(
        {"sub": str(user.id), "phone": user.phone_number},
        session_id=new_session_id
    )
    
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id_dep)
):
    """Get current user profile"""
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse.model_validate(user)


@router.post("/validate-session")
async def validate_session(
    authorization: Optional[str] = Header(None)
):
    """
    Validate if the current session is still active
    Returns session_valid: false if logged out from another device
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authorization token provided"
        )
    
    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user_id = payload.get("sub")
    session_id = payload.get("session_id")
    
    if not user_id or not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Check if session is still valid
    is_valid = is_session_valid(user_id, session_id)
    
    return {
        "session_valid": is_valid,
        "user_id": user_id,
        "message": "Session is active" if is_valid else "Session invalidated - logged in from another device"
    }


@router.post("/logout")
async def logout(
    authorization: Optional[str] = Header(None)
):
    """Logout user and invalidate current session"""
    if not authorization:
        return {"message": "Logged out successfully"}
    
    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)
    
    if payload:
        user_id = payload.get("sub")
        if user_id and user_id in active_sessions:
            del active_sessions[user_id]
    
    return {"message": "Logged out successfully"}


@router.get("/active-sessions")
async def get_active_sessions(
    authorization: Optional[str] = Header(None)
):
    """Get count of active sessions (requires auth)"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return {
        "active_sessions_count": len(active_sessions)
    }
