"""
Pydantic schemas for Transaction
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


class TransactionCreate(BaseModel):
    """Schema for creating a transaction"""
    recipient_upi: str = Field(..., min_length=5, max_length=100)
    amount: float = Field(..., gt=0, le=500000)
    purpose: Optional[str] = None
    sensor_data: Optional[Dict[str, Any]] = None
    risk_token: Optional[str] = Field(
        None,
        description="Single-use token from /assess-risk to prevent replay attacks"
    )


class TransactionRequest(BaseModel):
    """Schema for transaction risk assessment request"""
    recipient_upi: str
    amount: float
    purpose: Optional[str] = None
    
    # Context
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[Dict[str, float]] = None
    
    # Sensor data
    sensor_data: Optional[Dict[str, Any]] = None
    call_active: bool = False


class TransactionResponse(BaseModel):
    """Schema for transaction response"""
    id: UUID
    recipient_upi: str
    recipient_name: Optional[str]
    amount: float
    purpose: Optional[str]
    status: str
    
    # Risk assessment
    risk_level: str
    risk_score: float
    ml_confidence: Optional[float]
    risk_factors: List[str]
    
    # Individual model scores (5-model ensemble)
    xgboost_score: Optional[float] = None
    lstm_score: Optional[float] = None
    isolation_forest_score: Optional[float] = None
    gnn_score: Optional[float] = None
    sensor_score: Optional[float] = None
    
    # Timing
    created_at: datetime
    completed_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class TransactionHistory(BaseModel):
    """Schema for transaction history"""
    transactions: List[TransactionResponse]
    total_count: int
    page: int
    page_size: int


class RecipientInfo(BaseModel):
    """Schema for recipient information"""
    upi_id: str
    name: Optional[str]
    account_type: str
    trust_score: float
    report_count: int
    is_verified: bool
    risk_level: str
    network_risk: float


class RecipientCheckRequest(BaseModel):
    """Schema for checking recipient safety"""
    upi_id: str


class RecipientCheckResponse(BaseModel):
    """Schema for recipient safety check response"""
    upi_id: str
    name: Optional[str]
    account_type: str
    trust_score: float
    graph_network_score: float
    report_count: int
    total_amount_reported: float
    risk_level: str
    recommendation: str
    confidence: float
    risk_factors: List[str]
