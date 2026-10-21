from fastapi.testclient import TestClient

from ai_service.main import app


def test_ai_service_assess_contract_returns_risk_level():
    with TestClient(app) as client:
        response = client.post(
            "/v1/assess",
            json={
                "transaction": {
                    "transaction_id": "test-transaction",
                    "recipient_upi": "merchant@upi",
                    "amount": 300,
                    "hour_of_day": 12,
                    "day_of_week": 2,
                    "is_new_recipient": False,
                },
                "user_profile": {
                    "id": "test-user",
                    "avg_transaction_amount": 500,
                    "max_transaction_amount": 1000,
                    "total_transactions": 10,
                },
                "recipient_profile": {
                    "trust_score": 90,
                    "report_count": 0,
                    "account_age_days": 365,
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transaction_id"] == "test-transaction"
    assert payload["risk_level"] in {"low", "medium", "high", "critical"}
    assert payload["service_version"] == "risk-service-v1"
    assert payload["engine_version"] == "risk-engine-v1"
    assert "model_score" in payload
    assert "rules_applied" in payload


def test_ai_service_model_info_is_explicit_about_runtime_models():
    with TestClient(app) as client:
        response = client.get("/v1/model-info")

    assert response.status_code == 200
    payload = response.json()
    assert payload["primary_model"] in {"xgboost-unavailable", "xgboost-paysim-v1"}
    assert payload["live_graph_model"] is False
