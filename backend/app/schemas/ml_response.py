"""
Pydantic schemas for ML responses
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class RiskAssessmentRequest(BaseModel):
    """Schema for risk assessment request"""
    user_id: str
    transaction_id: str
    recipient_upi: str
    amount: float
    
    # User context
    is_new_recipient: bool = True
    transaction_history: Optional[List[Dict]] = None
    
    # Time context
    hour_of_day: int = Field(default_factory=lambda: datetime.now().hour)
    day_of_week: int = Field(default_factory=lambda: datetime.now().weekday())
    
    # Device context
    device_id: Optional[str] = None
    call_active: bool = False
    
    # Sensor data
    sensor_data: Optional[Dict[str, Any]] = None


class ModelScore(BaseModel):
    """Schema for individual model score"""
    model_name: str
    score: float
    confidence: float
    features_used: List[str]
    explanation: str


class RiskAssessmentResponse(BaseModel):
    """Schema for risk assessment response"""
    transaction_id: str
    
    # Overall assessment
    ensemble_score: float
    risk_level: str  # low, medium, high, critical
    confidence: float
    
    # Individual model scores
    xgboost_score: float
    xgboost_factors: List[Dict[str, Any]]
    
    lstm_score: float
    lstm_anomaly_type: Optional[str]
    
    isolation_forest_score: float
    isolation_outlier_features: List[str]
    
    gnn_score: float
    gnn_network_risk: Dict[str, Any]
    
    sensor_score: Optional[float]
    coercion_detected: bool
    
    # Explanations
    risk_factors: List[str]
    explanations: List[str]
    
    # Recommendations
    recommended_action: str  # proceed, delay, block, guardian_approval
    delay_seconds: int
    require_additional_verification: bool
    voice_alert_required: bool


class FeatureImportance(BaseModel):
    """Schema for feature importance"""
    feature_name: str
    importance: float
    value: Any
    contribution: str  # increases_risk, decreases_risk, neutral


class BehavioralProfile(BaseModel):
    """Schema for user behavioral profile"""
    user_id: str
    
    # Transaction patterns
    avg_transaction_amount: float
    max_transaction_amount: float
    typical_transaction_hours: List[int]
    typical_transaction_days: List[int]
    
    # Recipient patterns
    frequent_recipients: List[str]
    new_recipient_frequency: float
    
    # Velocity
    avg_transactions_per_day: float
    avg_transactions_per_week: float
    
    # Anomaly thresholds
    amount_anomaly_threshold: float
    velocity_anomaly_threshold: float
    
    last_updated: datetime


class SensorAnalysis(BaseModel):
    """Schema for sensor data analysis"""
    session_id: str
    
    # Accelerometer
    tremor_detected: bool
    tremor_magnitude: float
    
    # Typing
    typing_speed_deviation: float
    unusual_pauses: bool
    high_correction_rate: bool
    
    # Touch
    touch_pressure_variance: float
    
    # Overall
    stress_probability: float
    coercion_detected: bool
    confidence: float
    
    recommendation: str


class GraphNetworkAnalysis(BaseModel):
    """Schema for graph network analysis"""
    upi_id: str
    
    # Node metrics
    pagerank: float
    community_id: int
    degree_centrality: float
    
    # Fraud network analysis
    fraud_network_distance: int
    flagged_connections: int
    suspicious_patterns: List[str]
    
    # Risk assessment
    network_risk_score: float
    is_mule_account: bool
    fraud_ring_member: bool
    
    confidence: float
