"""Adapter that exposes the new RiskEngine through the pipeline package."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from app.ml.risk_engine import RiskEngine


@dataclass
class RiskAdapter:
    engine: RiskEngine

    def assess(
        self,
        transaction_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
    ) -> Dict[str, Any]:
        result = self.engine.assess(transaction_data, user_profile, recipient_profile)
        result.setdefault("risk_score", result.get("ensemble_score", 0.0))
        result.setdefault("recommended_action", "proceed")
        result.setdefault("require_guardian_approval", False)
        result.setdefault("risk_factors", [])
        return result
