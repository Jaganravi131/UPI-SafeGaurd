import httpx
import pytest

from app.services.risk_service_client import RiskServiceClient, RiskServiceUnavailable


def _assessment_response(request: httpx.Request) -> httpx.Response:
    assert request.method == "POST"
    assert request.url.path == "/v1/assess"
    return httpx.Response(
        200,
        json={
            "service_version": "risk-service-v1",
            "engine_version": "risk-engine-v1",
            "transaction_id": "client-test-1",
            "risk_level": "low",
            "risk_score": 0.1,
            "recommended_action": "proceed",
            "require_guardian_approval": False,
            "risk_factors": [],
            "confidence": 0.8,
            "model_versions": {"risk_engine": "risk-engine-v1"},
        },
        request=request,
    )


@pytest.mark.asyncio
async def test_risk_service_client_validates_contract():
    client = RiskServiceClient(
        "http://risk-service",
        transport=httpx.MockTransport(_assessment_response),
    )

    result = await client.assess(
        {"transaction_id": "client-test-1", "amount": 300},
        {"id": "user-1"},
        {"trust_score": 90},
    )

    assert result.risk_level == "low"
    assert result.recommended_action == "proceed"


@pytest.mark.asyncio
async def test_risk_service_client_fails_closed_on_http_error():
    def error_response(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, request=request)

    client = RiskServiceClient(
        "http://risk-service",
        transport=httpx.MockTransport(error_response),
    )

    with pytest.raises(RiskServiceUnavailable):
        await client.assess({}, {}, {})
