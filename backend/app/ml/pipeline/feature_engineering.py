"""
Feature Engineering Pipeline
Extracts and engineers features from transaction data for ML models
"""
import numpy as np
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta


class FeatureEngineering:
    """
    Feature engineering pipeline for transaction risk assessment.
    Extracts 25+ features from transaction and user context.
    """
    
    def __init__(self):
        self.feature_names = []
    
    def extract_all_features(
        self,
        transaction: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
        transaction_history: Optional[List[Dict]] = None
    ) -> Dict[str, float]:
        """
        Extract all features for ML models.
        
        Args:
            transaction: Current transaction data
            user_profile: User's profile and statistics
            recipient_profile: Recipient's profile from database
            transaction_history: Recent transaction history
            
        Returns:
            Dictionary of feature name to value
        """
        features = {}
        
        # Amount features
        features.update(self._extract_amount_features(
            transaction, user_profile
        ))
        
        # Time features
        features.update(self._extract_time_features(
            transaction, user_profile
        ))
        
        # Velocity features
        features.update(self._extract_velocity_features(
            transaction, transaction_history or []
        ))
        
        # Recipient features
        features.update(self._extract_recipient_features(
            transaction, recipient_profile, user_profile
        ))
        
        # User features
        features.update(self._extract_user_features(user_profile))
        
        # Context features
        features.update(self._extract_context_features(transaction))
        
        self.feature_names = list(features.keys())
        return features
    
    def _extract_amount_features(
        self,
        transaction: Dict[str, Any],
        user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """Extract amount-related features"""
        amount = float(transaction.get("amount", 0))
        user_avg = float(user_profile.get("avg_transaction_amount", 1000))
        user_max = float(user_profile.get("max_transaction_amount", 10000))
        old_bal_orig = float(transaction.get("oldbalanceOrg", user_avg * 5))
        new_bal_orig = float(transaction.get("newbalanceOrig", max(old_bal_orig - amount, 0)))
        old_bal_dest = float(transaction.get("oldbalanceDest", 0))
        new_bal_dest = float(transaction.get("newbalanceDest", amount))
        
        return {
            "amount": amount,
            "amount_log": np.log1p(amount),
            "amount_to_avg_ratio": min(amount / max(user_avg, 1), 50),
            "amount_to_max_ratio": min(amount / max(user_max, 1), 10),
            "is_round_amount": 1.0 if (amount % 1000 == 0 or amount % 500 == 0) else 0.0,
            "is_high_value": 1.0 if amount > 10000 else 0.0,
            "is_very_high_value": 1.0 if amount > 50000 else 0.0,
            "amount_zscore": (amount - user_avg) / max(user_profile.get("amount_std", 1000), 1),
            # Balance features (critical for trained models)
            "balance_orig_log": np.log1p(max(old_bal_orig, 0)),
            "balance_dest_log": np.log1p(max(old_bal_dest, 0)),
            "balance_delta_orig": float(new_bal_orig - old_bal_orig),
            "balance_delta_dest": float(new_bal_dest - old_bal_dest),
            "amount_to_orig_ratio": min(amount / max(old_bal_orig, 1), 100),
            "amount_to_dest_ratio": min(amount / max(old_bal_dest, 1), 100),
            "orig_zero_after": 1.0 if new_bal_orig == 0 else 0.0,
            "full_drain": 1.0 if (new_bal_orig == 0 and old_bal_orig > 0) else 0.0,
        }
    
    def _extract_time_features(
        self,
        transaction: Dict[str, Any],
        user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """Extract time-related features"""
        hour = transaction.get("hour_of_day", datetime.now().hour)
        day = transaction.get("day_of_week", datetime.now().weekday())
        typical_hours = user_profile.get("typical_hours", list(range(8, 22)))
        
        return {
            "hour_of_day": hour,
            "hour_sin": np.sin(2 * np.pi * hour / 24),
            "hour_cos": np.cos(2 * np.pi * hour / 24),
            "day_of_week": day,
            "day_sin": np.sin(2 * np.pi * day / 7),
            "day_cos": np.cos(2 * np.pi * day / 7),
            "is_weekend": 1.0 if day >= 5 else 0.0,
            "is_night_transaction": 1.0 if (hour < 6 or hour > 22) else 0.0,
            "is_unusual_hour": 1.0 if hour not in typical_hours else 0.0,
            "is_early_morning": 1.0 if hour < 6 else 0.0,
            "is_late_night": 1.0 if hour >= 23 or hour < 2 else 0.0,
        }
    
    def _extract_velocity_features(
        self,
        transaction: Dict[str, Any],
        transaction_history: List[Dict]
    ) -> Dict[str, float]:
        """Extract velocity-related features"""
        now = datetime.now()
        
        # Count transactions in time windows
        txn_last_hour = transaction.get("transactions_last_hour", 0)
        txn_last_day = transaction.get("transactions_last_day", 0)
        
        # Amount in time windows
        amount_last_hour = transaction.get("amount_last_hour", 0)
        amount_last_day = transaction.get("amount_last_day", 0)
        
        # Time since last transaction
        time_since_last = transaction.get("time_since_last_transaction", 24 * 3600)
        
        return {
            "transactions_last_hour": txn_last_hour,
            "transactions_last_day": txn_last_day,
            "amount_last_hour": amount_last_hour,
            "amount_last_hour_log": np.log1p(amount_last_hour),
            "amount_last_day": amount_last_day,
            "amount_last_day_log": np.log1p(amount_last_day),
            "time_since_last_transaction": time_since_last,
            "time_since_last_log": np.log1p(time_since_last),
            "is_rapid_succession": 1.0 if time_since_last < 300 else 0.0,
            "velocity_score": min(txn_last_hour / 5, 1.0),
            "amount_velocity_ratio": float(transaction.get("amount", 0)) / max(amount_last_hour, 1),
        }
    
    def _extract_recipient_features(
        self,
        transaction: Dict[str, Any],
        recipient_profile: Dict[str, Any],
        user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """Extract recipient-related features"""
        is_new = transaction.get("is_new_recipient", True)
        recipient_upi = transaction.get("recipient_upi", "")
        
        # Get from recipient profile
        trust_score = recipient_profile.get("trust_score", 50)
        report_count = recipient_profile.get("report_count", 0)
        account_age = recipient_profile.get("account_age_days", 0)
        total_transactions = recipient_profile.get("total_transactions", 0)
        
        # Check if frequent recipient
        frequent_recipients = user_profile.get("frequent_recipients", [])
        is_frequent = recipient_upi in frequent_recipients
        
        return {
            "is_new_recipient": 1.0 if is_new else 0.0,
            "is_frequent_recipient": 1.0 if is_frequent else 0.0,
            "recipient_trust_score": trust_score,
            "recipient_trust_normalized": trust_score / 100,
            "recipient_report_count": report_count,
            "recipient_has_reports": 1.0 if report_count > 0 else 0.0,
            "recipient_account_age_days": account_age,
            "recipient_account_age_log": np.log1p(account_age),
            "recipient_total_transactions": total_transactions,
            "recipient_is_new_account": 1.0 if account_age < 30 else 0.0,
            "recipient_is_suspicious": 1.0 if (report_count > 0 and trust_score < 30) else 0.0,
        }
    
    def _extract_user_features(
        self,
        user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """Extract user-related features"""
        literacy_map = {"beginner": 0.2, "intermediate": 0.5, "advanced": 0.8}
        literacy = user_profile.get("digital_literacy", "intermediate")
        
        return {
            "user_age_days": user_profile.get("account_age_days", 30),
            "user_age_log": np.log1p(user_profile.get("account_age_days", 30)),
            "user_security_score": user_profile.get("security_score", 50),
            "user_security_normalized": user_profile.get("security_score", 50) / 100,
            "user_literacy_score": literacy_map.get(literacy, 0.5),
            "user_total_transactions": user_profile.get("total_transactions", 0),
            "user_total_transactions_log": np.log1p(user_profile.get("total_transactions", 0)),
            "user_is_new": 1.0 if user_profile.get("account_age_days", 30) < 30 else 0.0,
            "user_is_elderly": 1.0 if user_profile.get("age", 30) > 55 else 0.0,
            "user_is_vulnerable": 1.0 if (
                user_profile.get("age", 30) > 55 or literacy == "beginner"
            ) else 0.0,
        }
    
    def _extract_context_features(
        self,
        transaction: Dict[str, Any]
    ) -> Dict[str, float]:
        """Extract context-related features"""
        return {
            "call_active": 1.0 if transaction.get("call_active", False) else 0.0,
            "coercion_indicators": transaction.get("coercion_score", 0.0),
            "device_is_known": 1.0 if transaction.get("device_is_known", True) else 0.0,
            "location_is_usual": 1.0 if transaction.get("location_is_usual", True) else 0.0,
        }
    
    def get_feature_vector(self, features: Dict[str, float]) -> np.ndarray:
        """Convert feature dict to numpy array"""
        return np.array([features[name] for name in sorted(features.keys())])
    
    def get_feature_names(self) -> List[str]:
        """Get list of feature names"""
        return self.feature_names
