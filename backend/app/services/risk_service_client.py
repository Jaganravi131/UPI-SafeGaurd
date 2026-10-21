"""HTTP client for the standalone Python AI risk service."""
from typing import Any, Dict, Optional

import httpx
from pydantic import BaseModel, Field


class RiskServiceUnavailable(RuntimeError):
    """Raised when the AI service cannot provide a risk assessment."""


class RiskServiceResult(BaseModel):
    service_version: str
    engine_version: str
    transaction_id: str
    risk_level: str
    risk_score: float
    recommended_action: str
    require_guardian_approval: bool
    risk_factors: list[str] = Field(default_factory=list)
    confidence: float
    model_score: float = 0.0
    rules_applied: list[str] = Field(default_factory=list)
    model_versions: Dict[str, str] = Field(default_factory=dict)
    details: Optional[Dict[str, Any]] = None


class RiskServiceClient:
    """Small core-backend client for the versioned AI service contract."""

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 3.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(timeout_seconds)
        self.transport = transport

    async def assess(
        self,
        transaction: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
    ) -> RiskServiceResult:
        payload = {
            "transaction": transaction,
            "user_profile": user_profile,
            "recipient_profile": recipient_profile,
        }

        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                transport=self.transport,
            ) as client:
                response = await client.post("/v1/assess", json=payload)
                response.raise_for_status()
                return RiskServiceResult.model_validate(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise RiskServiceUnavailable("AI risk service did not return a valid assessment") from exc
