"""
Pydantic schemas for User
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID
import re


class UserBase(BaseModel):
    """Base user schema"""
    full_name: str = Field(..., min_length=2, max_length=100)
    phone_number: str = Field(..., description="Phone number with or without +91 prefix")
    email: Optional[str] = None
    preferred_language: str = "english"
    digital_literacy: str = "intermediate"


class UserCreate(UserBase):
    """Schema for user registration"""
    date_of_birth: Optional[datetime] = None
    upi_id: Optional[str] = None
    
    @validator("phone_number")
    def validate_phone(cls, v):
        # Remove +91 prefix if present
        clean_phone = v.replace("+91", "").replace(" ", "").strip()
        if not re.match(r"^[6-9]\d{9}$", clean_phone):
            raise ValueError("Invalid Indian mobile number")
        return v  # Keep original format


class UserLogin(BaseModel):
    """Schema for user login"""
    phone_number: Optional[str] = None
    upi_id: Optional[str] = None


class OTPRequest(BaseModel):
    """Schema for OTP request - supports phone or UPI ID"""
    phone_number: str  # Can be phone number or UPI ID


class OTPVerify(BaseModel):
    """Schema for OTP verification"""
    phone_number: str  # Can be phone number or UPI ID
    otp: str = Field(..., min_length=6, max_length=6)


class UserResponse(BaseModel):
    """Schema for user response"""
    id: UUID
    full_name: str
    phone_number: str
    email: Optional[str] = None
    upi_id: Optional[str] = None
    preferred_language: str = "english"
    digital_literacy: str = "intermediate"  # Will be converted from enum
    
    # Security scores
    security_score: float = 50.0
    behavior_score: float = 50.0
    education_score: float = 0.0
    history_score: float = 50.0
    
    # Settings
    guardian_enabled: bool = False
    guardian_threshold: float = 5000.0
    biometric_enabled: bool = False
    
    # Limits
    daily_limit: float = 100000.0
    per_transaction_limit: float = 50000.0
    
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Schema for user update"""
    full_name: Optional[str] = None
    email: Optional[str] = None
    preferred_language: Optional[str] = None
    biometric_enabled: Optional[bool] = None
    safe_word: Optional[str] = None


class SecurityScoreResponse(BaseModel):
    """Schema for security score breakdown"""
    total_score: float
    behavior_score: float
    education_score: float
    history_score: float
    profile_score: float
    recommendations: List[str]


class GuardianCreate(BaseModel):
    """Schema for creating guardian"""
    guardian_phone: str = Field(..., pattern=r"^[6-9]\d{9}$")
    guardian_name: str = Field(..., min_length=2, max_length=100)
    relationship: str
    approval_threshold: float = 5000.0


class GuardianResponse(BaseModel):
    """Schema for guardian response"""
    id: UUID
    guardian_phone: str
    guardian_name: str
    relationship: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for JWT token response"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
