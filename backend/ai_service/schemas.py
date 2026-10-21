"""Stable HTTP contract for the standalone Python AI service."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RiskAssessmentRequest(BaseModel):
    """Input sent by a future Spring Boot core backend."""

    transaction: Dict[str, Any] = Field(default_factory=dict)
    user_profile: Dict[str, Any] = Field(default_factory=dict)
    recipient_profile: Dict[str, Any] = Field(default_factory=dict)


class RiskAssessmentResponse(BaseModel):
    """Small, versioned response used by callers instead of engine internals."""

    service_version: str
    engine_version: str
    transaction_id: str
    risk_level: str
    risk_score: float
    recommended_action: str
    require_guardian_approval: bool
    risk_factors: List[str]
    confidence: float
    model_versions: Dict[str, str]
    feature_schema_version: str
    model_score: float = 0.0
    rules_applied: List[str] = Field(default_factory=list)
    details: Optional[Dict[str, Any]] = None
