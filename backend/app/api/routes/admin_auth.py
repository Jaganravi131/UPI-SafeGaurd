"""
Admin Authentication API Routes
Handles admin login, logout, and session management
"""
from fastapi import APIRouter, HTTPException, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from typing import Optional
from uuid import UUID

from app.db.database import get_db
from app.db.models import Admin, AdminRole, ActivityLog
from app.schemas.admin import (
    AdminLogin,
    AdminTokenResponse,
    AdminCreate,
    AdminResponse
)
from app.config import settings

router = APIRouter(prefix="/admin/auth", tags=["Admin Authentication"])

# Password hashing - using bcrypt directly for compatibility
import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def hash_password(password: str) -> str:
    """Hash a password"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_admin_token(data: dict) -> str:
    """Create JWT token for admin"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=12)  # 12 hour expiry for admin
    to_encode.update({"exp": expire, "type": "admin"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_admin_token(token: str) -> Optional[dict]:
    """Decode and validate admin JWT token"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "admin":
            return None
        return payload
    except JWTError:
        return None


async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Admin:
    """Get current authenticated admin from token"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    token = auth_header.split(" ")[1]
    payload = decode_admin_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    result = await db.execute(
        select(Admin).where(Admin.id == admin_id)
    )
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found"
        )
    
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is deactivated"
        )
    
    return admin


def require_role(allowed_roles: list):
    """Dependency to check admin role"""
    async def role_checker(admin: Admin = Depends(get_current_admin)):
        if admin.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return admin
    return role_checker


async def log_activity(
    db: AsyncSession,
    admin_id: Optional[UUID],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[UUID] = None,
    details: dict = None,
    ip_address: Optional[str] = None
):
    """Log admin activity"""
    log = ActivityLog(
        admin_id=admin_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=ip_address
    )
    db.add(log)
    await db.commit()


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(
    credentials: AdminLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Admin login endpoint"""
    # Find admin by email
    result = await db.execute(
        select(Admin).where(Admin.email == credentials.email)
    )
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not verify_password(credentials.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is deactivated"
        )
    
    # Update last login
    admin.last_login = datetime.now(timezone.utc)
    await db.commit()
    
    # Log activity
    await log_activity(
        db=db,
        admin_id=admin.id,
        action="login",
        ip_address=request.client.host if request.client else None
    )
    
    # Create token
    token = create_admin_token({"sub": str(admin.id), "email": admin.email})
    
    return AdminTokenResponse(
        access_token=token,
        token_type="bearer",
        admin=AdminResponse.model_validate(admin)
    )


@router.post("/logout")
async def admin_logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_current_admin)
):
    """Admin logout endpoint"""
    # Log activity
    await log_activity(
        db=db,
        admin_id=admin.id,
        action="logout",
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=AdminResponse)
async def get_current_admin_info(
    admin: Admin = Depends(get_current_admin)
):
    """Get current admin information"""
    return AdminResponse.model_validate(admin)


@router.post("/create-first-admin", response_model=AdminResponse)
async def create_first_admin(
    admin_data: AdminCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create first super admin. 
    Only works if no admins exist in the system.
    """
    # Check if any admin exists
    result = await db.execute(select(Admin).limit(1))
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin already exists. Use admin panel to create more admins."
        )
    
    # Create super admin
    admin = Admin(
        email=admin_data.email,
        username=admin_data.username,
        password_hash=hash_password(admin_data.password),
        full_name=admin_data.full_name,
        role=AdminRole.SUPER_ADMIN  # First admin is always super admin
    )
    
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    
    return AdminResponse.model_validate(admin)


# Demo endpoint for testing - creates a demo admin
@router.post("/demo-login", response_model=AdminTokenResponse)
async def demo_admin_login(
    db: AsyncSession = Depends(get_db)
):
    """
    Demo admin login - creates demo admin if not exists.
    For hackathon demo purposes only.
    """
    demo_email = "admin@upisafeguard.com"
    
    # Check if demo admin exists
    result = await db.execute(
        select(Admin).where(Admin.email == demo_email)
    )
    admin = result.scalar_one_or_none()
    
    if not admin:
        # Create demo admin (password from config, override via .env)
        admin = Admin(
            email=demo_email,
            username="admin",
            password_hash=hash_password(settings.ADMIN_DEFAULT_PASSWORD),
            full_name="Demo Admin",
            role=AdminRole.SUPER_ADMIN
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
    
    # Update last login
    admin.last_login = datetime.now(timezone.utc)
    await db.commit()
    
    # Create token
    token = create_admin_token({"sub": str(admin.id), "email": admin.email})
    
    return AdminTokenResponse(
        access_token=token,
        token_type="bearer",
        admin=AdminResponse.model_validate(admin)
    )
