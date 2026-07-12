"""OTP delivery and verification helpers."""
from __future__ import annotations

import json
import logging
import os
import random
import smtplib
import sqlite3
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import settings

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 300
_redis_available = True


# ── SQLite & Redis Storage Backend Helpers ───────────────────────────────────

def _get_redis_client():
    global _redis_available
    if not _redis_available or not settings.REDIS_URL:
        return None
    import redis
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=0.5, socket_connect_timeout=0.5)
        client.ping()
        return client
    except Exception as e:
        logger.warning("Redis connection failed, disabling Redis for this run: %s", e)
        _redis_available = False
        return None


def _get_sqlite_conn():
    db_path = Path(__file__).resolve().parent.parent.parent / "otp_store.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS otp_records (
            phone_number TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            attempts INTEGER DEFAULT 0 NOT NULL,
            recipient_email TEXT
        )
    """)
    conn.commit()
    return conn


def _write_otp_record(phone_number: str, record: dict):
    expires_at = record["expires_at"]
    if isinstance(expires_at, datetime):
        expires_at = expires_at.isoformat()

    # Try Redis
    redis_client = _get_redis_client()
    if redis_client:
        try:
            payload = {
                "code": record["code"],
                "expires_at": expires_at,
                "attempts": int(record["attempts"]),
                "recipient_email": record.get("recipient_email")
            }
            redis_client.setex(f"otp:{phone_number}", OTP_TTL_SECONDS, json.dumps(payload))
        except Exception:
            pass

    # SQLite Fallback
    conn = _get_sqlite_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO otp_records (phone_number, code, expires_at, attempts, recipient_email)
            VALUES (?, ?, ?, ?, ?)
            """,
            (phone_number, record["code"], expires_at, int(record["attempts"]), record.get("recipient_email"))
        )
        conn.commit()
    finally:
        conn.close()


def _read_otp_record(phone_number: str) -> Optional[dict]:
    # Try Redis
    redis_client = _get_redis_client()
    if redis_client:
        try:
            data = redis_client.get(f"otp:{phone_number}")
            if data:
                record = json.loads(data)
                if isinstance(record["expires_at"], str):
                    record["expires_at"] = datetime.fromisoformat(record["expires_at"])
                return record
        except Exception:
            pass

    # SQLite
    conn = _get_sqlite_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT code, expires_at, attempts, recipient_email FROM otp_records WHERE phone_number = ?",
            (phone_number,)
        )
        row = cursor.fetchone()
        if row:
            code, expires_at_str, attempts, recipient_email = row
            return {
                "code": code,
                "expires_at": datetime.fromisoformat(expires_at_str),
                "attempts": attempts,
                "recipient_email": recipient_email
            }
    finally:
        conn.close()
    return None


def _delete_otp_record(phone_number: str):
    # Try Redis
    redis_client = _get_redis_client()
    if redis_client:
        try:
            redis_client.delete(f"otp:{phone_number}")
        except Exception:
            pass

    # SQLite
    conn = _get_sqlite_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM otp_records WHERE phone_number = ?", (phone_number,))
        conn.commit()
    finally:
        conn.close()


def _otp_exists(phone_number: str) -> bool:
    # Try Redis
    redis_client = _get_redis_client()
    if redis_client:
        try:
            if redis_client.exists(f"otp:{phone_number}"):
                return True
        except Exception:
            pass

    # SQLite
    conn = _get_sqlite_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM otp_records WHERE phone_number = ?", (phone_number,))
        exists = cursor.fetchone() is not None
    finally:
        conn.close()
    return exists


def _clear_all_otps():
    # Try Redis
    redis_client = _get_redis_client()
    if redis_client:
        try:
            keys = redis_client.keys("otp:*")
            if keys:
                redis_client.delete(*keys)
        except Exception:
            pass

    # SQLite
    conn = _get_sqlite_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM otp_records")
        conn.commit()
    finally:
        conn.close()


def _get_all_otp_items() -> list[tuple[str, dict]]:
    items = []
    conn = _get_sqlite_conn()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT phone_number, code, expires_at, attempts, recipient_email FROM otp_records")
        rows = cursor.fetchall()
        for row in rows:
            phone_number, code, expires_at_str, attempts, recipient_email = row
            items.append((
                phone_number,
                {
                    "code": code,
                    "expires_at": datetime.fromisoformat(expires_at_str),
                    "attempts": attempts,
                    "recipient_email": recipient_email
                }
            ))
    finally:
        conn.close()
    return items


# ── Dictionary Mutability Compat Wrappers ────────────────────────────────────

class OTPRecordDict(dict):
    """A dictionary wrapper that writes mutated keys back to storage."""
    def __init__(self, phone_number: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.phone_number = phone_number

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        _write_otp_record(self.phone_number, self)


class OTPStoreProxy:
    """A transparent proxy mapping standard dictionary calls to Redis or SQLite."""
    def clear(self):
        _clear_all_otps()

    def __getitem__(self, key) -> OTPRecordDict:
        rec = _read_otp_record(key)
        if not rec:
            raise KeyError(key)
        return OTPRecordDict(key, rec)

    def __setitem__(self, key, value):
        _write_otp_record(key, value)

    def __contains__(self, key) -> bool:
        return _otp_exists(key)

    def pop(self, key, default=None):
        rec = _read_otp_record(key)
        _delete_otp_record(key)
        return rec if rec else default

    def get(self, key, default=None) -> OTPRecordDict | None:
        rec = _read_otp_record(key)
        return OTPRecordDict(key, rec) if rec else default

    def items(self) -> list[tuple[str, dict]]:
        return _get_all_otp_items()


# Expose compatible otp_store
otp_store = OTPStoreProxy()


# ── Standard OTP Service Logic ──────────────────────────────────────────────

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
    """Create and dispatch an OTP, checking rate-limits (max 1 request per 30 seconds)."""
    now = datetime.now(timezone.utc)
    
    # Enforce rate-limit of 30 seconds between requests
    existing = otp_store.get(phone_number)
    if existing:
        time_elapsed = OTP_TTL_SECONDS - (existing["expires_at"] - now).total_seconds()
        if time_elapsed < 30:
            return {
                "success": False,
                "message": "Please wait 30 seconds before requesting another OTP.",
                "expires_in": int((existing["expires_at"] - now).total_seconds()),
                "delivery_method": "none",
            }

    otp = generate_otp()
    expires_at = now + timedelta(seconds=OTP_TTL_SECONDS)
    
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
    """Remove expired OTPs from the store and return the number removed."""
    now = datetime.now(timezone.utc)
    expired = [key for key, value in otp_store.items() if value["expires_at"] < now]
    for key in expired:
        otp_store.pop(key, None)
    return len(expired)
