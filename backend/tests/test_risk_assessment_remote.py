import pytest

from app.services.risk_assessment_service import RiskAssessmentService
from app.services.risk_service_client import RiskServiceResult


class FakeAdapter:
    def assess(self, *args, **kwargs):
        return {
            "risk_level": "low",
            "risk_score": 0.1,
            "ensemble_score": 0.1,
            "recommended_action": "proceed",
            "require_guardian_approval": False,
            "risk_factors": ["local assessment"],
            "confidence": 0.8,
        }


class FakeRemoteClient:
    async def assess(self, *args, **kwargs):
        return RiskServiceResult(
            service_version="risk-service-v1",
            engine_version="risk-engine-v1",
            transaction_id="remote-1",
            risk_level="critical",
            risk_score=0.95,
            recommended_action="block",
            require_guardian_approval=False,
            risk_factors=["remote known scammer signal"],
            confidence=0.99,
            model_versions={"risk_engine": "risk-engine-v1"},
        )


@pytest.mark.asyncio
async def test_remote_mode_normalizes_ai_contract():
    service = RiskAssessmentService(
        FakeAdapter(),
        remote_client=FakeRemoteClient(),
        use_remote=True,
    )

    result = await service.assess_transaction(
        {"transaction_id": "remote-1", "amount": 300},
        {"id": "user-1"},
        {"trust_score": 10},
    )

    assert result["risk_level"] == "critical"
    assert result["ensemble_score"] == 0.95
    assert result["recommended_action"] == "block"
    assert result["explanations"] == result["risk_factors"]


@pytest.mark.asyncio
async def test_local_mode_remains_default():
    service = RiskAssessmentService(FakeAdapter())

    result = await service.assess_transaction(
        {"transaction_id": "local-1", "amount": 300},
        {"id": "user-1"},
        {"trust_score": 90},
    )

    assert result["risk_level"] == "low"
    assert result["ensemble_score"] == 0.1
