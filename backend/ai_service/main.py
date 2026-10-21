"""Standalone Python risk service for the future Spring Boot integration."""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, Request

from app.ml.risk_engine import RiskEngine

from .schemas import RiskAssessmentRequest, RiskAssessmentResponse

SERVICE_VERSION = "risk-service-v1"


def _load_engine() -> RiskEngine:
    artifact = Path(__file__).resolve().parents[1] / "app" / "ml" / "trained_models" / "risk_model.joblib"
    return RiskEngine.from_artifact(artifact) if artifact.exists() else RiskEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model once per service process."""
    app.state.risk_engine = _load_engine()
    yield


app = FastAPI(
    title="UPI SafeGuard AI Risk Service",
    version=SERVICE_VERSION,
    description="Internal model-inference API. It never owns wallets or payments.",
    lifespan=lifespan,
)


@app.get("/health")
def health(request: Request) -> Dict[str, Any]:
    engine = getattr(request.app.state, "risk_engine", None)
    return {
        "status": "ok" if engine is not None else "degraded",
        "service": SERVICE_VERSION,
        "engine_loaded": engine is not None,
    }


@app.get("/v1/model-info")
def model_info(request: Request) -> Dict[str, Any]:
    engine: RiskEngine = request.app.state.risk_engine
    return {
        "service_version": SERVICE_VERSION,
        "engine_version": engine.version,
        "primary_model": engine.model_version,
        "feature_schema_version": engine.feature_schema_version,
        "trained_artifact_loaded": engine.model is not None,
        "live_graph_model": False,
        "calibration_applied": engine.calibration_A != 1.0,
    }


@app.post("/v1/assess", response_model=RiskAssessmentResponse)
def assess_risk(
    request_data: RiskAssessmentRequest,
    request: Request,
) -> RiskAssessmentResponse:
    """Assess risk and return a stable contract to the core backend."""
    engine: RiskEngine = request.app.state.risk_engine
    result = engine.assess(
        request_data.transaction,
        request_data.user_profile,
        request_data.recipient_profile,
    )

    return RiskAssessmentResponse(
        service_version=SERVICE_VERSION,
        engine_version=result["model_versions"]["risk_engine"],
        transaction_id=str(result.get("transaction_id", "")),
        risk_level=result["risk_level"],
        risk_score=result["risk_score"],
        recommended_action=result["recommended_action"],
        require_guardian_approval=result["require_guardian_approval"],
        risk_factors=result["risk_factors"],
        confidence=result["confidence"],
        model_versions=result["model_versions"],
        model_score=result["risk_score"],
        rules_applied=result.get("details", {}).get("hard_rules", []),
        details=result.get("details"),
        feature_schema_version=result["feature_schema_version"],
    )
