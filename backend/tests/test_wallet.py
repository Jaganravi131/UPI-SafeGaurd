from dataclasses import dataclass

import pytest
from sqlalchemy import select

from app.api.routes import transaction as transaction_routes
from app.db.models import Transaction, TransactionStatus, User, UserLiteracy, Wallet
from app.schemas import TransactionCreate


@dataclass
class FakeRiskService:
    result: dict

    async def assess_transaction(self, *args, **kwargs):
        return self.result

    def record_transaction_graph(self, *args, **kwargs):
        return None


@pytest.mark.asyncio
async def test_create_transaction_debits_wallet_atomically(db_session, monkeypatch):
    user = User(
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

    fake_service = FakeRiskService(
        result={
            "recommended_action": "allow",
            "require_guardian_approval": False,
            "risk_level": "low",
            "ensemble_score": 0.12,
            "risk_factors": ["low-risk test"],
            "delay_seconds": 0,
            "confidence": 0.98,
            "xgboost_score": 0.05,
            "lstm_score": 0.06,
            "isolation_forest_score": 0.07,
            "gnn_score": 0.08,
            "sensor_score": 0.01,
        }
    )
    monkeypatch.setattr(transaction_routes, "get_risk_assessment_service", lambda: fake_service)

    response = await transaction_routes.create_transaction(
        TransactionCreate(recipient_upi="merchant@upi", amount=300.0, purpose="Dinner"),
        db=db_session,
        user_id=str(user.id),
    )

    assert response.status == TransactionStatus.COMPLETED.value
    assert response.amount == 300.0

    refreshed_wallet = (await db_session.execute(select(Wallet).where(Wallet.user_id == user.id))).scalar_one()
    assert float(refreshed_wallet.balance) == 700.0
    assert float(refreshed_wallet.daily_spent) == 300.0

    transaction_count = (await db_session.execute(select(Transaction).where(Transaction.user_id == user.id))).scalars().all()
    assert len(transaction_count) == 1
    assert transaction_count[0].status == TransactionStatus.COMPLETED


@pytest.mark.asyncio
async def test_blocked_transaction_does_not_debit_wallet(db_session, monkeypatch):
    user = User(
        phone_number="+919876543211",
        full_name="Blocked User",
        email="blocked@example.com",
        digital_literacy=UserLiteracy.INTERMEDIATE,
        upi_id="blocked@upisafeguard",
        daily_limit=5000.0,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    wallet = Wallet(user_id=user.id, balance=1000.0, daily_limit=5000.0, daily_spent=0.0)
    db_session.add(wallet)
    await db_session.commit()

    fake_service = FakeRiskService(
        result={
            "recommended_action": "block",
            "require_guardian_approval": False,
            "risk_level": "critical",
            "ensemble_score": 0.99,
            "risk_factors": ["known scammer"],
            "delay_seconds": 0,
            "confidence": 0.99,
            "xgboost_score": 0.95,
            "lstm_score": 0.96,
            "isolation_forest_score": 0.97,
            "gnn_score": 0.98,
            "sensor_score": 0.94,
        }
    )
    monkeypatch.setattr(transaction_routes, "get_risk_assessment_service", lambda: fake_service)

    response = await transaction_routes.create_transaction(
        TransactionCreate(recipient_upi="scam@upi", amount=300.0, purpose="Fraud attempt"),
        db=db_session,
        user_id=str(user.id),
    )

    assert response.status == TransactionStatus.BLOCKED.value

    refreshed_wallet = (await db_session.execute(select(Wallet).where(Wallet.user_id == user.id))).scalar_one()
    assert float(refreshed_wallet.balance) == 1000.0
    assert float(refreshed_wallet.daily_spent) == 0.0

    transactions = (await db_session.execute(select(Transaction).where(Transaction.user_id == user.id))).scalars().all()
    assert len(transactions) == 1
    assert transactions[0].status == TransactionStatus.BLOCKED
