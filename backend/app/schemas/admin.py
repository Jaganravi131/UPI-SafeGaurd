"""
Pydantic schemas for Admin
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from enum import Enum
import re


class AdminRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    ANALYST = "analyst"
    SUPPORT = "support"


# ============ Authentication Schemas ============

class AdminLogin(BaseModel):
    """Admin login request"""
    email: str = Field(..., description="Admin email")
    password: str = Field(..., min_length=6, description="Admin password")


class AdminTokenResponse(BaseModel):
    """Admin login response with token"""
    access_token: str
    token_type: str = "bearer"
    admin: "AdminResponse"


# ============ Admin CRUD Schemas ============

class AdminCreate(BaseModel):
    """Schema for creating admin"""
    email: str = Field(..., description="Valid email address")
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: AdminRole = AdminRole.ANALYST
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, v):
            raise ValueError('Invalid email format')
        return v


class AdminUpdate(BaseModel):
    """Schema for updating admin"""
    full_name: Optional[str] = None
    role: Optional[AdminRole] = None
    is_active: Optional[bool] = None


class AdminResponse(BaseModel):
    """Admin response schema"""
    id: UUID
    email: str
    username: str
    full_name: str
    role: str  # Changed from AdminRole to str for SQLAlchemy enum compatibility
    is_active: bool
    last_login: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============ Dashboard Stats Schemas ============

class DashboardOverview(BaseModel):
    """Admin dashboard overview stats"""
    total_users: int
    active_users_today: int
    total_transactions: int
    transactions_today: int
    frauds_blocked: int
    frauds_blocked_today: int
    amount_saved: float
    amount_saved_today: float
    total_fraud_reports: int
    pending_reports: int
    ml_model_status: Dict[str, Any]


class RiskDistribution(BaseModel):
    """Risk level distribution"""
    period_days: int
    distribution: Dict[str, int]
    trend: List[Dict[str, Any]]


class FraudTypeStats(BaseModel):
    """Fraud type statistics"""
    fraud_types: List[Dict[str, Any]]
    total_reports: int
    total_amount_lost: float


class MLModelPerformance(BaseModel):
    """ML model performance metrics"""
    model_name: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    total_predictions: int
    last_trained: Optional[datetime]
    status: str


# ============ User Management Schemas ============

class UserListItem(BaseModel):
    """User item for admin list"""
    id: UUID
    phone_number: str
    full_name: str
    email: Optional[str]
    security_score: float
    digital_literacy: str
    guardian_enabled: bool
    is_blocked: bool = False
    total_transactions: int = 0
    total_amount: float = 0
    created_at: datetime
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Paginated user list response"""
    users: List[UserListItem]
    total: int
    page: int
    page_size: int


class UserBlockRequest(BaseModel):
    """Request to block/unblock user"""
    reason: Optional[str] = None


# ============ Fraud Report Management ============

class FraudReportAdminItem(BaseModel):
    """Fraud report for admin review"""
    id: UUID
    reporter_id: Optional[UUID]
    scammer_upi: str
    scam_type: str
    amount_lost: Optional[float]
    description: Optional[str]
    verification_score: float
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class FraudReportAdminList(BaseModel):
    """Paginated fraud report list"""
    reports: List[FraudReportAdminItem]
    total: int
    page: int
    page_size: int


class FraudReportUpdateStatus(BaseModel):
    """Update fraud report status"""
    status: str = Field(..., pattern="^(pending|verified|rejected)$")
    admin_notes: Optional[str] = None


# ============ Activity Log Schemas ============

class ActivityLogItem(BaseModel):
    """Activity log entry"""
    id: UUID
    admin_id: Optional[UUID]
    user_id: Optional[UUID]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[UUID]
    details: Dict[str, Any]
    ip_address: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class ActivityLogList(BaseModel):
    """Paginated activity log list"""
    logs: List[ActivityLogItem]
    total: int
    page: int
    page_size: int


# Update forward reference
AdminTokenResponse.model_rebuild()
