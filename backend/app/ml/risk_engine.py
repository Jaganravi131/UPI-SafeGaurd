"""Deterministic risk engine used by the rebuilt UPI SafeGuard backend."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np

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
    """Risk engine built from XGBoost plus deterministic guardrails."""

    version: str = "risk-engine-v1"
    isolation_forest: IsolationForestAnomaly = field(default_factory=IsolationForestAnomaly)
    model: Any = None
    scaler: Any = None
    feature_names: List[str] = field(default_factory=list)
    model_version: str = "xgboost-unavailable"
    feature_engineering: Any = None
    reported_upis: set[str] = field(default_factory=set)
    # Calibration: Platt scaling parameters (A, B) for probability calibration
    calibration_A: float = 1.0
    calibration_B: float = 0.0
    # Feature schema version for contract compatibility
    feature_schema_version: str = "features-v1"

    def __post_init__(self) -> None:
        if self.feature_engineering is None:
            from app.ml.pipeline.feature_engineering import FeatureEngineering
            self.feature_engineering = FeatureEngineering()

    def __setstate__(self, state: Dict[str, Any]) -> None:
        """Keep previously persisted rule-engine artifacts loadable."""
        self.__dict__.update(state)
        self.__dict__.setdefault("version", "risk-engine-v1")
        self.__dict__.setdefault("isolation_forest", IsolationForestAnomaly())
        self.__dict__.setdefault("model", None)
        self.__dict__.setdefault("scaler", None)
        self.__dict__.setdefault("feature_names", [])
        self.__dict__.setdefault("model_version", "xgboost-unavailable")
        self.__dict__.setdefault("feature_engineering", None)
        self.__dict__.setdefault("reported_upis", set())
        self.__dict__.setdefault("calibration_A", 1.0)
        self.__dict__.setdefault("calibration_B", 0.0)
        self.__dict__.setdefault("feature_schema_version", "features-v1")
        self.__post_init__()

    @classmethod
    def from_artifact(cls, artifact_path: Optional[Path] = None) -> "RiskEngine":
        """Load a trained XGBoost artifact, falling back to deterministic rules."""
        path = artifact_path or (
            Path(__file__).resolve().parent / "trained_models" / "risk_model.joblib"
        )
        if not path.exists():
            return cls()

        loaded = joblib.load(path)
        if not isinstance(loaded, dict) or loaded.get("model_type") != "xgboost":
            raise ValueError("Risk model artifact must be an xgboost artifact dictionary")
        return cls(
            model=loaded["model"],
            scaler=loaded.get("scaler"),
            feature_names=list(loaded.get("feature_names", [])),
            model_version=str(loaded.get("model_version", "xgboost")),
            calibration_A=loaded.get("calibration_A", 1.0),
            calibration_B=loaded.get("calibration_B", 0.0),
            feature_schema_version=loaded.get("feature_schema_version", "features-v1"),
        )

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
        model_score = self._predict_model(transaction_data, user_profile, recipient_profile)
        known_fraud = (
            recipient_upi in self.reported_upis
            or trust_score <= 15
            or report_count >= 5
        )
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
        # New recipients carry moderate risk, known recipients are largely
        # trusted, and a brand-new user is an unknown baseline rather than
        # maximum suspicion.
        if total_transactions == 0:
            novelty_pressure = 0.5
        elif transaction_data.get("is_new_recipient", True):
            novelty_pressure = 0.6
        else:
            novelty_pressure = 0.2
        trust_pressure = 1.0 - min(trust_score / 100.0, 1.0)
        report_pressure = min(report_count / 10.0, 1.0)
        # Prefer the user's own observed activity hours: paying inside the
        # hours they normally transact is not suspicious by default.
        typical_hours = user_profile.get("typical_hours") or []
        try:
            typical_hours = {int(h) for h in typical_hours}
        except (TypeError, ValueError):
            typical_hours = set()
        if typical_hours:
            time_pressure = 0.0 if hour_of_day in typical_hours else 0.6
        else:
            # No history yet: fall back to Nagarik-style late-night flag.
            time_pressure = 1.0 if hour_of_day < 6 or hour_of_day > 22 else 0.0
        volatility_pressure = 1.0 if day_of_week in {5, 6} else 0.0

        score = model_score if model_score is not None else (
            0.35 * max(isolation_score, 0.0)
            + 0.20 * amount_pressure
            + 0.15 * balance_pressure
            + 0.12 * trust_pressure
            + 0.08 * report_pressure
            + 0.05 * time_pressure
            + 0.03 * volatility_pressure
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

        # Calibrate score using Platt scaling (if model is available and calibration params set)
        if self.model is not None and self.calibration_A != 1.0:
            # LogisticRegression fits P(fraud) = 1 / (1 + exp(-(A*score + B)));
            # the negation is required, otherwise the score is inverted and
            # actual fraud would calibrate to a "safe" probability.
            calibrated_score = 1.0 / (1.0 + np.exp(-(self.calibration_A * score + self.calibration_B)))
        else:
            calibrated_score = score
        
        # Confidence based on calibrated score distance from decision boundary
        confidence = round(max(0.55, 1.0 - abs(calibrated_score - 0.5) * 0.7), 2)

        return {
            "transaction_id": transaction_data.get("transaction_id", ""),
            "risk_score": round(calibrated_score, 4),
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
            "is_known_fraud": known_fraud,
            "isolation_outlier_features": isolation_outliers,
            "model_versions": {
                "risk_engine": self.version,
                "primary_model": self.model_version,
                "isolation_forest": "isolation-forest-v1",
            },
            "feature_schema_version": self.feature_schema_version,
            "details": {
                "hard_rules": hard_rules,
                "isolation_details": isolation_details,
            },
        }

    def _predict_model(
        self,
        transaction_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
    ) -> Optional[float]:
        if self.model is None or not self.feature_names:
            return None
        features = self.feature_engineering.extract_all_features(
            transaction_data, user_profile, recipient_profile
        )
        values = np.asarray(
            [[features.get(name, 0.0) for name in self.feature_names]],
            dtype=np.float32,
        )
        if self.scaler is not None:
            values = self.scaler.transform(values)
        return float(np.clip(self.model.predict_proba(values)[0, 1], 0.0, 0.99))

    def add_fraud_report(self, upi_id: str, report_count: int = 1) -> None:
        if report_count > 0:
            self.reported_upis.add(upi_id.strip().lower())

    def record_transaction(self, from_upi: str, to_upi: str) -> None:
        """Retained as a compatibility hook; transactions are not graph state."""
        return None

    def calibrate(self, X_val: np.ndarray, y_val: np.ndarray) -> None:
        """
        Fit Platt scaling calibration on validation data.
        
        Platt scaling fits a logistic regression on the model's output scores:
        P(y=1|x) = 1 / (1 + exp(A * score + B))
        
        Args:
            X_val: Validation features
            y_val: Validation labels (0 or 1)
        """
        if self.model is None or self.scaler is None:
            return
        
        X_val_scaled = self.scaler.transform(X_val.astype(np.float32))
        scores = self.model.predict_proba(X_val_scaled)[:, 1]
        
        # Fit logistic regression on scores
        from sklearn.linear_model import LogisticRegression
        lr = LogisticRegression(solver='lbfgs', max_iter=1000)
        lr.fit(scores.reshape(-1, 1), y_val)
        
        self.calibration_A = float(lr.coef_[0, 0])
        self.calibration_B = float(lr.intercept_[0])
        
        # Ensure calibration improves calibration (not overfit)
        # Same convention as the inference path: P = 1 / (1 + exp(-(A*score + B))).
        calibrated = 1.0 / (1.0 + np.exp(-(self.calibration_A * scores + self.calibration_B)))
        from sklearn.metrics import log_loss
        original_loss = log_loss(y_val, np.clip(scores, 1e-15, 1-1e-15))
        calibrated_loss = log_loss(y_val, np.clip(calibrated, 1e-15, 1-1e-15))
        
        if calibrated_loss >= original_loss:
            # Calibration didn't help, reset to identity
            self.calibration_A = 1.0
            self.calibration_B = 0.0

    def set_calibration(self, A: float, B: float) -> None:
        """Manually set Platt scaling parameters."""
        self.calibration_A = A
        self.calibration_B = B
