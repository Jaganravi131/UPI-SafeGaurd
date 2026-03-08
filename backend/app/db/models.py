"""
SQLAlchemy models for PostgreSQL database
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, Enum, TypeDecorator, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.types import CHAR
from datetime import datetime
import uuid
import enum

from app.db.database import Base


# Custom UUID type that works with both PostgreSQL and SQLite
class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as stringified hex values.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is not None:
            if dialect.name == 'postgresql':
                return value
            else:
                if isinstance(value, uuid.UUID):
                    return str(value)
                else:
                    return str(uuid.UUID(value))
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if not isinstance(value, uuid.UUID):
                value = uuid.UUID(value)
        return value


# Custom JSON type that works with both PostgreSQL and SQLite
class JSONType(TypeDecorator):
    """Platform-independent JSON type"""
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(JSONB())
        else:
            return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is not None and dialect.name != 'postgresql':
            import json
            return json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and dialect.name != 'postgresql':
            import json
            return json.loads(value)
        return value


class UserLiteracy(enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class TransactionStatus(enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"
    GUARDIAN_PENDING = "guardian_pending"


class RiskLevel(enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class User(Base):
    """User account model"""
    __tablename__ = "users"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    phone_number = Column(String(15), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=True)
    date_of_birth = Column(DateTime, nullable=True)
    preferred_language = Column(String(20), default="english")
    digital_literacy = Column(Enum(UserLiteracy), default=UserLiteracy.INTERMEDIATE)
    upi_id = Column(String(100), unique=True, nullable=True)
    
    # Security
    pin_hash = Column(String(255), nullable=True)
    biometric_enabled = Column(Boolean, default=False)
    safe_word = Column(String(50), nullable=True)
    
    # Security Score (ML calculated)
    security_score = Column(Float, default=50.0)
    behavior_score = Column(Float, default=50.0)
    education_score = Column(Float, default=0.0)
    history_score = Column(Float, default=50.0)
    
    # Limits
    daily_limit = Column(Numeric(12, 2), default=100000.0)
    per_transaction_limit = Column(Numeric(12, 2), default=50000.0)
    
    # Guardian Mode
    guardian_enabled = Column(Boolean, default=False)
    guardian_threshold = Column(Numeric(12, 2), default=5000.0)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Firebase Auth
    firebase_uid = Column(String(128), nullable=True, unique=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Relationships
    transactions = relationship("Transaction", back_populates="user")
    guardians = relationship("Guardian", foreign_keys="[Guardian.user_id]", back_populates="user")
    challenge_progress = relationship("ChallengeProgress", back_populates="user")
    

class Guardian(Base):
    """Guardian relationship model"""
    __tablename__ = "guardians"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=True, index=True)
    guardian_id = Column(GUID(), ForeignKey("users.id"), nullable=True)
    guardian_phone = Column(String(15), nullable=False)
    guardian_name = Column(String(100), nullable=False)
    relation_type = Column(String(50), nullable=False)  # renamed from 'relationship'
    status = Column(String(20), default="pending")  # pending, active, declined
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys="[Guardian.user_id]", back_populates="guardians")


class Transaction(Base):
    """Transaction model"""
    __tablename__ = "transactions"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    
    # Transaction details
    recipient_upi = Column(String(100), nullable=False, index=True)
    recipient_name = Column(String(100), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    purpose = Column(String(255), nullable=True)
    
    # Status
    status = Column(Enum(TransactionStatus), default=TransactionStatus.PENDING)
    
    # Risk Assessment (ML)
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.LOW)
    risk_score = Column(Float, default=0.0)
    xgboost_score = Column(Float, nullable=True)
    lstm_score = Column(Float, nullable=True)
    isolation_forest_score = Column(Float, nullable=True)
    gnn_score = Column(Float, nullable=True)
    sensor_score = Column(Float, nullable=True)
    ml_confidence = Column(Float, nullable=True)
    risk_factors = Column(JSONType(), default=list)
    
    # User actions
    warnings_shown = Column(Boolean, default=False)
    user_acknowledged = Column(Boolean, default=False)
    delay_applied = Column(Integer, default=0)  # seconds
    
    # Guardian
    guardian_approval_required = Column(Boolean, default=False)
    guardian_approved = Column(Boolean, nullable=True)
    guardian_id = Column(GUID(), nullable=True)
    
    # Context
    call_active = Column(Boolean, default=False)
    coercion_detected = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Feedback for ML training
    reported_as_fraud = Column(Boolean, nullable=True)
    
    user = relationship("User", back_populates="transactions")


class FraudReport(Base):
    """Fraud report model"""
    __tablename__ = "fraud_reports"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(GUID(), ForeignKey("users.id"), nullable=True, index=True)  # Allow NULL for anonymous reports
    
    # Scammer details
    scammer_upi = Column(String(100), nullable=False, index=True)
    scam_type = Column(String(50), nullable=False, index=True)
    amount_lost = Column(Numeric(12, 2), nullable=True)
    description = Column(Text, nullable=True)
    incident_date = Column(DateTime, nullable=True)
    scammer_phone = Column(String(15), nullable=True)
    
    # ML Validation
    verification_score = Column(Float, default=0.0)
    status = Column(String(20), default="pending")  # pending, verified, rejected
    
    # Evidence
    evidence_urls = Column(JSONType(), default=list)
    
    # Impact tracking
    users_protected = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Challenge(Base):
    """Security challenge model"""
    __tablename__ = "challenges"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False)
    difficulty = Column(String(20), default="beginner")  # beginner, intermediate, advanced
    scenario = Column(Text, nullable=False)
    options = Column(JSONType(), nullable=False)  # List of options
    correct_answer = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=False)
    points = Column(Integer, default=10)
    
    created_at = Column(DateTime, default=datetime.utcnow)


class ChallengeProgress(Base):
    """User challenge progress model"""
    __tablename__ = "challenge_progress"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    challenge_id = Column(GUID(), ForeignKey("challenges.id"), nullable=False, index=True)
    
    completed = Column(Boolean, default=False)
    correct = Column(Boolean, nullable=True)
    answer_selected = Column(Integer, nullable=True)
    time_taken = Column(Integer, nullable=True)  # seconds
    
    completed_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="challenge_progress")


class UPIProfile(Base):
    """UPI ID profile for safety checking"""
    __tablename__ = "upi_profiles"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    upi_id = Column(String(100), unique=True, nullable=False, index=True)
    
    # Account info
    account_type = Column(String(20), default="personal")  # personal, merchant, business
    verified_name = Column(String(100), nullable=True)
    account_age_days = Column(Integer, nullable=True)
    
    # Trust metrics (ML calculated)
    trust_score = Column(Float, default=50.0)
    graph_network_score = Column(Float, default=50.0)
    transaction_pattern_score = Column(Float, default=50.0)
    
    # Report metrics
    report_count = Column(Integer, default=0)
    total_amount_reported = Column(Numeric(14, 2), default=0.0)
    
    # Network metrics
    connected_accounts = Column(Integer, default=0)
    flagged_connections = Column(Integer, default=0)
    
    last_updated = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    """User notifications"""
    __tablename__ = "notifications"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    
    type = Column(String(50), nullable=False)  # security, ai_insight, transaction, tip, system
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    data = Column(JSONType(), default=dict)
    
    read = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)


class AdminRole(enum.Enum):
    """Admin role types"""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    ANALYST = "analyst"
    SUPPORT = "support"


class Admin(Base):
    """Admin user model"""
    __tablename__ = "admins"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(Enum(AdminRole), default=AdminRole.ANALYST)
    
    # Status
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ActivityLog(Base):
    """System activity log for audit trail"""
    __tablename__ = "activity_logs"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    admin_id = Column(GUID(), ForeignKey("admins.id"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=True, index=True)
    
    action = Column(String(100), nullable=False, index=True)  # login, logout, block_user, verify_report, etc.
    entity_type = Column(String(50), nullable=True)  # user, transaction, fraud_report, etc.
    entity_id = Column(GUID(), nullable=True)
    details = Column(JSONType(), default=dict)
    ip_address = Column(String(45), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
