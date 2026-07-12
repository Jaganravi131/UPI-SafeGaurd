"""Database package"""
from app.db.database import (
    Base,
    get_db,
    get_mongodb,
    get_redis,
    init_postgres,
    init_mongodb,
    init_redis,
    close_connections
)
from app.db.models import (
    User,
    Guardian,
    Transaction,
    Wallet,
    FraudReport,
    Challenge,
    ChallengeProgress,
    UPIProfile,
    Notification,
    UserLiteracy,
    TransactionStatus,
    RiskLevel
)

__all__ = [
    "Base",
    "get_db",
    "get_mongodb",
    "get_redis",
    "init_postgres",
    "init_mongodb",
    "init_redis",
    "close_connections",
    "User",
    "Guardian",
    "Transaction",
    "Wallet",
    "FraudReport",
    "Challenge",
    "ChallengeProgress",
    "UPIProfile",
    "Notification",
    "UserLiteracy",
    "TransactionStatus",
    "RiskLevel"
]
