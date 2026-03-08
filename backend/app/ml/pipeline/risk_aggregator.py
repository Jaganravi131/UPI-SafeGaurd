"""
Risk Aggregator
Combines scores from multiple ML models into ensemble risk score
"""
from typing import Dict, List, Any, Tuple
from dataclasses import dataclass
from enum import Enum


class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ModelOutput:
    """Container for individual model output"""
    model_name: str
    score: float
    confidence: float
    details: Dict[str, Any]
    explanations: List[str]


class RiskAggregator:
    """
    Aggregates risk scores from multiple ML models
    using weighted ensemble approach.
    """
    
    # Default weights for each model
    DEFAULT_WEIGHTS = {
        "xgboost": 0.30,      # Primary risk classifier
        "lstm": 0.25,         # Behavioral anomaly
        "isolation_forest": 0.15,  # Statistical anomaly
        "gnn": 0.20,          # Network/graph risk
        "sensor": 0.10,       # Coercion detection
    }
    
    # Risk level thresholds
    THRESHOLDS = {
        "low": 0.3,
        "medium": 0.6,
        "high": 0.85,
    }
    
    def __init__(self, weights: Dict[str, float] = None):
        """Initialize with custom or default weights"""
        self.weights = weights or self.DEFAULT_WEIGHTS
        self._normalize_weights()
    
    def _normalize_weights(self):
        """Ensure weights sum to 1"""
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}
    
    def aggregate(
        self,
        model_outputs: Dict[str, ModelOutput]
    ) -> Tuple[float, RiskLevel, float, List[str]]:
        """
        Aggregate model outputs into ensemble score.
        
        Args:
            model_outputs: Dictionary of model name to ModelOutput
            
        Returns:
            Tuple of (ensemble_score, risk_level, confidence, explanations)
        """
        weighted_score = 0.0
        weighted_confidence = 0.0
        total_weight = 0.0
        all_explanations = []
        
        for model_name, output in model_outputs.items():
            weight = self.weights.get(model_name, 0.1)
            
            # Weight the score by model weight, use confidence separately
            weighted_score += output.score * weight
            weighted_confidence += output.confidence * weight
            total_weight += weight
            
            # Collect explanations from high-scoring models
            if output.score > 0.4:
                all_explanations.extend(output.explanations)
        
        # Normalize
        if total_weight > 0:
            ensemble_score = weighted_score / total_weight
        else:
            ensemble_score = 0.5
        
        # Determine risk level
        risk_level = self._determine_risk_level(ensemble_score, model_outputs)
        
        # Calculate overall confidence
        confidence = min(weighted_confidence, 1.0)
        
        # Deduplicate and prioritize explanations
        explanations = self._prioritize_explanations(all_explanations, ensemble_score)
        
        return ensemble_score, risk_level, confidence, explanations
    
    def _determine_risk_level(
        self,
        score: float,
        model_outputs: Dict[str, ModelOutput]
    ) -> RiskLevel:
        """Determine risk level with special case handling"""
        
        # Check for critical indicators that override ensemble
        gnn_output = model_outputs.get("gnn")
        if gnn_output and gnn_output.details.get("is_known_fraud"):
            return RiskLevel.CRITICAL
        
        sensor_output = model_outputs.get("sensor")
        if sensor_output and sensor_output.details.get("coercion_detected"):
            return RiskLevel.HIGH
        
        # Standard threshold-based classification
        if score >= self.THRESHOLDS["high"]:
            return RiskLevel.CRITICAL
        elif score >= self.THRESHOLDS["medium"]:
            return RiskLevel.HIGH
        elif score >= self.THRESHOLDS["low"]:
            return RiskLevel.MEDIUM
        else:
            return RiskLevel.LOW
    
    def _prioritize_explanations(
        self,
        explanations: List[str],
        score: float
    ) -> List[str]:
        """Prioritize and deduplicate explanations"""
        # Remove duplicates while preserving order
        seen = set()
        unique = []
        for exp in explanations:
            exp_lower = exp.lower()
            if exp_lower not in seen:
                seen.add(exp_lower)
                unique.append(exp)
        
        # Sort by severity keywords
        severity_keywords = [
            "fraud", "scam", "blocked", "critical",
            "high risk", "reported", "suspicious",
            "unusual", "anomaly", "warning"
        ]
        
        def severity_score(exp: str) -> int:
            exp_lower = exp.lower()
            return sum(1 for kw in severity_keywords if kw in exp_lower)
        
        unique.sort(key=severity_score, reverse=True)
        
        # Limit to top explanations
        max_explanations = 5 if score > 0.6 else 3
        return unique[:max_explanations]
    
    def get_recommended_action(
        self,
        risk_level: RiskLevel,
        model_outputs: Dict[str, ModelOutput],
        user_context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Get recommended action based on risk assessment.
        
        Returns:
            Dictionary with action details
        """
        user_context = user_context or {}
        
        actions = {
            RiskLevel.LOW: {
                "action": "proceed",
                "delay_seconds": 0,
                "require_verification": False,
                "require_guardian": False,
                "voice_alert": False,
                "show_warnings": False,
            },
            RiskLevel.MEDIUM: {
                "action": "delay",
                "delay_seconds": 2,
                "require_verification": False,
                "require_guardian": False,
                "voice_alert": user_context.get("is_vulnerable", False),
                "show_warnings": True,
            },
            RiskLevel.HIGH: {
                "action": "delay",
                "delay_seconds": 5,
                "require_verification": True,
                "require_guardian": user_context.get("guardian_enabled", False),
                "voice_alert": True,
                "show_warnings": True,
            },
            RiskLevel.CRITICAL: {
                "action": "block",
                "delay_seconds": 10,
                "require_verification": True,
                "require_guardian": True,
                "voice_alert": True,
                "show_warnings": True,
            },
        }
        
        action = actions[risk_level].copy()
        
        # Adjust for call active
        sensor_output = model_outputs.get("sensor")
        if sensor_output:
            if sensor_output.details.get("call_active"):
                action["action"] = "block"
                action["delay_seconds"] = max(action["delay_seconds"], 10)
                action["voice_alert"] = True
            
            if sensor_output.details.get("coercion_detected"):
                action["show_coercion_help"] = True
        
        return action
    
    def adjust_weights_for_context(
        self,
        user_context: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Dynamically adjust weights based on user context.
        
        Args:
            user_context: User's context and profile
            
        Returns:
            Adjusted weights dictionary
        """
        weights = self.weights.copy()
        
        # Increase sensor weight for elderly/vulnerable users
        if user_context.get("is_elderly") or user_context.get("literacy") == "beginner":
            weights["sensor"] = weights.get("sensor", 0.1) * 1.5
        
        # Increase GNN weight for high-value transactions
        if user_context.get("is_high_value"):
            weights["gnn"] = weights.get("gnn", 0.2) * 1.3
        
        # Increase LSTM weight for new recipients
        if user_context.get("is_new_recipient"):
            weights["lstm"] = weights.get("lstm", 0.25) * 1.2
        
        # Normalize
        total = sum(weights.values())
        return {k: v / total for k, v in weights.items()}
