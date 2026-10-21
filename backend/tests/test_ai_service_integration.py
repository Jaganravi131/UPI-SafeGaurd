import os

import httpx
import pytest

from app.services.risk_service_client import RiskServiceClient


@pytest.mark.asyncio
async def test_running_ai_service_http_contract():
    """Run with RUN_AI_SERVICE_INTEGRATION=1 and the AI service on port 8001."""
    if os.getenv("RUN_AI_SERVICE_INTEGRATION") != "1":
        pytest.skip("Set RUN_AI_SERVICE_INTEGRATION=1 to test a running AI service")

    client = RiskServiceClient("http://127.0.0.1:8001")
    result = await client.assess(
        {
            "transaction_id": "http-integration-1",
            "recipient_upi": "merchant@upi",
            "amount": 300,
            "hour_of_day": 12,
            "day_of_week": 2,
            "is_new_recipient": False,
        },
        {
            "id": "integration-user",
            "avg_transaction_amount": 500,
            "max_transaction_amount": 1000,
            "total_transactions": 10,
        },
        {
            "trust_score": 90,
            "report_count": 0,
            "account_age_days": 365,
        },
    )

    assert result.transaction_id == "http-integration-1"
    assert result.risk_level in {"low", "medium", "high", "critical"}
    assert result.service_version == "risk-service-v1"
