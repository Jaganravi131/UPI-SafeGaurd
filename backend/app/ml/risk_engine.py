"""Deterministic risk engine used by the rebuilt UPI SafeGuard backend."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.ml.models.graph_neural_network import GraphNeuralNetwork
from app.ml.models.isolation_forest_anomaly import IsolationForestAnomaly


def _risk_level_from_score(score: float) -> str:
    if score >= 0.85:
        return "critical"
    if score >= 0.60:
        return "high"
    if score >= 0.30:
        return "medium"
    return "low"


def _recommended_action(risk_level: str) -> str:
    if risk_level == "critical":
        return "block"
    if risk_level in {"medium", "high"}:
        return "delay"
    return "proceed"


@dataclass
class RiskEngine:
    """Honest risk engine built from deterministic rules plus graph/anomaly signals."""

    version: str = "risk-engine-v1"
    isolation_forest: IsolationForestAnomaly = field(default_factory=IsolationForestAnomaly)
    gnn: GraphNeuralNetwork = field(default_factory=GraphNeuralNetwork)

    def assess(
        self,
        transaction_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
    ) -> Dict[str, Any]:
        amount = float(transaction_data.get("amount", 0) or 0)
        recipient_upi = str(transaction_data.get("recipient_upi", "")).strip().lower()
        hour_of_day = int(transaction_data.get("hour_of_day", 12) or 12)
        day_of_week = int(transaction_data.get("day_of_week", 0) or 0)
        call_active = bool(transaction_data.get("call_active", False))

        user_avg = float(user_profile.get("avg_transaction_amount", 0) or 0)
        user_max = float(user_profile.get("max_transaction_amount", 0) or 0)
        total_transactions = int(user_profile.get("total_transactions", 0) or 0)
        guardian_enabled = bool(user_profile.get("guardian_enabled", False))
        guardian_threshold = float(user_profile.get("guardian_threshold", 5000) or 5000)
        is_vulnerable = bool(user_profile.get("is_vulnerable", False))

        trust_score = float(recipient_profile.get("trust_score", 50) or 50)
        report_count = int(recipient_profile.get("report_count", 0) or 0)
        account_age_days = int(recipient_profile.get("account_age_days", 0) or 0)

        isolation_score, isolation_outliers, isolation_details = self.isolation_forest.predict(transaction_data)
        gnn_score, gnn_details = self.gnn.analyze_node(recipient_upi)
        gnn_patterns = self.gnn.get_suspicious_patterns(recipient_upi)

        known_fraud = bool(gnn_details.get("is_known_fraud", False)) or trust_score <= 15 or report_count >= 5
        hard_rules = []
        if known_fraud:
            hard_rules.append("Recipient is a known or heavily reported scammer")
        if amount >= 25000:
            hard_rules.append("Very large transfer amount")
        if call_active:
            hard_rules.append("Transaction requested during an active call")
        if guardian_enabled and amount >= guardian_threshold:
            hard_rules.append("Above guardian review threshold")

        amount_pressure = min(amount / max(user_avg or amount or 1, 1), 6.0) / 6.0
        balance_pressure = min(amount / max(user_max or amount or 1, 1), 10.0) / 10.0
        novelty_pressure = 1.0 if total_transactions == 0 else (1.0 if transaction_data.get("is_new_recipient", True) else 0.2)
        trust_pressure = 1.0 - min(trust_score / 100.0, 1.0)
        report_pressure = min(report_count / 10.0, 1.0)
        time_pressure = 1.0 if hour_of_day < 6 or hour_of_day > 22 else 0.0
        volatility_pressure = 1.0 if day_of_week in {5, 6} else 0.0

        score = (
            0.34 * max(isolation_score, 0.0)
            + 0.32 * max(gnn_score, 0.0)
            + 0.12 * amount_pressure
            + 0.08 * balance_pressure
            + 0.06 * trust_pressure
            + 0.04 * report_pressure
            + 0.02 * time_pressure
            + 0.02 * volatility_pressure
            + 0.02 * novelty_pressure
        )

        if hard_rules:
            score = max(score, 0.9 if known_fraud else 0.72)
        if call_active:
            score = max(score, 0.7)
        if is_vulnerable and amount >= 10000:
            score = max(score, 0.65)

        score = min(score, 0.99)
        risk_level = _risk_level_from_score(score)
        recommended_action = _recommended_action(risk_level)

        if known_fraud:
            risk_level = "critical"
            recommended_action = "block"

        explanations: List[str] = []
        if known_fraud:
            explanations.append("Recipient is flagged as a known or heavily reported scammer")
        if isolation_outliers:
            explanations.append(f"Anomalous transaction pattern: {', '.join(isolation_outliers[:3])}")
        if gnn_patterns:
            explanations.extend(gnn_patterns[:2])
        if amount_pressure >= 0.5:
            explanations.append("Transfer amount is unusually large for this user")
        if call_active:
            explanations.append("Active call detected during payment")
        if guardian_enabled and amount >= guardian_threshold:
            explanations.append("Guardian review threshold exceeded")

        if not explanations:
            explanations.append("Transaction looks consistent with the user and recipient profiles")

        delay_seconds = 0
        if risk_level == "medium":
            delay_seconds = 2
        elif risk_level == "high":
            delay_seconds = 5
        elif risk_level == "critical":
            delay_seconds = 10

        require_guardian_approval = bool(guardian_enabled and (risk_level in {"high", "critical"} or amount >= guardian_threshold))
        confidence = round(max(0.55, 1.0 - abs(score - 0.5) * 0.7), 2)

        return {
            "transaction_id": transaction_data.get("transaction_id", ""),
            "risk_score": round(score, 4),
            "ensemble_score": round(score, 4),
            "risk_level": risk_level,
            "confidence": confidence,
            "recommended_action": recommended_action,
            "delay_seconds": delay_seconds,
            "require_additional_verification": risk_level in {"medium", "high", "critical"},
            "require_guardian_approval": require_guardian_approval,
            "guardian_trigger": None,
            "guardian_trigger_detail": None,
            "voice_alert_required": call_active,
            "risk_factors": explanations,
            "explanations": explanations,
            "isolation_forest_score": round(float(isolation_score), 4),
            "gnn_score": round(float(gnn_score), 4),
            "sensor_score": 0.0,
            "is_known_fraud": known_fraud,
            "gnn_network_risk": gnn_details,
            "isolation_outlier_features": isolation_outliers,
            "model_versions": {
                "risk_engine": self.version,
                "isolation_forest": "heuristic-compatible",
                "gnn": "heuristic-compatible",
            },
            "details": {
                "hard_rules": hard_rules,
                "isolation_details": isolation_details,
                "gnn_details": gnn_details,
            },
        }
