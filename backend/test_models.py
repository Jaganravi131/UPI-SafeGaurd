"""
Quick smoke test: load all trained models and run inference on sample transactions.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "."))

from app.ml.models import (
    XGBoostRiskScorer,
    LSTMBehavioralProfiler,
    IsolationForestAnomaly,
    GraphNeuralNetwork,
    SensorStressDetector,
)
from app.ml.pipeline.feature_engineering import FeatureEngineering
from app.ml.pipeline.model_inference import ModelInference
import asyncio

def test_individual_models():
    print("=" * 60)
    print("  SMOKE TEST: Individual Model Loading")
    print("=" * 60)

    # XGBoost
    xgb = XGBoostRiskScorer()
    print(f"  XGBoost loaded: is_trained={xgb.is_trained}, features={len(xgb.feature_names)}")
    score, factors = xgb.predict({"amount": 50000, "hour_of_day": 2, "oldbalanceOrg": 50000, "newbalanceOrig": 0})
    print(f"  XGBoost predict (50K, 2am, drains account): score={score:.4f}")
    score2, _ = xgb.predict({"amount": 500, "hour_of_day": 14, "oldbalanceOrg": 100000, "newbalanceOrig": 99500})
    print(f"  XGBoost predict (500, 2pm, normal):          score={score2:.4f}")

    # Isolation Forest
    iso = IsolationForestAnomaly()
    print(f"\n  IsolationForest loaded: is_fitted={iso.is_fitted}, global_avg={iso.global_avg_amount:,.0f}")
    score, outliers, details = iso.predict({"amount": 500000, "hour_of_day": 3, "oldbalanceOrg": 500000, "newbalanceOrig": 0})
    print(f"  IF predict (500K, 3am, drain): anomaly={score:.4f}, outliers={outliers}")
    score2, _, _ = iso.predict({"amount": 1000, "hour_of_day": 14, "oldbalanceOrg": 100000, "newbalanceOrig": 99000})
    print(f"  IF predict (1K, 2pm, normal):  anomaly={score2:.4f}")

    # LSTM/Behavioral
    lstm = LSTMBehavioralProfiler()
    print(f"\n  Behavioral loaded: is_trained={lstm.is_trained}")
    score, atype, details = lstm.predict_anomaly("user1", {"amount": 50000, "hour_of_day": 2, "oldbalanceOrg": 50000, "newbalanceOrig": 0})
    print(f"  Behavioral predict (50K, 2am, drain): score={score:.4f}, type={atype}")
    score2, _, _ = lstm.predict_anomaly("user1", {"amount": 500, "hour_of_day": 14, "oldbalanceOrg": 100000, "newbalanceOrig": 99500})
    print(f"  Behavioral predict (500, 2pm, normal): score={score2:.4f}")

    # GNN
    gnn = GraphNeuralNetwork()
    print(f"\n  GNN loaded: nodes={len(gnn.node_stats):,}, fraud_nodes={len(gnn.fraud_nodes):,}")
    # Test with a known fraud node from training
    if gnn.fraud_nodes:
        fraud_sample = list(gnn.fraud_nodes)[0]
        score, details = gnn.analyze_node(fraud_sample)
        print(f"  GNN analyze (known fraud '{fraud_sample[:20]}...'): score={score:.4f}")
    score, details = gnn.analyze_node("random_safe_user@upi")
    print(f"  GNN analyze (unknown user): score={score:.4f}")

    # Sensor (unchanged - still heuristic)
    sensor = SensorStressDetector()
    print(f"\n  Sensor loaded (heuristic): OK")


async def test_full_pipeline():
    print("\n" + "=" * 60)
    print("  SMOKE TEST: Full Inference Pipeline")
    print("=" * 60)

    inference = ModelInference()
    print(f"  XGBoost trained: {inference.xgboost.is_trained}")
    print(f"  LSTM trained:    {inference.lstm.is_trained}")
    print(f"  IF fitted:       {inference.isolation_forest.is_fitted}")
    print(f"  GNN nodes:       {len(inference.gnn.fraud_nodes):,} fraud nodes")

    # High-risk transaction
    result = await inference.assess_risk(
        transaction_data={
            "transaction_id": "test-001",
            "amount": 100000,
            "recipient_upi": "unknown@upi",
            "hour_of_day": 2,
            "day_of_week": 6,
            "is_new_recipient": True,
            "call_active": True,
            "transaction_type": "TRANSFER",
            "oldbalanceOrg": 100000,
            "newbalanceOrig": 0,
            "oldbalanceDest": 0,
            "newbalanceDest": 100000,
        },
        user_profile={
            "id": "user-test",
            "avg_transaction_amount": 2000,
            "max_transaction_amount": 10000,
            "total_transactions": 50,
            "typical_hours": list(range(8, 22)),
            "security_score": 50,
            "digital_literacy": "beginner",
            "age": 62,
        },
        recipient_profile={
            "trust_score": 10,
            "report_count": 3,
            "account_age_days": 5,
            "total_transactions": 2,
            "unique_senders": 1,
        },
    )

    print(f"\n  HIGH-RISK Transaction:")
    print(f"    Ensemble score: {result['ensemble_score']:.4f}")
    print(f"    Risk level:     {result['risk_level']}")
    print(f"    XGBoost:        {result['xgboost_score']:.4f}")
    print(f"    LSTM:           {result['lstm_score']:.4f}")
    print(f"    IsoForest:      {result['isolation_forest_score']:.4f}")
    print(f"    GNN:            {result['gnn_score']:.4f}")
    print(f"    Sensor:         {result['sensor_score']:.4f}")
    print(f"    Action:         {result['recommended_action']}")
    print(f"    Latency:        {result['latency_ms']:.0f}ms")
    print(f"    Model versions: {result['model_versions']}")
    print(f"    Explanations:   {result['explanations'][:3]}")

    # Low-risk transaction
    result2 = await inference.assess_risk(
        transaction_data={
            "transaction_id": "test-002",
            "amount": 500,
            "recipient_upi": "friend@upi",
            "hour_of_day": 14,
            "day_of_week": 2,
            "is_new_recipient": False,
            "call_active": False,
            "transaction_type": "PAYMENT",
            "oldbalanceOrg": 50000,
            "newbalanceOrig": 49500,
            "oldbalanceDest": 10000,
            "newbalanceDest": 10500,
        },
        user_profile={
            "id": "user-test",
            "avg_transaction_amount": 1000,
            "max_transaction_amount": 5000,
            "total_transactions": 200,
            "typical_hours": list(range(8, 22)),
            "security_score": 85,
            "digital_literacy": "advanced",
            "age": 30,
        },
        recipient_profile={
            "trust_score": 90,
            "report_count": 0,
            "account_age_days": 365,
            "total_transactions": 500,
            "unique_senders": 50,
        },
    )

    print(f"\n  LOW-RISK Transaction:")
    print(f"    Ensemble score: {result2['ensemble_score']:.4f}")
    print(f"    Risk level:     {result2['risk_level']}")
    print(f"    XGBoost:        {result2['xgboost_score']:.4f}")
    print(f"    LSTM:           {result2['lstm_score']:.4f}")
    print(f"    IsoForest:      {result2['isolation_forest_score']:.4f}")
    print(f"    GNN:            {result2['gnn_score']:.4f}")
    print(f"    Action:         {result2['recommended_action']}")
    print(f"    Latency:        {result2['latency_ms']:.0f}ms")

    # Verify the trained model discriminates well
    assert result["ensemble_score"] > result2["ensemble_score"], \
        "High-risk should score higher than low-risk!"
    print(f"\n  ✓ Discrimination check passed: {result['ensemble_score']:.4f} > {result2['ensemble_score']:.4f}")


if __name__ == "__main__":
    test_individual_models()
    asyncio.run(test_full_pipeline())
    print("\n" + "=" * 60)
    print("  ALL SMOKE TESTS PASSED ✓")
    print("=" * 60)
