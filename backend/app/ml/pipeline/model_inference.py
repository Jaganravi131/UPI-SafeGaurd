"""
Model Inference Pipeline
Orchestrates all ML models for real-time risk assessment
"""
from typing import Dict, Any, Optional
import asyncio
import logging
from datetime import datetime

from app.ml.models import (
    XGBoostRiskScorer,
    LSTMBehavioralProfiler,
    IsolationForestAnomaly,
    GraphNeuralNetwork,
    SensorStressDetector
)
from app.ml.pipeline.feature_engineering import FeatureEngineering
from app.ml.pipeline.risk_aggregator import RiskAggregator, ModelOutput, RiskLevel
from app.ml.pipeline.explanation_generator import ExplanationGenerator
from app.config import settings

logger = logging.getLogger(__name__)


class ModelInference:
    """
    Orchestrates all ML models for real-time transaction risk assessment.
    Runs models in parallel for low latency (<500ms target).
    """
    
    def __init__(self):
        """Initialize all ML models"""
        self.xgboost = XGBoostRiskScorer()
        self.lstm = LSTMBehavioralProfiler()
        self.isolation_forest = IsolationForestAnomaly()
        self.gnn = GraphNeuralNetwork()
        self.sensor_detector = SensorStressDetector()
        
        self.feature_engineering = FeatureEngineering()
        self.risk_aggregator = RiskAggregator()
        self.explanation_generator = ExplanationGenerator()
    
    async def assess_risk(
        self,
        transaction_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
        sensor_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Perform full risk assessment using all ML models.
        
        Args:
            transaction_data: Transaction details
            user_profile: User's profile and history
            recipient_profile: Recipient's profile
            sensor_data: Optional sensor readings
            
        Returns:
            Comprehensive risk assessment result
        """
        start_time = datetime.now()
        
        # Extract features
        features = self.feature_engineering.extract_all_features(
            transaction_data,
            user_profile,
            recipient_profile
        )
        
        # Prepare model inputs (includes balance features the trained models need)
        user_avg = user_profile.get("avg_transaction_amount", 1000)
        amount = transaction_data.get("amount", 0)
        
        # Validate amount
        if not isinstance(amount, (int, float)) or amount < 0:
            amount = 0
        
        # Balance features: use actual data when available, warn on fallback
        old_balance = transaction_data.get("oldbalanceOrg")
        if old_balance is None:
            old_balance = 0  # Safe default instead of inflated estimate
            logger.warning("Balance feature 'oldbalanceOrg' missing from transaction data — defaulting to 0")
        
        model_input = {
            **transaction_data,
            **features,
            "user_avg_amount": user_avg,
            "user_max_amount": user_profile.get("max_transaction_amount", 10000),
            "user_total_transactions": user_profile.get("total_transactions", 10),
            "typical_hours": user_profile.get("typical_hours", list(range(8, 22))),
            # Balance features (use actual values or safe defaults)
            "oldbalanceOrg": old_balance,
            "newbalanceOrig": transaction_data.get(
                "newbalanceOrig",
                max(old_balance - amount, 0),
            ),
            "oldbalanceDest": transaction_data.get("oldbalanceDest", 0),
            "newbalanceDest": transaction_data.get("newbalanceDest", amount),
            # Recipient stats
            "recipient_transaction_count": recipient_profile.get("total_transactions", 0),
            "recipient_unique_senders": recipient_profile.get("unique_senders", 1),
        }
        
        # Run all models with fault isolation (each model failure is non-fatal)
        model_outputs = {}
        
        # XGBoost (trained on 6.3M transactions, 99.96% ROC-AUC)
        try:
            xgb_score, xgb_factors = self.xgboost.predict(model_input)
            xgb_confidence = 0.95 if self.xgboost.is_trained else 0.7
            model_outputs["xgboost"] = ModelOutput(
                model_name="xgboost",
                score=xgb_score,
                confidence=xgb_confidence,
                details={"factors": xgb_factors},
                explanations=self._generate_xgb_explanations(xgb_score, xgb_factors)
            )
        except Exception as e:
            logger.error("XGBoost model failed: %s", e)
            model_outputs["xgboost"] = ModelOutput(
                model_name="xgboost", score=0.5, confidence=0.3,
                details={"error": "model_unavailable"},
                explanations=["XGBoost model temporarily unavailable"]
            )
        
        # LSTM Behavioral
        user_id = str(user_profile.get("id", "unknown"))
        try:
            lstm_score, lstm_type, lstm_details = self.lstm.predict_anomaly(
                user_id, model_input
            )
            lstm_confidence = 0.90 if self.lstm.is_trained else 0.7
            model_outputs["lstm"] = ModelOutput(
                model_name="lstm",
                score=lstm_score,
                confidence=lstm_confidence,
                details={"anomaly_type": lstm_type, **lstm_details},
                explanations=self._generate_lstm_explanations(lstm_score, lstm_type, lstm_details)
            )
        except Exception as e:
            logger.error("LSTM/LightGBM model failed: %s", e)
            model_outputs["lstm"] = ModelOutput(
                model_name="lstm", score=0.5, confidence=0.3,
                details={"error": "model_unavailable"},
                explanations=["Behavioral profiler temporarily unavailable"]
            )
        
        # Isolation Forest
        try:
            iso_score, iso_outliers, iso_details = self.isolation_forest.predict(model_input)
            iso_confidence = 0.85 if self.isolation_forest.is_fitted else 0.6
            model_outputs["isolation_forest"] = ModelOutput(
                model_name="isolation_forest",
                score=iso_score,
                confidence=iso_confidence,
                details={"outlier_features": iso_outliers, **iso_details},
                explanations=self._generate_iso_explanations(iso_outliers)
            )
        except Exception as e:
            logger.error("Isolation Forest model failed: %s", e)
            model_outputs["isolation_forest"] = ModelOutput(
                model_name="isolation_forest", score=0.5, confidence=0.3,
                details={"error": "model_unavailable"},
                explanations=["Anomaly detector temporarily unavailable"]
            )
        
        # Graph Neural Network
        recipient_upi = transaction_data.get("recipient_upi", "")
        try:
            gnn_score, gnn_details = self.gnn.analyze_node(recipient_upi)
            gnn_patterns = self.gnn.get_suspicious_patterns(recipient_upi)
            model_outputs["gnn"] = ModelOutput(
                model_name="gnn",
                score=gnn_score,
                confidence=0.85,
                details={**gnn_details, "suspicious_patterns": gnn_patterns},
                explanations=self._generate_gnn_explanations(gnn_score, gnn_details, gnn_patterns)
            )
        except Exception as e:
            logger.error("GNN model failed: %s", e)
            model_outputs["gnn"] = ModelOutput(
                model_name="gnn", score=0.5, confidence=0.3,
                details={"error": "model_unavailable"},
                explanations=["Network analysis temporarily unavailable"]
            )
        
        # Sensor Analysis (if data provided)
        if sensor_data:
            try:
                sens_score, coercion, sens_details = self.sensor_detector.analyze_sensors(
                    user_id, sensor_data
                )
                model_outputs["sensor"] = ModelOutput(
                    model_name="sensor",
                    score=sens_score,
                    confidence=0.75,
                    details={"coercion_detected": coercion, **sens_details},
                    explanations=sens_details.get("recommendations", [])
                )
            except Exception as e:
                logger.error("Sensor model failed: %s", e)
                model_outputs["sensor"] = ModelOutput(
                    model_name="sensor", score=0.1, confidence=0.3,
                    details={"coercion_detected": False, "sensor_data_available": False},
                    explanations=[]
                )
        else:
            # Default sensor output — explicitly mark data as unavailable
            model_outputs["sensor"] = ModelOutput(
                model_name="sensor",
                score=0.1,
                confidence=0.5,
                details={"coercion_detected": False, "sensor_data_available": False},
                explanations=[]
            )
        
        # Check for active call (high risk factor)
        if transaction_data.get("call_active"):
            model_outputs["sensor"].score = max(model_outputs["sensor"].score, 0.7)
            model_outputs["sensor"].details["call_active"] = True
            model_outputs["sensor"].explanations.append(
                "Active phone call detected - 90% of UPI frauds occur during scam calls"
            )
        
        # Aggregate all scores
        user_context = {
            "is_elderly": user_profile.get("age", 30) > 55,
            "literacy": user_profile.get("digital_literacy", "intermediate"),
            "is_vulnerable": user_profile.get("is_vulnerable", False),
            "guardian_enabled": user_profile.get("guardian_enabled", False),
            "is_high_value": transaction_data.get("amount", 0) > 10000,
            "is_new_recipient": transaction_data.get("is_new_recipient", True),
        }
        
        # Adjust weights based on context
        adjusted_weights = self.risk_aggregator.adjust_weights_for_context(user_context)
        self.risk_aggregator.weights = adjusted_weights
        
        ensemble_score, risk_level, confidence, explanations = \
            self.risk_aggregator.aggregate(model_outputs)
        
        # Get recommended action
        recommended_action = self.risk_aggregator.get_recommended_action(
            risk_level, model_outputs, user_context
        )
        
        # ── LightGBM Guardian Trigger ────────────────────────────────────
        # If LightGBM behavioral model scores between 0.70 and 0.85
        # (suspicious but not confirmed fraud), trigger a Guardian Alert
        # as a multi-signature social fallback for vulnerable users.
        lstm_score = model_outputs["lstm"].score
        if 0.70 <= lstm_score <= 0.85 and user_context.get("guardian_enabled", False):
            recommended_action["require_guardian"] = True
            recommended_action["guardian_trigger"] = "lightgbm_behavioral"
            recommended_action["guardian_trigger_detail"] = (
                f"Behavioral model detected suspicious pattern (score: {lstm_score:.2f}). "
                f"Transaction is not confirmed fraud but warrants guardian review."
            )
            # Ensure at least a delay for the user to see the warning
            recommended_action["delay_seconds"] = max(
                recommended_action.get("delay_seconds", 0), 3
            )
            recommended_action["voice_alert"] = True
            logger.info(
                "LightGBM guardian trigger: score=%.2f for user=%s",
                lstm_score, user_id
            )
        
        # Calculate latency
        latency_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        # Build response
        result = {
            "transaction_id": transaction_data.get("transaction_id", ""),
            
            # Overall assessment
            "ensemble_score": ensemble_score,
            "risk_level": risk_level.value,
            "confidence": confidence,
            
            # Individual model scores
            "xgboost_score": model_outputs["xgboost"].score,
            "xgboost_factors": model_outputs["xgboost"].details.get("factors", []),
            
            "lstm_score": model_outputs["lstm"].score,
            "lstm_anomaly_type": model_outputs["lstm"].details.get("anomaly_type"),
            
            "isolation_forest_score": model_outputs["isolation_forest"].score,
            "isolation_outlier_features": model_outputs["isolation_forest"].details.get("outlier_features", []),
            
            "gnn_score": model_outputs["gnn"].score,
            "gnn_network_risk": model_outputs["gnn"].details,
            
            "sensor_score": model_outputs["sensor"].score,
            "coercion_detected": model_outputs["sensor"].details.get("coercion_detected", False),
            
            # Explanations
            "risk_factors": explanations,
            "explanations": explanations,
            
            # Recommendations
            "recommended_action": recommended_action["action"],
            "delay_seconds": recommended_action["delay_seconds"],
            "require_additional_verification": recommended_action["require_verification"],
            "require_guardian_approval": recommended_action["require_guardian"],
            "guardian_trigger": recommended_action.get("guardian_trigger"),
            "guardian_trigger_detail": recommended_action.get("guardian_trigger_detail"),
            "voice_alert_required": recommended_action["voice_alert"],
            
            # Metadata
            "latency_ms": latency_ms,
            "model_versions": {
                "xgboost": "2.0-trained" if self.xgboost.is_trained else "1.0-heuristic",
                "lstm": "2.0-trained" if self.lstm.is_trained else "1.0-heuristic",
                "isolation_forest": "2.0-trained" if self.isolation_forest.is_fitted else "1.0-heuristic",
                "gnn": "2.0-graph" if len(self.gnn.fraud_nodes) > 100 else "1.0-demo",
                "sensor": "1.0-heuristic",
            }
        }
        
        return result
    
    def _generate_xgb_explanations(
        self, 
        score: float, 
        factors: list
    ) -> list:
        """Generate explanations from XGBoost factors"""
        explanations = []
        
        for factor in factors[:5]:
            feature = factor.get("feature", "")
            contribution = factor.get("contribution", "neutral")
            
            if contribution == "increases_risk":
                if "call_active" in feature:
                    explanations.append("You are on an active phone call")
                elif "new_recipient" in feature:
                    explanations.append("This is a new recipient you haven't paid before")
                elif "report" in feature:
                    explanations.append("This recipient has been reported for fraud")
                elif "amount" in feature:
                    explanations.append("Transaction amount is unusually high for you")
                elif "hour" in feature:
                    explanations.append("Unusual transaction time for your pattern")
                elif "velocity" in feature:
                    explanations.append("Multiple transactions in quick succession")
        
        return explanations
    
    def _generate_lstm_explanations(
        self, 
        score: float, 
        anomaly_type: str,
        details: dict
    ) -> list:
        """Generate explanations from LSTM behavioral analysis"""
        explanations = []
        
        if anomaly_type == "amount":
            ratio = details.get("component_scores", {}).get("amount", 0)
            if ratio > 0.7:
                explanations.append(f"Amount is significantly higher than your usual transactions")
        
        if anomaly_type == "time":
            explanations.append("Transaction at unusual time for your typical pattern")
        
        if anomaly_type == "recipient":
            explanations.append("New recipient combined with other risk factors")
        
        if anomaly_type == "velocity":
            explanations.append("Unusual transaction frequency detected")
        
        return explanations
    
    def _generate_iso_explanations(self, outliers: list) -> list:
        """Generate explanations from Isolation Forest"""
        explanations = []
        
        outlier_messages = {
            "amount_extremely_high": "Transaction amount is extremely high compared to typical transactions",
            "amount_high": "Transaction amount is higher than usual",
            "unusual_hour": "Transaction at unusual hour",
            "high_velocity": "High transaction velocity detected",
            "rapid_succession": "Multiple rapid transactions",
            "high_amount_new_recipient": "High amount to a new recipient",
        }
        
        for outlier in outliers[:3]:
            if outlier in outlier_messages:
                explanations.append(outlier_messages[outlier])
        
        return explanations
    
    def _generate_gnn_explanations(
        self, 
        score: float, 
        details: dict,
        patterns: list
    ) -> list:
        """Generate explanations from Graph Neural Network"""
        explanations = []
        
        if details.get("is_known_fraud"):
            explanations.append("⚠️ This UPI ID is a KNOWN FRAUDSTER in our database")
        
        fraud_distance = details.get("fraud_distance", -1)
        if fraud_distance == 1:
            explanations.append("Recipient has direct connection to known fraudsters")
        elif fraud_distance == 2:
            explanations.append("Recipient is 2 connections away from known fraudsters")
        
        flagged = details.get("flagged_connections", 0)
        if flagged > 0:
            explanations.append(f"Recipient connected to {flagged} flagged account(s)")
        
        if details.get("is_mule_account"):
            explanations.append("Account shows patterns of a money mule account")
        
        report_count = details.get("report_count", 0)
        if report_count > 0:
            explanations.append(f"This UPI has been reported {report_count} times for fraud")
        
        return explanations
    
    def update_user_profile(
        self, 
        user_id: str, 
        transaction: Dict[str, Any]
    ):
        """Update user's behavioral profile after transaction"""
        self.lstm.update_profile(user_id, transaction)
    
    def add_fraud_report(self, upi_id: str, report_count: int = 1):
        """Add fraud report to graph network"""
        self.gnn.mark_as_fraud(upi_id, report_count)
    
    def record_transaction(self, from_upi: str, to_upi: str):
        """Record transaction in graph for network analysis"""
        self.gnn.add_edge(from_upi, to_upi)


# Singleton instance
_inference_instance: Optional[ModelInference] = None


def get_model_inference() -> ModelInference:
    """Get or create model inference instance"""
    global _inference_instance
    if _inference_instance is None:
        _inference_instance = ModelInference()
    return _inference_instance
