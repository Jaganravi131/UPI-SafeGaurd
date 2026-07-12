"""
MongoDB schemas for behavioral logs and ML features
"""
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any


# Behavioral Log Schema
behavioral_log_schema = {
    "user_id": str,
    "timestamp": datetime,
    "transaction_id": str,
    
    # Transaction context
    "amount": float,
    "recipient_upi": str,
    "is_new_recipient": bool,
    
    # Time features
    "hour_of_day": int,
    "day_of_week": int,
    "is_weekend": bool,
    
    # Behavioral features
    "time_since_last_transaction": float,
    "transactions_in_last_hour": int,
    "transactions_in_last_day": int,
    
    # Device context
    "device_id": str,
    "ip_address": str,
    "location": dict,  # {lat, lon}
    
    # Sensor data
    "sensor_data": dict,  # {accelerometer, typing_speed, etc.}
    
    # Risk assessment
    "risk_score": float,
    "risk_factors": list,
}

# ML Features Cache Schema
ml_features_schema = {
    "transaction_id": str,
    "user_id": str,
    "timestamp": datetime,
    
    # Extracted features (25+)
    "features": dict,
    
    # Model outputs
    "xgboost_output": dict,
    "lstm_output": dict,
    "isolation_forest_output": dict,
    "gnn_output": dict,
    "sensor_output": dict,
    
    # Aggregated result
    "ensemble_score": float,
    "risk_level": str,
    "explanations": list,
}

# Fraud Graph Node Schema
fraud_graph_node_schema = {
    "upi_id": str,
    "node_type": str,  # user, merchant, mule, fraudster
    
    # Graph metrics
    "pagerank": float,
    "community_id": int,
    "degree_centrality": float,
    "fraud_network_distance": int,  # Distance to nearest known fraudster
    
    # Connections
    "connections": list,  # List of connected UPI IDs
    "flagged_connections": int,
    
    # Transaction patterns
    "total_transactions": int,
    "total_amount": float,
    "avg_transaction_amount": float,
    "unique_senders": int,
    "unique_receivers": int,
    
    "last_updated": datetime,
}

# Sensor Data Schema
sensor_data_schema = {
    "session_id": str,
    "user_id": str,
    "timestamp": datetime,
    
    # Accelerometer data
    "accelerometer": {
        "x_mean": float,
        "y_mean": float,
        "z_mean": float,
        "x_std": float,
        "y_std": float,
        "z_std": float,
        "magnitude_mean": float,
        "magnitude_std": float,
    },
    
    # Typing patterns
    "typing": {
        "speed_cps": float,  # characters per second
        "inter_key_mean": float,
        "inter_key_std": float,
        "backspace_ratio": float,
        "pause_count": int,
    },
    
    # Touch patterns
    "touch": {
        "pressure_mean": float,
        "pressure_std": float,
        "touch_area_mean": float,
    },
    
    # ML output
    "stress_probability": float,
    "coercion_detected": bool,
}


class BehavioralLogDocument:
    """Helper class for behavioral log documents"""
    
    @staticmethod
    def create(
        user_id: str,
        transaction_id: str,
        amount: float,
        recipient_upi: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Create a behavioral log document"""
        return {
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc),
            "transaction_id": transaction_id,
            "amount": amount,
            "recipient_upi": recipient_upi,
            "is_new_recipient": kwargs.get("is_new_recipient", True),
            "hour_of_day": datetime.now(timezone.utc).hour,
            "day_of_week": datetime.now(timezone.utc).weekday(),
            "is_weekend": datetime.now(timezone.utc).weekday() >= 5,
            "time_since_last_transaction": kwargs.get("time_since_last", 0),
            "transactions_in_last_hour": kwargs.get("txn_last_hour", 0),
            "transactions_in_last_day": kwargs.get("txn_last_day", 0),
            "device_id": kwargs.get("device_id"),
            "ip_address": kwargs.get("ip_address"),
            "location": kwargs.get("location", {}),
            "sensor_data": kwargs.get("sensor_data", {}),
            "risk_score": kwargs.get("risk_score", 0.0),
            "risk_factors": kwargs.get("risk_factors", []),
        }


class MLFeaturesDocument:
    """Helper class for ML features documents"""
    
    @staticmethod
    def create(
        transaction_id: str,
        user_id: str,
        features: Dict[str, float],
        model_outputs: Dict[str, Any],
        ensemble_score: float,
        risk_level: str,
        explanations: List[str]
    ) -> Dict[str, Any]:
        """Create an ML features document"""
        return {
            "transaction_id": transaction_id,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc),
            "features": features,
            "xgboost_output": model_outputs.get("xgboost", {}),
            "lstm_output": model_outputs.get("lstm", {}),
            "isolation_forest_output": model_outputs.get("isolation_forest", {}),
            "gnn_output": model_outputs.get("gnn", {}),
            "sensor_output": model_outputs.get("sensor", {}),
            "ensemble_score": ensemble_score,
            "risk_level": risk_level,
            "explanations": explanations,
        }
