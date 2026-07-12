from pathlib import Path
import joblib
import pytest

from app.ml.risk_engine import RiskEngine


def test_known_scammer_escalates_to_critical():
    engine = RiskEngine()
    result = engine.assess(
        transaction_data={
            "transaction_id": "t-1",
            "recipient_upi": "fraudster@upi",
            "amount": 5000,
            "hour_of_day": 22,
            "day_of_week": 6,
            "is_new_recipient": True,
            "call_active": True,
        },
        user_profile={
            "avg_transaction_amount": 500,
            "max_transaction_amount": 2000,
            "total_transactions": 2,
            "guardian_enabled": True,
            "guardian_threshold": 2000,
            "is_vulnerable": True,
        },
        recipient_profile={
            "trust_score": 5,
            "report_count": 12,
            "account_age_days": 3,
        },
    )

    assert result["risk_level"] == "critical"
    assert result["recommended_action"] == "block"


def test_normal_transaction_is_low_risk():
    engine = RiskEngine()
    result = engine.assess(
        transaction_data={
            "transaction_id": "t-2",
            "recipient_upi": "friend@upi",
            "amount": 250,
            "hour_of_day": 14,
            "day_of_week": 2,
            "is_new_recipient": False,
            "call_active": False,
        },
        user_profile={
            "avg_transaction_amount": 1500,
            "max_transaction_amount": 3000,
            "total_transactions": 40,
            "guardian_enabled": False,
            "is_vulnerable": False,
        },
        recipient_profile={
            "trust_score": 92,
            "report_count": 0,
            "account_age_days": 400,
        },
    )

    assert result["risk_level"] == "low"
    assert result["recommended_action"] == "proceed"


def test_engine_loads_from_joblib():
    artifact_path = Path(__file__).resolve().parent.parent / "app" / "ml" / "trained_models" / "risk_engine.joblib"
    engine = joblib.load(artifact_path)

    assert isinstance(engine, RiskEngine)
    result = engine.assess(
        transaction_data={
            "transaction_id": "t-3",
            "recipient_upi": "friend@upi",
            "amount": 500,
            "hour_of_day": 13,
            "day_of_week": 1,
            "is_new_recipient": False,
            "call_active": False,
        },
        user_profile={
            "avg_transaction_amount": 1000,
            "max_transaction_amount": 5000,
            "total_transactions": 10,
            "guardian_enabled": False,
            "is_vulnerable": False,
        },
        recipient_profile={
            "trust_score": 90,
            "report_count": 0,
            "account_age_days": 365,
        },
    )

    assert result["risk_level"] in {"low", "medium"}


@pytest.mark.asyncio
async def test_assess_risk_endpoint(db_session, monkeypatch):
    from httpx import AsyncClient
    from app.main import app
    from app.api.deps import get_current_user_id
    from app.db.database import get_db
    from app.db.models import User, UserLiteracy, Wallet

    test_user_id = "12345678-1234-5678-1234-567812345678"
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db

    from app.services.risk_assessment_service import get_risk_assessment_service, RiskAssessmentService
    from app.ml.pipeline.risk_adapter import RiskAdapter
    from app.ml.risk_engine import RiskEngine
    app.dependency_overrides[get_risk_assessment_service] = lambda: RiskAssessmentService(RiskAdapter(RiskEngine()))
    
    user = User(
        id=test_user_id,
        phone_number="+919876543210",
        full_name="Test User",
        email="test@example.com",
        digital_literacy=UserLiteracy.INTERMEDIATE,
        upi_id="test@upisafeguard",
        daily_limit=5000.0,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    wallet = Wallet(user_id=user.id, balance=1000.0, daily_limit=5000.0, daily_spent=0.0)
    db_session.add(wallet)
    await db_session.commit()

    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/transactions/assess-risk",
            json={
                "recipient_upi": "friend@upi",
                "amount": 250.0,
                "purpose": "Dinner",
                "call_active": False,
            }
        )
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 200
    res_data = response.json()
    assert "risk_level" in res_data
    assert "ensemble_score" in res_data
    assert "risk_token" in res_data