"""OTP delivery and verification helpers."""
from __future__ import annotations

import logging
import os
import random
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 300
otp_store: Dict[str, Dict[str, Any]] = {}


def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP."""
    return "".join(random.choices("0123456789", k=length))


def _smtp_config() -> Dict[str, Any]:
    return {
        "host": os.getenv("SMTP_HOST", ""),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "username": os.getenv("SMTP_USERNAME", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_email": os.getenv("SMTP_FROM_EMAIL", os.getenv("SMTP_USERNAME", "")),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() != "false",
    }


def _send_email_otp(recipient_email: str, otp: str) -> bool:
    """Send the OTP by email if SMTP is configured."""
    config = _smtp_config()
    if not recipient_email or not config["host"] or not config["from_email"]:
        return False

    message = EmailMessage()
    message["Subject"] = "UPI SafeGuard verification code"
    message["From"] = config["from_email"]
    message["To"] = recipient_email
    message.set_content(
        "Your UPI SafeGuard verification code is {otp}. It expires in 5 minutes. Do not share it with anyone.".format(
            otp=otp
        )
    )

    context = ssl.create_default_context()
    try:
        if config["use_tls"]:
            with smtplib.SMTP(config["host"], config["port"], timeout=15) as client:
                client.ehlo()
                client.starttls(context=context)
                client.ehlo()
                if config["username"] and config["password"]:
                    client.login(config["username"], config["password"])
                client.send_message(message)
        else:
            with smtplib.SMTP_SSL(config["host"], config["port"], context=context, timeout=15) as client:
                if config["username"] and config["password"]:
                    client.login(config["username"], config["password"])
                client.send_message(message)
        return True
    except Exception as exc:
        logger.warning("OTP email delivery failed for %s: %s", recipient_email, exc)
        return False


def request_otp(phone_number: str, recipient_email: Optional[str] = None) -> Dict[str, Any]:
    """Create and dispatch an OTP, storing it server-side until expiry."""
    otp = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL_SECONDS)
    otp_store[phone_number] = {
        "code": otp,
        "expires_at": expires_at,
        "attempts": 0,
        "recipient_email": recipient_email,
    }

    delivered = False
    delivery_method = "server-log"
    if recipient_email:
        delivered = _send_email_otp(recipient_email, otp)
        delivery_method = "email" if delivered else "server-log"

    if not delivered:
        logger.info("[OTP-DEV] %s -> %s", phone_number, otp)

    return {
        "success": True,
        "expires_in": OTP_TTL_SECONDS,
        "delivery_method": delivery_method,
        "expires_at": expires_at,
    }


def verify_otp(phone_number: str, submitted_otp: str) -> tuple[bool, str]:
    """Validate an OTP and consume it on success."""
    record = otp_store.get(phone_number)
    if not record:
        return False, "OTP not found. Please request a new OTP."

    if record["expires_at"] < datetime.now(timezone.utc):
        otp_store.pop(phone_number, None)
        return False, "OTP expired. Please request a new OTP."

    record["attempts"] = int(record.get("attempts", 0)) + 1
    if record["attempts"] > 3:
        otp_store.pop(phone_number, None)
        return False, "Too many attempts. Please request a new OTP."

    if record["code"] != submitted_otp:
        return False, "Invalid OTP"

    otp_store.pop(phone_number, None)
    return True, "OTP verified"


def clear_expired_otps() -> int:
    """Remove expired OTPs from memory and return the number removed."""
    now = datetime.now(timezone.utc)
    expired = [key for key, value in otp_store.items() if value["expires_at"] < now]
    for key in expired:
        otp_store.pop(key, None)
    return len(expired)
