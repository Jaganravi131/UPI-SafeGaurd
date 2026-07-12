"""
Configuration management for UPI SafeGuard
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional, List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    APP_NAME: str = "UPI SafeGuard"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    
    # JWT — MUST be set via .env file
    JWT_SECRET_KEY: str = ""  # Loaded from .env
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24
    
    # Admin defaults (MUST be set via .env for production)
    ADMIN_DEFAULT_PASSWORD: str = ""  # Loaded from .env
    
    # Database URLs
    POSTGRES_URL: str = "sqlite+aiosqlite:///./demo_database.db"  # Default: SQLite demo
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DATABASE: str = "upi_safeguard"
    REDIS_URL: str = "redis://localhost:6379"
    
    # OTP Service (Twilio)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None
    
    # ML Model Settings
    ML_MODEL_PATH: str = "./ml_models"
    XGBOOST_MODEL_PATH: str = "./ml_models/xgboost_risk_model.json"
    LSTM_MODEL_PATH: str = "./ml_models/lstm_behavioral.h5"
    GNN_MODEL_PATH: str = "./ml_models/gnn_fraud_network.pt"
    
    # Risk Thresholds
    RISK_THRESHOLD_LOW: float = 0.3
    RISK_THRESHOLD_MEDIUM: float = 0.6
    RISK_THRESHOLD_HIGH: float = 0.85
    
    # Groq LLM (for translation, AI scam advisor, smart alerts)
    GROQ_API_KEY: str = ""  # Loaded from .env
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    
    # External APIs (Optional)
    GOOGLE_CLOUD_PROJECT_ID: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_PRIVATE_KEY: Optional[str] = None
    FIREBASE_CLIENT_EMAIL: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_REGION: str = "ap-south-1"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    s = Settings()
    # Warn about missing critical secrets at startup
    import warnings
    if not s.JWT_SECRET_KEY:
        warnings.warn("[WARN] JWT_SECRET_KEY not set in .env — authentication will NOT work!", stacklevel=2)
    if not s.ADMIN_DEFAULT_PASSWORD:
        warnings.warn("[WARN] ADMIN_DEFAULT_PASSWORD not set in .env — admin login disabled!", stacklevel=2)
    if not s.GROQ_API_KEY:
        warnings.warn("[WARN] GROQ_API_KEY not set in .env — AI features disabled!", stacklevel=2)
    return s


settings = get_settings()
