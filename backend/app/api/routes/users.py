"""
User Profile API Routes
GET  /users/me  — profile snapshot
PUT  /users/me  — update personal details (name, email, language, phone)
"""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.database import get_db
from app.db.models import User

router = APIRouter(prefix="/users", tags=["Users"])

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=20)
    preferred_language: Optional[str] = Field(None, max_length=30)

    @validator("email")
    def validate_email(cls, v):
        if v is None:
            return v
        if not _EMAIL_RE.match(v.strip()):
            raise ValueError("Invalid email address")
        return v.strip().lower()


    @validator("phone_number")
    def validate_phone(cls, v):
        if v is None:
            return v
        clean = v.replace("+91", "").replace(" ", "").strip()
        if not re.match(r"^[6-9]\d{9}$", clean):
            raise ValueError("Invalid Indian mobile number")
        return v


@router.get("/me")
async def get_me(
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    result = await db.execute(select(User).where(User.id == token_user))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "phone_number": user.phone_number,
        "upi_id": user.upi_id,
        "preferred_language": user.preferred_language or "english",
        "digital_literacy": getattr(user.digital_literacy, "value", "intermediate") if user.digital_literacy else "intermediate",
        "security_score": float(user.security_score or 0),
        "guardian_enabled": bool(getattr(user, "guardian_enabled", False)),
    }


@router.put("/me")
async def update_me(
    update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    token_user: str = Depends(get_current_user_id),
):
    result = await db.execute(select(User).where(User.id == token_user))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Uniqueness checks when these fields change
    if update.email and update.email != user.email:
        existing = await db.execute(select(User).where(User.email == update.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = update.email

    if update.phone_number:
        clean = update.phone_number.replace("+91", "").replace(" ", "").strip()
        if clean != (user.phone_number or "").replace("+91", "").replace(" ", "").strip():
            existing = await db.execute(select(User).where(User.phone_number == update.phone_number))
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number already registered")
            user.phone_number = update.phone_number

    if update.full_name:
        user.full_name = update.full_name.strip()
    if update.preferred_language:
        user.preferred_language = update.preferred_language

    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "message": "Profile updated",
        "user": {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone_number": user.phone_number,
            "upi_id": user.upi_id,
            "preferred_language": user.preferred_language or "english",
            "digital_literacy": getattr(user.digital_literacy, "value", "intermediate") if user.digital_literacy else "intermediate",
            "security_score": float(user.security_score or 0),
            "guardian_enabled": bool(getattr(user, "guardian_enabled", False)),
        },
    }
