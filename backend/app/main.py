"""
UPI SafeGuard - Main FastAPI Application
Real-time fraud detection and prevention platform for UPI transactions
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
import joblib

from app.config import settings
from app.db.database import init_postgres, init_mongodb, init_redis, close_connections
from app.api.routes import auth, transaction, fraud, guardian, challenge, admin
from app.api.routes import admin_auth
from app.api.routes import intervention
from app.api.routes import contacts
from app.api.routes import security
from app.db.excel_database import init_excel_databases
from app.ml.risk_engine import RiskEngine
from app.ml.pipeline.risk_adapter import RiskAdapter
from app.services.risk_assessment_service import RiskAssessmentService


async def _seed_demo_data():
    """Seed demo transactions so the dashboard isn't empty on first launch."""
    from app.db.database import _async_session_local
    if _async_session_local is None:
        return
    from sqlalchemy import select, func
    from app.db.models import Transaction, TransactionStatus, RiskLevel
    from datetime import datetime, timezone, timedelta
    import uuid, random

    async with _async_session_local() as session:
        count = (await session.execute(select(func.count(Transaction.id)))).scalar() or 0
        if count > 0:
            return  # already has data

        demo_txns = [
            {"recipient_upi": "grocery@paytm", "amount": 450, "purpose": "Monthly groceries", "risk_level": RiskLevel.LOW, "risk_score": 0.08, "status": TransactionStatus.COMPLETED, "xgboost_score": 0.06, "lstm_score": 0.10, "isolation_forest_score": 0.05, "gnn_score": 0.03, "hours_ago": 2},
            {"recipient_upi": "electricity@axisb", "amount": 1800, "purpose": "Electricity bill", "risk_level": RiskLevel.LOW, "risk_score": 0.12, "status": TransactionStatus.COMPLETED, "xgboost_score": 0.10, "lstm_score": 0.14, "isolation_forest_score": 0.08, "gnn_score": 0.05, "hours_ago": 8},
            {"recipient_upi": "rent@icici", "amount": 15000, "purpose": "Monthly rent", "risk_level": RiskLevel.MEDIUM, "risk_score": 0.35, "status": TransactionStatus.COMPLETED, "xgboost_score": 0.30, "lstm_score": 0.42, "isolation_forest_score": 0.25, "gnn_score": 0.18, "hours_ago": 24},
            {"recipient_upi": "unknown@ybl", "amount": 49999, "purpose": "Investment scheme", "risk_level": RiskLevel.HIGH, "risk_score": 0.72, "status": TransactionStatus.BLOCKED, "xgboost_score": 0.68, "lstm_score": 0.78, "isolation_forest_score": 0.65, "gnn_score": 0.70, "hours_ago": 48},
            {"recipient_upi": "friend@oksbi", "amount": 2000, "purpose": "Dinner split", "risk_level": RiskLevel.LOW, "risk_score": 0.05, "status": TransactionStatus.COMPLETED, "xgboost_score": 0.04, "lstm_score": 0.06, "isolation_forest_score": 0.03, "gnn_score": 0.02, "hours_ago": 72},
            {"recipient_upi": "suspicious@paytm", "amount": 25000, "purpose": "Loan repayment", "risk_level": RiskLevel.HIGH, "risk_score": 0.68, "status": TransactionStatus.GUARDIAN_PENDING, "xgboost_score": 0.62, "lstm_score": 0.74, "isolation_forest_score": 0.58, "gnn_score": 0.65, "hours_ago": 4},
            {"recipient_upi": "mobile@airtel", "amount": 599, "purpose": "Recharge", "risk_level": RiskLevel.LOW, "risk_score": 0.04, "status": TransactionStatus.COMPLETED, "xgboost_score": 0.03, "lstm_score": 0.05, "isolation_forest_score": 0.02, "gnn_score": 0.01, "hours_ago": 120},
        ]

        # Use a dummy user_id — these are visible only in admin dashboard aggregate stats
        dummy_user = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        for t in demo_txns:
            txn = Transaction(
                user_id=dummy_user,
                recipient_upi=t["recipient_upi"],
                amount=t["amount"],
                purpose=t["purpose"],
                status=t["status"],
                risk_level=t["risk_level"],
                risk_score=t["risk_score"],
                xgboost_score=t.get("xgboost_score"),
                lstm_score=t.get("lstm_score"),
                isolation_forest_score=t.get("isolation_forest_score"),
                gnn_score=t.get("gnn_score"),
                ml_confidence=round(random.uniform(0.82, 0.96), 2),
                risk_factors=["Demo seed transaction"],
                created_at=now - timedelta(hours=t["hours_ago"]),
                completed_at=(now - timedelta(hours=t["hours_ago"])) if t["status"] == TransactionStatus.COMPLETED else None,
            )
            session.add(txn)
        await session.commit()
        print(f"[OK] Seeded {len(demo_txns)} demo transactions")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("[*] Starting UPI SafeGuard...")
    
    # Initialize Excel databases
    print("[*] Initializing Excel databases...")
    init_excel_databases()
    print("[OK] Excel databases ready")
    
    try:
        await init_postgres()
    except Exception as e:
        print(f"[WARN] Database init error: {e}")
    
    try:
        await init_mongodb()
        print("[OK] MongoDB connected")
    except Exception as e:
        print(f"[WARN] MongoDB connection failed (demo mode): {e}")
    
    try:
        await init_redis()
        print("[OK] Redis connected")
    except Exception as e:
        print(f"[WARN] Redis connection failed (demo mode): {e}")
    
    # Load the single risk engine once and keep it on app.state.
    print("[*] Loading risk engine artifact...")
    try:
        model_path = Path(__file__).resolve().parent / "ml" / "trained_models" / "risk_engine.joblib"
        if model_path.exists():
            risk_engine = joblib.load(model_path)
            print(f"[OK] Loaded risk engine from {model_path}")
        else:
            risk_engine = RiskEngine()
            print("[WARN] risk_engine.joblib missing; using deterministic fallback engine")
        app.state.risk_engine = risk_engine
        app.state.risk_adapter = RiskAdapter(risk_engine)
        app.state.risk_assessment_service = RiskAssessmentService(app.state.risk_adapter)
    except Exception as e:
        print(f"[WARN] Risk engine load failed: {e}")
    
    # Seed demo data if database is empty
    try:
        await _seed_demo_data()
    except Exception as e:
        print(f"[WARN] Demo seed failed: {e}")
    
    print("[OK] UPI SafeGuard is ready!")
    
    yield
    
    # Shutdown
    print("[*] Shutting down...")
    await close_connections()
    print("[*] Goodbye!")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="""
    ## UPI SafeGuard - Web-Based UPI Fraud-Risk Analysis Prototype
    
    UPI SafeGuard analyzes simulated UPI transactions in real time, surfaces risk
    signals, and warns users before potentially fraudulent payments are confirmed.
    
    ### Features:
    - 🔍 Real-time risk assessment with a single honest engine
    - 🕸️ Graph and anomaly signals
    - 📱 Coercion-aware warnings
    - 👨‍👩‍👧 Guardian mode for vulnerable users
    - 🎮 Gamified security education
    
    ### Limits:
    - Uses simulated or local data only
    - No real bank integration
    - Training metrics depend on the local PaySim artifact or fallback engine
    """,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# Global exception handler
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler — never leaks internals to client"""
    import logging
    logger = logging.getLogger(__name__)
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Device-Info", "X-Request-ID"],
)

# Rate limiting middleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Serve uploaded evidence files
from fastapi.staticfiles import StaticFiles
import os
_uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(transaction.router, prefix="/api/v1")
app.include_router(fraud.router, prefix="/api/v1")
app.include_router(guardian.router, prefix="/api/v1")
app.include_router(challenge.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(admin_auth.router, prefix="/api/v1")
app.include_router(intervention.router, prefix="/api/v1")
app.include_router(contacts.router, prefix="/api/v1")
app.include_router(security.router, prefix="/api/v1")

# AI (Groq LLM) routes — translation, chatbot, scam explainer
from app.api.routes import ai as ai_routes
app.include_router(ai_routes.router, prefix="/api/v1")

# Notifications routes
from app.api.routes import notifications as notifications_routes
app.include_router(notifications_routes.router, prefix="/api/v1")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "description": "AI-Powered UPI Fraud Prevention Platform",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    from pathlib import Path
    model_path = Path(__file__).resolve().parent / "ml" / "trained_models" / "risk_engine.joblib"
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "risk_engine": {
            "artifact": str(model_path),
            "loaded": hasattr(app.state, "risk_engine"),
        }
    }


@app.get("/api/v1/ml/test")
async def test_ml_models():
    """Test the risk engine with a sample transaction"""
    
    # Sample transaction
    transaction_data = {
        "transaction_id": "test-123",
        "recipient_upi": "test@upi",
        "amount": 5000,
        "is_new_recipient": True,
        "hour_of_day": 14,
        "day_of_week": 2,
        "call_active": False,
    }
    
    user_profile = {
        "id": "user-123",
        "avg_transaction_amount": 1000,
        "max_transaction_amount": 5000,
        "security_score": 50,
        "digital_literacy": "intermediate",
        "guardian_enabled": False,
    }
    
    recipient_profile = {
        "upi_id": "test@upi",
        "trust_score": 50,
        "report_count": 0,
        "account_age_days": 30,
    }
    
    result = app.state.risk_adapter.assess(
        transaction_data,
        user_profile,
        recipient_profile
    )
    
    return result
