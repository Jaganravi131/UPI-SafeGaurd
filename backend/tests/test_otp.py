from datetime import datetime, timedelta, timezone

import pytest

from app.services import otp as otp_service


@pytest.fixture(autouse=True)
def clear_otp_store():
    otp_service.otp_store.clear()
    yield
    otp_service.otp_store.clear()


def test_request_and_verify_otp(monkeypatch):
    monkeypatch.setattr(otp_service, "_send_email_otp", lambda recipient_email, otp: True)

    result = otp_service.request_otp("+919876543210", recipient_email="user@example.com")
    assert result["success"] is True
    assert result["delivery_method"] == "email"

    stored = otp_service.otp_store["+919876543210"]
    assert stored["recipient_email"] == "user@example.com"

    ok, message = otp_service.verify_otp("+919876543210", stored["code"])
    assert ok is True
    assert message == "OTP verified"
    assert "+919876543210" not in otp_service.otp_store


def test_expired_otp_is_rejected(monkeypatch):
    monkeypatch.setattr(otp_service, "_send_email_otp", lambda recipient_email, otp: True)
    otp_service.request_otp("+919876543211", recipient_email="user@example.com")
    otp_service.otp_store["+919876543211"]["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)

    ok, message = otp_service.verify_otp("+919876543211", "000000")
    assert ok is False
    assert "expired" in message.lower()
