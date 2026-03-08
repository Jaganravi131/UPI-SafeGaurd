"""
Pydantic schemas for Fraud Report
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class FraudReportCreate(BaseModel):
    """Schema for creating a fraud report"""
    scammer_upi: str = Field(..., min_length=5, max_length=100)
    scam_type: str = Field(..., min_length=3, max_length=50)
    amount_lost: Optional[float] = None
    description: Optional[str] = None
    incident_date: Optional[datetime] = None
    scammer_phone: Optional[str] = None
    evidence_urls: Optional[List[str]] = []
    is_ongoing: bool = False


class FraudReportResponse(BaseModel):
    """Schema for fraud report response"""
    id: UUID
    scammer_upi: str
    scam_type: str
    amount_lost: Optional[float]
    description: Optional[str]
    incident_date: Optional[datetime]
    
    # Validation
    verification_score: float
    status: str
    
    # Impact
    users_protected: int
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class FraudReportList(BaseModel):
    """Schema for list of fraud reports"""
    reports: List[FraudReportResponse]
    total_count: int


class ScamType(BaseModel):
    """Schema for scam type"""
    id: str
    name: str
    description: str


SCAM_TYPES = [
    ScamType(id="fake_kyc", name="Fake KYC/Bank Call", description="Scammer pretends to be from bank for KYC update"),
    ScamType(id="qr_scam", name="QR Code Scam", description="Scammer sends QR code claiming to send money"),
    ScamType(id="remote_access", name="Remote Access Scam", description="Scammer asks to install AnyDesk/TeamViewer"),
    ScamType(id="lottery", name="Lottery/Prize Scam", description="Fake lottery or prize winning claims"),
    ScamType(id="job_scam", name="Job Scam", description="Fake job offers requiring payment"),
    ScamType(id="loan_scam", name="Loan Scam", description="Fake loan approval requiring fees"),
    ScamType(id="romance_scam", name="Romance Scam", description="Fake relationship for money"),
    ScamType(id="product_scam", name="Product Not Delivered", description="Payment made but product never received"),
    ScamType(id="investment_scam", name="Investment Scam", description="Fake investment schemes"),
    ScamType(id="digital_arrest", name="Digital Arrest Scam", description="Fake police/CBI threatening arrest"),
    ScamType(id="other", name="Other", description="Other types of scam"),
]


class TrendingScam(BaseModel):
    """Schema for trending scam"""
    scam_type: str
    report_count: int
    total_amount_lost: float
    trend: str  # increasing, stable, decreasing
    description: str
    red_flags: List[str]


class CommunityStats(BaseModel):
    """Schema for community fraud statistics"""
    total_reports: int
    verified_reports: int
    total_amount_saved: float
    users_protected: int
    active_scam_upis: int
    trending_scams: List[TrendingScam]
