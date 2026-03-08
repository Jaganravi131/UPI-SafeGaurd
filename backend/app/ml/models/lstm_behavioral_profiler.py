"""
Behavioral Profiler Model (LightGBM)
Trained LightGBM model for per-user behavioural deviation detection.
Also maintains runtime per-user profiles for heuristic enrichment.

LightGBM uses leaf-wise tree growth (vs XGBoost's level-wise) to provide
model diversity in the ensemble pipeline.  Uses the full 32-feature set
(same as XGBoost risk scorer) — algorithm diversity alone provides enough
ensemble diversity.  gbdt boosting with sqrt-moderated scale_pos_weight
handles the extreme class imbalance (0.13% fraud) robustly.

Note: Class retains 'LSTMBehavioralProfiler' name for API/import backward
compatibility, but the underlying trained model is LightGBM.
"""
import numpy as np
from typing import Dict, List, Tuple, Any, Optional
import os
import json
import logging
import joblib
from collections import deque

logger = logging.getLogger(__name__)

_TRAINED_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "trained_models", "behavioral_model.joblib"
)
_USER_PROFILES_PATH = os.path.join(
    os.path.dirname(__file__), "..", "trained_models", "user_profiles.json"
)


class LSTMBehavioralProfiler:
    """
    Behavioural anomaly detector.

    - Trained component: LightGBM model trained on full 32-feature set from
      6.3M PaySim transactions.  Uses leaf-wise growth (gbdt) with
      sqrt-moderated scale_pos_weight for robust handling of 0.13% fraud
      class imbalance.  Feature set matches XGBoost risk scorer — algorithm
      diversity (leaf-wise vs level-wise) provides ensemble diversity.
    - Runtime component: Per-user profile that accumulates statistics during
      the session and provides heuristic anomaly scores when the trained model
      is not available.
    """

    SEQUENCE_LENGTH = 50
    FEATURE_DIM = 10

    # Default features — overridden by artifact's feature_names at load time
    TRAINED_FEATURES = [
        "amount_to_avg_ratio", "amount_to_max_ratio",
        "hour_of_day", "is_night", "is_weekend",
        "sender_txn_this_hour", "sender_txn_count",
        "amount_to_orig_ratio", "orig_zero_after", "full_drain",
    ]

    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.scaler = None
        self.is_trained = False
        self.model_type = "lightgbm"  # track underlying model type
        self.feature_names: Optional[List[str]] = None  # loaded from artifact
        self.user_profiles: Dict[str, Dict] = {}
        self._profiles_path = _USER_PROFILES_PATH
        self._save_counter = 0  # batch saves to avoid excessive I/O

        path = model_path or _TRAINED_MODEL_PATH
        if os.path.exists(path):
            self._load_trained_model(path)

        # Restore persisted user profiles from disk
        self._load_persisted_profiles()

    def _load_trained_model(self, path: str):
        data = joblib.load(path)
        self.model = data["model"]
        self.scaler = data["scaler"]
        self.is_trained = data.get("is_trained", True)
        self.model_type = data.get("model_type", "xgboost")  # backward compat
        self.feature_names = data.get("feature_names", self.TRAINED_FEATURES)

    # ── Per-user profile helpers ────────────────────────────────────────────
    def _get_or_create_profile(self, user_id: str) -> Dict:
        if user_id not in self.user_profiles:
            self.user_profiles[user_id] = {
                "transaction_history": deque(maxlen=self.SEQUENCE_LENGTH),
                "avg_amount": 1000.0,
                "max_amount": 10000.0,
                "typical_hours": list(range(8, 22)),
                "typical_days": list(range(5)),
                "frequent_recipients": {},
                "total_transactions": 0,
                "avg_time_between_transactions": 24 * 3600,
            }
        return self.user_profiles[user_id]

    def update_profile(self, user_id: str, transaction: Dict[str, Any]):
        profile = self._get_or_create_profile(user_id)
        amount = transaction.get("amount", 0)
        hour = transaction.get("hour_of_day", 12)
        day = transaction.get("day_of_week", 0)
        recipient = transaction.get("recipient_upi", "")

        n = profile["total_transactions"]
        profile["avg_amount"] = (profile["avg_amount"] * n + amount) / (n + 1)
        profile["max_amount"] = max(profile["max_amount"], amount)
        profile["total_transactions"] = n + 1

        if recipient:
            profile["frequent_recipients"][recipient] = (
                profile["frequent_recipients"].get(recipient, 0) + 1
            )
        if hour not in profile["typical_hours"] and n > 10:
            profile["typical_hours"].append(hour)

        # Persist profiles every 5 updates (batched to reduce I/O)
        self._save_counter += 1
        if self._save_counter >= 5:
            self._persist_profiles()
            self._save_counter = 0

        normalized = {
            "amount_normalized": min(amount / 50000, 1.0),
            "hour_normalized": hour / 24,
            "day_normalized": day / 7,
            "is_new_recipient": 1 if transaction.get("is_new_recipient", True) else 0,
            "time_since_last_normalized": min(
                transaction.get("time_since_last", 3600) / (24 * 3600), 1.0
            ),
            "is_weekend": 1 if day >= 5 else 0,
            "is_night": 1 if hour < 6 or hour > 22 else 0,
            "amount_to_avg_ratio": amount / max(profile["avg_amount"], 1),
            "velocity_score": min(transaction.get("transactions_last_hour", 0) / 5, 1.0),
            "recipient_frequency": min(
                profile["frequent_recipients"].get(recipient, 0) / 10, 1.0
            ),
        }
        profile["transaction_history"].append(normalized)

    # ── Trained-model feature extraction ────────────────────────────────────
    def _extract_trained_features(self, data: Dict[str, Any]) -> np.ndarray:
        """Build feature vector matching the trained model's feature_names.

        Supports both the old 10-feature behavioral set and the new full 32+
        feature set (same as XGBoost risk scorer).  Uses self.feature_names
        loaded from the artifact to determine which features to produce.
        """
        amount = data.get("amount", 0)
        hour   = data.get("hour_of_day", 12)
        day    = data.get("day_of_week", 0)
        avg    = data.get("user_avg_amount", data.get("sender_avg_amount", 1000))
        max_a  = data.get("user_max_amount", 10000)
        old_bo = data.get("oldbalanceOrg", avg)
        new_bo = data.get("newbalanceOrig", old_bo - amount)
        old_bd = data.get("oldbalanceDest", 0)
        new_bd = data.get("newbalanceDest", amount)
        txn_type = data.get("transaction_type", "TRANSFER").upper()

        # Full feature lookup table (superset of all possible features)
        feat_map: Dict[str, float] = {
            "amount":               amount,
            "amount_log":           float(np.log1p(amount)),
            "amount_to_avg_ratio":  min(amount / max(avg, 1), 50),
            "amount_to_max_ratio":  min(amount / max(max_a, 1), 10),
            "is_round_amount":      1.0 if (amount % 1000 == 0 or amount % 500 == 0) else 0.0,
            "hour_of_day":          hour,
            "day_of_week":          day,
            "is_weekend":           1.0 if day >= 5 else 0.0,
            "is_night":             1.0 if (hour < 6 or hour > 22) else 0.0,
            "is_late_night":        1.0 if (hour >= 23 or hour < 2) else 0.0,
            "hour_sin":             float(np.sin(2 * np.pi * hour / 24)),
            "hour_cos":             float(np.cos(2 * np.pi * hour / 24)),
            "day_sin":              float(np.sin(2 * np.pi * day / 7)),
            "day_cos":              float(np.cos(2 * np.pi * day / 7)),
            "balance_orig_log":     float(np.log1p(max(old_bo, 0))),
            "balance_dest_log":     float(np.log1p(max(old_bd, 0))),
            "balance_delta_orig":   new_bo - old_bo,
            "balance_delta_dest":   new_bd - old_bd,
            "amount_to_orig_ratio": min(amount / max(old_bo, 1), 100),
            "amount_to_dest_ratio": min(amount / max(old_bd, 1), 100),
            "orig_zero_after":      1.0 if new_bo == 0 else 0.0,
            "full_drain":           1.0 if (new_bo == 0 and old_bo > 0) else 0.0,
            "sender_txn_this_hour": data.get("transactions_last_hour", 0),
            "sender_txn_count":     data.get("user_total_transactions", 10),
            "recv_txn_count":       data.get("recipient_transaction_count", 0),
            "recv_unique_senders":  data.get("recipient_unique_senders", 1),
            "sender_avg_amount":    avg,
        }
        # Type one-hot dummies
        for t in ["CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER"]:
            feat_map[f"type_{t}"] = 1.0 if txn_type == t else 0.0

        names = self.feature_names or self.TRAINED_FEATURES
        vec = [feat_map.get(f, 0.0) for f in names]
        return np.array(vec, dtype=np.float32).reshape(1, -1)

    # ── Main prediction ────────────────────────────────────────────────────
    def predict_anomaly(
        self, user_id: str, transaction: Dict[str, Any]
    ) -> Tuple[float, str, Dict[str, Any]]:
        """
        Returns: (anomaly_score, anomaly_type, details)
        """
        profile = self._get_or_create_profile(user_id)

        # ── Trained model path ──
        if self.is_trained and self.model is not None:
            features = self._extract_trained_features(transaction)
            features_scaled = self.scaler.transform(features)
            ml_score = float(self.model.predict_proba(features_scaled)[0][1])
        else:
            ml_score = None

        # ── Heuristic component scores (always computed for explanations) ──
        amount_anomaly = self._check_amount_anomaly(transaction, profile)
        time_anomaly = self._check_time_anomaly(transaction, profile)
        recipient_anomaly = self._check_recipient_anomaly(transaction, profile)
        velocity_anomaly = self._check_velocity_anomaly(transaction, profile)

        component = {
            "amount": amount_anomaly,
            "time": time_anomaly,
            "recipient": recipient_anomaly,
            "velocity": velocity_anomaly,
        }
        weights = {"amount": 0.35, "time": 0.2, "recipient": 0.25, "velocity": 0.2}
        heuristic_score = sum(s * weights[k] for k, s in component.items())

        # Blend trained + heuristic (trained gets 70% weight when available)
        if ml_score is not None:
            total_score = 0.7 * ml_score + 0.3 * heuristic_score
        else:
            total_score = heuristic_score

        max_component = max(component.items(), key=lambda x: x[1])
        anomaly_type = max_component[0] if max_component[1] > 0.5 else "none"

        details = {
            "component_scores": component,
            "ml_score": ml_score,
            "heuristic_score": heuristic_score,
            "user_avg_amount": profile["avg_amount"],
            "user_max_amount": profile["max_amount"],
            "typical_hours": profile["typical_hours"],
            "total_transactions": profile["total_transactions"],
            "is_frequent_recipient": self._is_frequent_recipient(
                transaction.get("recipient_upi", ""), profile
            ),
        }
        return total_score, anomaly_type, details

    # ── Heuristic components ────────────────────────────────────────────────
    def _check_amount_anomaly(self, txn: Dict, profile: Dict) -> float:
        amount = txn.get("amount", 0)
        avg = profile["avg_amount"]
        if profile["total_transactions"] < 5:
            return min(amount / 50000, 0.5)
        if avg > 0:
            ratio = amount / avg
            if ratio > 5:
                return 0.9
            if ratio > 3:
                return 0.7
            if ratio > 2:
                return 0.5
            if ratio > 1.5:
                return 0.3
        if amount > profile["max_amount"] * 1.5:
            return 0.6
        return 0.1

    def _check_time_anomaly(self, txn: Dict, profile: Dict) -> float:
        hour = txn.get("hour_of_day", 12)
        day = txn.get("day_of_week", 0)
        score = 0.1
        if hour < 6 or hour > 23:
            score += 0.4
        if hour not in profile["typical_hours"]:
            score += 0.2
        if day >= 5 and 5 not in profile["typical_days"] and 6 not in profile["typical_days"]:
            score += 0.15
        return min(score, 1.0)

    def _check_recipient_anomaly(self, txn: Dict, profile: Dict) -> float:
        if not txn.get("is_new_recipient", True):
            return 0.1
        amount = txn.get("amount", 0)
        if amount > profile["avg_amount"] * 2:
            return 0.8
        if amount > profile["avg_amount"]:
            return 0.5
        return 0.3

    def _check_velocity_anomaly(self, txn: Dict, profile: Dict) -> float:
        score = 0.1
        txn_h = txn.get("transactions_last_hour", 0)
        tsl = txn.get("time_since_last", 3600)
        if txn_h > 5:
            score += 0.5
        elif txn_h > 3:
            score += 0.3
        if tsl < 60:
            score += 0.4
        elif tsl < 300:
            score += 0.2
        return min(score, 1.0)

    def _is_frequent_recipient(self, recipient: str, profile: Dict) -> bool:
        return profile["frequent_recipients"].get(recipient, 0) >= 3

    # ── Info / persistence ──────────────────────────────────────────────────
    def get_user_profile_summary(self, user_id: str) -> Dict[str, Any]:
        profile = self._get_or_create_profile(user_id)
        return {
            "user_id": user_id,
            "avg_transaction_amount": profile["avg_amount"],
            "max_transaction_amount": profile["max_amount"],
            "typical_transaction_hours": profile["typical_hours"],
            "total_transactions": profile["total_transactions"],
            "frequent_recipients": list(profile["frequent_recipients"].keys())[:10],
        }

    def save_model(self, path: str):
        joblib.dump({"user_profiles": dict(self.user_profiles)}, path)

    def load_model(self, path: str):
        data = joblib.load(path)
        for uid, prof in data.get("user_profiles", {}).items():
            prof["transaction_history"] = deque(
                prof["transaction_history"], maxlen=self.SEQUENCE_LENGTH
            )
        self.user_profiles = data.get("user_profiles", {})

    # ── Disk persistence (JSON) ────────────────────────────────────────────
    def _persist_profiles(self):
        """Save user profiles to a JSON file so they survive server restarts."""
        try:
            serialisable = {}
            for uid, prof in self.user_profiles.items():
                serialisable[uid] = {
                    "avg_amount": prof["avg_amount"],
                    "max_amount": prof["max_amount"],
                    "typical_hours": prof["typical_hours"],
                    "typical_days": prof["typical_days"],
                    "frequent_recipients": prof["frequent_recipients"],
                    "total_transactions": prof["total_transactions"],
                    "avg_time_between_transactions": prof["avg_time_between_transactions"],
                    # deque → list for JSON
                    "transaction_history": list(prof["transaction_history"]),
                }
            os.makedirs(os.path.dirname(self._profiles_path), exist_ok=True)
            with open(self._profiles_path, "w") as f:
                json.dump(serialisable, f)
            logger.debug("Persisted %d user profiles to disk", len(serialisable))
        except Exception as exc:
            logger.warning("Failed to persist user profiles: %s", exc)

    def _load_persisted_profiles(self):
        """Load previously persisted user profiles from disk."""
        if not os.path.exists(self._profiles_path):
            return
        try:
            with open(self._profiles_path, "r") as f:
                data = json.load(f)
            for uid, prof in data.items():
                prof["transaction_history"] = deque(
                    prof.get("transaction_history", []),
                    maxlen=self.SEQUENCE_LENGTH,
                )
                if "typical_days" not in prof:
                    prof["typical_days"] = list(range(5))
                if "avg_time_between_transactions" not in prof:
                    prof["avg_time_between_transactions"] = 24 * 3600
                self.user_profiles[uid] = prof
            logger.info("Loaded %d persisted user profiles from disk", len(data))
        except Exception as exc:
            logger.warning("Failed to load persisted user profiles: %s", exc)
