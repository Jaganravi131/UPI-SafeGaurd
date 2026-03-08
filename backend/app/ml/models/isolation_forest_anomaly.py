"""
Isolation Forest Anomaly Detection Model
Trained on PaySim data for unsupervised outlier detection
"""
import numpy as np
from typing import Dict, List, Tuple, Any, Optional
import os
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib

_TRAINED_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "trained_models", "isolation_forest.joblib"
)


class IsolationForestAnomaly:
    """
    Isolation Forest anomaly detection trained on 6.3M PaySim transactions.
    Detects statistical outliers without requiring labels.
    """

    FEATURE_NAMES = [
        "amount_log", "amount_to_avg_ratio",
        "hour_sin", "hour_cos", "day_sin", "day_cos",
        "is_round_amount",
        "sender_txn_this_hour",
        "amount_to_orig_ratio", "amount_to_dest_ratio",
        "orig_zero_after", "full_drain",
    ]

    def __init__(self, model_path: Optional[str] = None):
        self.model: Optional[IsolationForest] = None
        self.scaler = StandardScaler()
        self.global_avg_amount = 2500.0
        self.is_fitted = False

        path = model_path or _TRAINED_MODEL_PATH
        if os.path.exists(path):
            self.load_model(path)
        else:
            self._initialize_default_model()

    # ── Feature extraction ──────────────────────────────────────────────────
    def extract_features(self, data: Dict[str, Any]) -> np.ndarray:
        """Build the same feature vector used during training."""
        amount = data.get("amount", 1000)
        hour = data.get("hour_of_day", 12)
        day = data.get("day_of_week", 0)
        avg_amount = data.get("user_avg_amount", data.get("sender_avg_amount", 1000))
        old_bal_orig = data.get("oldbalanceOrg", avg_amount)
        new_bal_orig = data.get("newbalanceOrig", old_bal_orig - amount)
        old_bal_dest = data.get("oldbalanceDest", 0)

        features = [
            np.log1p(amount),                                       # amount_log
            min(amount / max(avg_amount, 1), 50),                   # amount_to_avg_ratio
            np.sin(2 * np.pi * hour / 24),                          # hour_sin
            np.cos(2 * np.pi * hour / 24),                          # hour_cos
            np.sin(2 * np.pi * day / 7),                             # day_sin
            np.cos(2 * np.pi * day / 7),                             # day_cos
            1 if (amount % 1000 == 0 or amount % 500 == 0) else 0,  # is_round_amount
            data.get("transactions_last_hour", 0),                   # sender_txn_this_hour
            min(amount / max(old_bal_orig, 1), 100),                 # amount_to_orig_ratio
            min(amount / max(old_bal_dest, 1), 100),                 # amount_to_dest_ratio
            1 if new_bal_orig == 0 else 0,                           # orig_zero_after
            1 if (new_bal_orig == 0 and old_bal_orig > 0) else 0,    # full_drain
        ]
        return np.array(features, dtype=np.float32).reshape(1, -1)

    # ── Predict ─────────────────────────────────────────────────────────────
    def predict(
        self, transaction_data: Dict[str, Any]
    ) -> Tuple[float, List[str], Dict[str, Any]]:
        """
        Predict anomaly score.
        Returns: (anomaly_score 0-1, outlier_feature_names, details)
        """
        features = self.extract_features(transaction_data)
        features_scaled = self.scaler.transform(features)

        raw_score = self.model.decision_function(features_scaled)[0]
        # Sigmoid: negative → outlier → high anomaly
        anomaly_score = float(1 / (1 + np.exp(raw_score * 2)))

        outlier_features = self._identify_outlier_features(
            transaction_data, features[0]
        )

        details = {
            "raw_isolation_score": float(raw_score),
            "normalized_score": anomaly_score,
            "feature_values": {
                name: float(features[0][i])
                for i, name in enumerate(self.FEATURE_NAMES)
            },
        }
        return anomaly_score, outlier_features, details

    def _identify_outlier_features(
        self, data: Dict[str, Any], features: np.ndarray
    ) -> List[str]:
        outliers = []
        amount = data.get("amount", 0)

        if amount > self.global_avg_amount * 5:
            outliers.append("amount_extremely_high")
        elif amount > self.global_avg_amount * 2:
            outliers.append("amount_high")

        hour = data.get("hour_of_day", 12)
        if hour < 5 or hour > 23:
            outliers.append("unusual_hour")

        velocity = data.get("transactions_last_hour", 0)
        if velocity > 5:
            outliers.append("high_velocity")

        time_since = data.get("time_since_last", 3600)
        if time_since < 60:
            outliers.append("rapid_succession")

        if data.get("is_new_recipient", True) and amount > self.global_avg_amount * 2:
            outliers.append("high_amount_new_recipient")

        # Balance-drain detection
        old_bal = data.get("oldbalanceOrg", 0)
        new_bal = data.get("newbalanceOrig", old_bal - amount)
        if new_bal == 0 and old_bal > 0:
            outliers.append("account_drain")

        return outliers

    # ── Persistence ─────────────────────────────────────────────────────────
    def _initialize_default_model(self):
        self.model = IsolationForest(
            n_estimators=100, contamination=0.1,
            max_samples="auto", random_state=42, n_jobs=-1,
        )
        np.random.seed(42)
        synthetic = np.random.rand(1000, len(self.FEATURE_NAMES))
        self.scaler.fit(synthetic)
        self.model.fit(self.scaler.transform(synthetic))
        self.is_fitted = True

    def fit(self, X: np.ndarray):
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled)
        self.is_fitted = True

    def update_global_average(self, new_avg: float):
        self.global_avg_amount = new_avg

    def save_model(self, path: str):
        joblib.dump({
            "model": self.model, "scaler": self.scaler,
            "global_avg_amount": self.global_avg_amount,
            "is_fitted": self.is_fitted,
        }, path)

    def load_model(self, path: str):
        data = joblib.load(path)
        self.model = data["model"]
        self.scaler = data["scaler"]
        self.global_avg_amount = data.get("global_avg_amount", 2500.0)
        self.is_fitted = data.get("is_fitted", True)
