"""Compatibility wrapper around the new single-engine risk adapter."""
from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any, Dict, Optional

from app.ml.pipeline.risk_adapter import RiskAdapter
from app.ml.risk_engine import RiskEngine


@dataclass
class _BehaviorProfileStore:
    user_profiles: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def _get_or_create_profile(self, user_id: str) -> Dict[str, Any]:
        profile = self.user_profiles.get(user_id)
        if profile is None:
            profile = {
                "user_id": user_id,
                "total_transactions": 0,
                "avg_amount": 0.0,
                "frequent_recipients": {},
                "last_transaction": None,
            }
            self.user_profiles[user_id] = profile
        return profile

    def update_profile(self, user_id: str, transaction: Dict[str, Any]):
        profile = self._get_or_create_profile(user_id)
        amount = float(transaction.get("amount", 0) or 0)
        total = profile["total_transactions"] + 1
        profile["avg_amount"] = ((profile["avg_amount"] * profile["total_transactions"]) + amount) / max(total, 1)
        profile["total_transactions"] = total
        recipient = transaction.get("recipient_upi")
        if recipient:
            profile["frequent_recipients"][recipient] = profile["frequent_recipients"].get(recipient, 0) + 1
        profile["last_transaction"] = transaction


class ModelInference:
    """Backward-compatible facade used by older services."""

    def __init__(self, engine: Optional[RiskEngine] = None):
        self.engine = engine or RiskEngine()
        self.adapter = RiskAdapter(self.engine)
        self.gnn = self.engine.gnn
        self.isolation_forest = self.engine.isolation_forest
        self.lstm = _BehaviorProfileStore()
        self.xgboost = SimpleNamespace(is_trained=False)
        self.sensor_detector = SimpleNamespace()

    async def assess_risk(
        self,
        transaction_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
        sensor_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        result = self.adapter.assess(transaction_data, user_profile, recipient_profile)
        if sensor_data:
            result["sensor_score"] = float(sensor_data.get("stress_score", result.get("sensor_score", 0.0)))
        return result

    def update_user_profile(self, user_id: str, transaction: Dict[str, Any]):
        self.lstm.update_profile(user_id, transaction)

    def add_fraud_report(self, upi_id: str, report_count: int = 1):
        self.gnn.mark_as_fraud(upi_id, report_count)

    def record_transaction(self, from_upi: str, to_upi: str):
        self.gnn.add_edge(from_upi, to_upi)


def get_model_inference(engine: Optional[RiskEngine] = None) -> ModelInference:
    """Compatibility helper that returns a fresh facade instance."""
    return ModelInference(engine=engine)
