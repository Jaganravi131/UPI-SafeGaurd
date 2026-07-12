"""
Risk Assessment Service
Orchestrates ML models for transaction risk assessment
"""
from typing import Dict, Any, Optional
from fastapi import Request

from app.ml.pipeline.risk_adapter import RiskAdapter
from app.db.database import get_mongodb
from app.db.mongodb_models import MLFeaturesDocument


class RiskAssessmentService:
    """Service for assessing transaction risk using ML models"""
    
    def __init__(self, risk_adapter: RiskAdapter):
        self.risk_adapter = risk_adapter
    
    async def assess_transaction(
        self,
        transaction_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        recipient_profile: Dict[str, Any],
        sensor_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Perform comprehensive risk assessment for a transaction.
        
        Args:
            transaction_data: Transaction details (amount, recipient, etc.)
            user_profile: User's profile and behavioral data
            recipient_profile: Recipient's trust and risk profile
            sensor_data: Optional device sensor data
            
        Returns:
            Risk assessment result with scores and recommendations
        """
        # Run engine assessment
        result = self.risk_adapter.assess(
            transaction_data,
            user_profile,
            recipient_profile,
        )
        if sensor_data:
            result["sensor_score"] = float(sensor_data.get("stress_score", result.get("sensor_score", 0.0)))
        
        # Log ML features to MongoDB
        await self._log_ml_features(
            transaction_data.get("transaction_id"),
            str(user_profile.get("id")),
            result
        )
        
        return result
    
    async def _log_ml_features(
        self,
        transaction_id: str,
        user_id: str,
        result: Dict[str, Any]
    ):
        """Log ML features and results to MongoDB"""
        try:
            mongo_db = get_mongodb()
            if mongo_db is None:
                return
            
            doc = MLFeaturesDocument.create(
                transaction_id=transaction_id,
                user_id=user_id,
                features={},  # Would include extracted features
                model_outputs={
                    "isolation_forest": {"score": result.get("isolation_forest_score", 0)},
                    "gnn": {"score": result.get("gnn_score", 0)},
                    "risk_engine": {"score": result.get("ensemble_score", 0)},
                },
                ensemble_score=result.get("ensemble_score", 0),
                risk_level=result.get("risk_level", "low"),
                explanations=result.get("explanations", [])
            )
            
            await mongo_db.ml_features.insert_one(doc)
        except Exception:
            pass  # Log silently fails in demo mode
    
    def update_user_behavior(
        self,
        user_id: str,
        transaction: Dict[str, Any]
    ):
        """Update user's behavioral profile after transaction"""
        self.risk_adapter.engine.update_user_profile(user_id, transaction)
    
    def report_fraud(self, upi_id: str, report_count: int = 1):
        """Add fraud report to graph network"""
        self.risk_adapter.engine.add_fraud_report(upi_id, report_count)
    
    def record_transaction_graph(self, from_upi: str, to_upi: str):
        """Record transaction in graph for network analysis"""
        self.risk_adapter.engine.record_transaction(from_upi, to_upi)
    
    def check_recipient_safety(self, upi_id: str) -> Dict[str, Any]:
        """Quick safety check for a recipient UPI ID"""
        gnn_score, details = self.risk_adapter.engine.gnn.analyze_node(upi_id)
        patterns = self.risk_adapter.engine.gnn.get_suspicious_patterns(upi_id)
        
        # Determine trust level
        if gnn_score > 0.85:
            risk_level = "critical"
            recommendation = "Do not transact with this UPI ID"
        elif gnn_score > 0.6:
            risk_level = "high"
            recommendation = "Exercise extreme caution"
        elif gnn_score > 0.3:
            risk_level = "medium"
            recommendation = "Verify recipient before proceeding"
        else:
            risk_level = "low"
            recommendation = "Transaction appears safe"
        
        return {
            "upi_id": upi_id,
            "network_risk_score": gnn_score,
            "trust_score": (1 - gnn_score) * 100,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "is_known_fraud": details.get("is_known_fraud", False),
            "fraud_distance": details.get("fraud_distance", -1),
            "flagged_connections": details.get("flagged_connections", 0),
            "report_count": details.get("report_count", 0),
            "suspicious_patterns": patterns,
        }


def get_risk_assessment_service(request: Request) -> RiskAssessmentService:
    """FastAPI dependency that resolves the app-state RiskAdapter."""
    risk_adapter = getattr(request.app.state, "risk_adapter", None)
    if risk_adapter is None:
        raise RuntimeError("Risk engine has not been loaded into app state.")
    return RiskAssessmentService(risk_adapter)
