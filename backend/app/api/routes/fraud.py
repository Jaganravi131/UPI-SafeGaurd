"""
Fraud Reporting API Routes
Handles fraud reports and community fraud database
"""
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import FraudReport, UPIProfile
from app.schemas import (
    FraudReportCreate, FraudReportResponse, FraudReportList,
    TrendingScam, CommunityStats, SCAM_TYPES
)
from app.services import get_risk_assessment_service
from app.services.fraud_detection_service import get_fraud_detection_service, AlertType

router = APIRouter(prefix="/fraud", tags=["Fraud Reporting"])


# Request/Response models for real-time analysis
class TransactionAnalysisRequest(BaseModel):
    user_id: str
    recipient_upi: str
    amount: float
    recipient_name: Optional[str] = None
    is_verified: Optional[bool] = False
    trust_score: Optional[int] = 50
    note: Optional[str] = None  # Transaction note for NLP scam detection
    sensor_data: Optional[dict] = None  # Gyroscope, accelerometer, touch, typing data


class AlertResponse(BaseModel):
    type: str
    severity: str
    message: str


class AIInterventionQuestion(BaseModel):
    id: str
    question: str
    options: List[str]
    # correct_answer_index stored server-side only, not sent to client


class TransactionAnalysisResponse(BaseModel):
    risk_score: float
    risk_level: str
    action: str
    alerts: List[AlertResponse]
    explanations: List[str]
    is_safe: bool
    requires_ai_intervention: bool = False
    ai_questions: Optional[List[AIInterventionQuestion]] = None


@router.post("/analyze", response_model=TransactionAnalysisResponse)
async def analyze_transaction(
    request: TransactionAnalysisRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Real-time transaction fraud analysis
    
    Analyzes a transaction before it's executed and returns:
    - Risk score (0-100)
    - Risk level (safe/caution/risky/dangerous)
    - Recommended action (allow/delay/require_verification/block)
    - Specific alerts and explanations
    """
    fraud_service = get_fraud_detection_service()
    
    # Check if recipient is in scammer database
    scammer_result = await db.execute(
        select(UPIProfile)
        .where(UPIProfile.upi_id == request.recipient_upi)
        .where(UPIProfile.report_count > 0)
    )
    scammer = scammer_result.scalar_one_or_none()
    
    if scammer and scammer.report_count > 2:
        fraud_service.add_scammer(request.recipient_upi)
    
    # Prepare recipient info
    recipient_info = {
        "name": request.recipient_name,
        "is_verified": request.is_verified,
        "trust_score": request.trust_score
    }
    
    # Run analysis
    analysis = fraud_service.analyze_transaction(
        user_id=request.user_id,
        recipient_upi=request.recipient_upi,
        amount=request.amount,
        recipient_info=recipient_info,
        note=request.note,  # Pass note for NLP analysis
        sensor_data=request.sensor_data  # Pass sensor data for stress detection
    )
    
    # Convert alerts
    alerts = [
        AlertResponse(
            type=alert.alert_type.value,
            severity=alert.severity,
            message=alert.message
        )
        for alert in analysis.alerts
    ]
    
    # Check if AI intervention is required
    requires_ai = analysis.action == "ai_intervention"
    ai_questions = None
    
    if requires_ai:
        # Generate AI intervention questions based on the detected risk
        ai_questions = generate_ai_questions(request, analysis)
    
    return TransactionAnalysisResponse(
        risk_score=analysis.risk_score,
        risk_level=analysis.risk_level.value,
        action=analysis.action,
        alerts=alerts,
        explanations=analysis.explanations,
        is_safe=analysis.action == "allow",
        requires_ai_intervention=requires_ai,
        ai_questions=ai_questions
    )


def generate_ai_questions(request: TransactionAnalysisRequest, analysis) -> List[AIInterventionQuestion]:
    """
    Generate AI intervention questions based on detected risks
    These questions help verify if the user understands the risk
    """
    questions = []
    note = request.note or ""
    note_lower = note.lower()
    
    # Lottery/Prize scam questions
    if any(kw in note_lower for kw in ["lottery", "winner", "prize", "jackpot", "lucky draw", "won"]):
        questions.append(AIInterventionQuestion(
            id="lottery_1",
            question="Did you buy a lottery ticket or enter any contest recently?",
            options=["Yes, I remember entering", "No, I never entered any contest", "I'm not sure"],
        ))
        questions.append(AIInterventionQuestion(
            id="lottery_2",
            question="Is this person asking you to pay money to RECEIVE a prize?",
            options=["Yes, they said I need to pay first", "No, they're giving me money directly"],
        ))
    
    # KYC/Bank scam questions  
    elif any(kw in note_lower for kw in ["kyc", "account block", "verify account", "bank verification"]):
        questions.append(AIInterventionQuestion(
            id="kyc_1",
            question="Did your bank call/message you FIRST about this?",
            options=["Yes, bank contacted me", "No, someone else contacted me", "I contacted them"],
        ))
        questions.append(AIInterventionQuestion(
            id="kyc_2",
            question="Are they asking you to SEND money for KYC verification?",
            options=["Yes", "No"],
        ))
    
    # Job scam questions
    elif any(kw in note_lower for kw in ["job", "registration fee", "processing fee", "joining fee"]):
        questions.append(AIInterventionQuestion(
            id="job_1",
            question="Did you apply for this job through an official company website?",
            options=["Yes, official website", "No, through WhatsApp/SMS/Call", "Not sure"],
        ))
        questions.append(AIInterventionQuestion(
            id="job_2",
            question="Are they asking you to pay BEFORE you start working?",
            options=["Yes, for registration/processing", "No payment required"],
        ))
    
    # Investment scam questions
    elif any(kw in note_lower for kw in ["investment", "double money", "guaranteed return", "trading", "crypto"]):
        questions.append(AIInterventionQuestion(
            id="invest_1",
            question="Are they promising guaranteed or unusually high returns?",
            options=["Yes, they promised high/guaranteed returns", "No, they explained risks clearly"],
        ))
        questions.append(AIInterventionQuestion(
            id="invest_2",
            question="Is this person/company registered with SEBI or RBI?",
            options=["I verified - Yes, they're registered", "I didn't check", "They're not registered"],
        ))
    
    # High amount generic questions
    else:
        questions.append(AIInterventionQuestion(
            id="generic_1",
            question="Do you personally know this recipient?",
            options=["Yes, they're family/friend", "Somewhat - met online/briefly", "No, never met them"],
        ))
        questions.append(AIInterventionQuestion(
            id="generic_2",
            question="Is someone on a call RIGHT NOW pressuring you to pay?",
            options=["Yes, they're on call", "No, I'm deciding on my own"],
        ))
    
    # Always add this question for high amounts
    if request.amount >= 5000:
        questions.append(AIInterventionQuestion(
            id="amount_1",
            question=f"If you lose ₹{request.amount:,.0f}, will it significantly affect you?",
            options=["Yes, this is a lot for me", "No, I can afford to lose this"],
        ))
    
    return questions[:3]  # Return max 3 questions


def calculate_verification_score(report: FraudReportCreate, existing_reports: int) -> float:
    """Calculate verification score for a fraud report"""
    score = 0.3  # Base score
    
    # More details = higher score
    if report.description and len(report.description) > 50:
        score += 0.2
    
    if report.amount_lost and report.amount_lost > 0:
        score += 0.15
    
    if report.incident_date:
        score += 0.1
    
    if report.scammer_phone:
        score += 0.1
    
    if report.evidence_urls and len(report.evidence_urls) > 0:
        score += 0.15
    
    # Corroboration from existing reports
    if existing_reports > 5:
        score += 0.3
    elif existing_reports > 2:
        score += 0.2
    elif existing_reports > 0:
        score += 0.1
    
    return min(score, 1.0)


@router.post("/report", response_model=FraudReportResponse)
async def submit_fraud_report(
    report: FraudReportCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = None
):
    """Submit a fraud report"""
    user_id = user_id or "demo-user"
    
    # Check for existing reports on this UPI
    existing = await db.execute(
        select(func.count(FraudReport.id))
        .where(FraudReport.scammer_upi == report.scammer_upi)
    )
    existing_count = existing.scalar() or 0
    
    # Calculate verification score
    verification_score = calculate_verification_score(report, existing_count)
    
    # Create report
    fraud_report = FraudReport(
        reporter_id=user_id if user_id != "demo-user" else None,
        scammer_upi=report.scammer_upi,
        scam_type=report.scam_type,
        amount_lost=report.amount_lost,
        description=report.description,
        incident_date=report.incident_date,
        scammer_phone=report.scammer_phone,
        evidence_urls=report.evidence_urls or [],
        verification_score=verification_score,
        status="verified" if verification_score > 0.5 else "pending"
    )
    
    db.add(fraud_report)
    
    # Update UPI profile
    upi_profile = await db.execute(
        select(UPIProfile).where(UPIProfile.upi_id == report.scammer_upi)
    )
    profile = upi_profile.scalar_one_or_none()
    
    if profile:
        profile.report_count += 1
        profile.total_amount_reported += report.amount_lost or 0
        profile.trust_score = max(0, profile.trust_score - 10)
    else:
        new_profile = UPIProfile(
            upi_id=report.scammer_upi,
            account_type="personal",
            trust_score=20,
            report_count=1,
            total_amount_reported=report.amount_lost or 0
        )
        db.add(new_profile)
    
    await db.commit()
    await db.refresh(fraud_report)
    
    # Update ML graph network
    risk_service = get_risk_assessment_service()
    risk_service.report_fraud(report.scammer_upi, 1)
    
    return FraudReportResponse(
        id=fraud_report.id,
        scammer_upi=fraud_report.scammer_upi,
        scam_type=fraud_report.scam_type,
        amount_lost=fraud_report.amount_lost,
        description=fraud_report.description,
        incident_date=fraud_report.incident_date,
        verification_score=fraud_report.verification_score,
        status=fraud_report.status,
        users_protected=fraud_report.users_protected,
        created_at=fraud_report.created_at
    )


@router.get("/reports", response_model=FraudReportList)
async def get_fraud_reports(
    db: AsyncSession = Depends(get_db),
    upi_id: Optional[str] = None,
    scam_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
):
    """Get fraud reports"""
    query = select(FraudReport)
    
    if upi_id:
        query = query.where(FraudReport.scammer_upi == upi_id)
    
    if scam_type:
        query = query.where(FraudReport.scam_type == scam_type)
    
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    reports = result.scalars().all()
    
    # Get total count
    count_result = await db.execute(select(func.count(FraudReport.id)))
    total = count_result.scalar() or 0
    
    return FraudReportList(
        reports=[
            FraudReportResponse(
                id=r.id,
                scammer_upi=r.scammer_upi,
                scam_type=r.scam_type,
                amount_lost=r.amount_lost,
                description=r.description,
                incident_date=r.incident_date,
                verification_score=r.verification_score,
                status=r.status,
                users_protected=r.users_protected,
                created_at=r.created_at
            )
            for r in reports
        ],
        total_count=total
    )


@router.get("/scam-types")
async def get_scam_types():
    """Get list of scam types"""
    return [{"id": s.id, "name": s.name, "description": s.description} for s in SCAM_TYPES]


@router.get("/trending")
async def get_trending_scams(
    db: AsyncSession = Depends(get_db)
):
    """Get trending scam types"""
    # Get scam type statistics
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    result = await db.execute(
        select(
            FraudReport.scam_type,
            func.count(FraudReport.id).label("count"),
            func.sum(FraudReport.amount_lost).label("total_amount")
        )
        .where(FraudReport.created_at > seven_days_ago)
        .group_by(FraudReport.scam_type)
        .order_by(func.count(FraudReport.id).desc())
        .limit(5)
    )
    
    trending = []
    for row in result:
        scam_info = next((s for s in SCAM_TYPES if s.id == row.scam_type), None)
        trending.append({
            "scam_type": row.scam_type,
            "report_count": row.count,
            "total_amount_lost": row.total_amount or 0,
            "trend": "increasing",
            "description": scam_info.description if scam_info else "",
            "red_flags": get_red_flags(row.scam_type)
        })
    
    return trending


def get_red_flags(scam_type: str) -> List[str]:
    """Get red flags for a scam type"""
    red_flags = {
        "fake_kyc": [
            "Call claiming KYC is expiring",
            "SMS with links for KYC update",
            "Asking for OTP or PIN"
        ],
        "qr_scam": [
            "QR code sent to 'receive' money",
            "Asking to scan QR to get refund",
            "Unknown buyer on marketplace"
        ],
        "digital_arrest": [
            "Video call from 'police' or 'CBI'",
            "Claims of money laundering",
            "Demanding immediate payment"
        ],
        "remote_access": [
            "Asking to install AnyDesk/TeamViewer",
            "Claims of fixing phone issues",
            "Promising refunds"
        ],
    }
    return red_flags.get(scam_type, ["Unknown contact", "Urgency to pay", "Too good to be true"])


@router.get("/stats", response_model=CommunityStats)
async def get_community_stats(
    db: AsyncSession = Depends(get_db)
):
    """Get community fraud statistics"""
    # Total reports
    total_result = await db.execute(select(func.count(FraudReport.id)))
    total_reports = total_result.scalar() or 0
    
    # Verified reports
    verified_result = await db.execute(
        select(func.count(FraudReport.id))
        .where(FraudReport.status == "verified")
    )
    verified_reports = verified_result.scalar() or 0
    
    # Total amount
    amount_result = await db.execute(
        select(func.sum(FraudReport.amount_lost))
    )
    total_amount = amount_result.scalar() or 0
    
    # Active scam UPIs
    active_result = await db.execute(
        select(func.count(UPIProfile.id))
        .where(UPIProfile.report_count > 0)
    )
    active_scam_upis = active_result.scalar() or 0
    
    return CommunityStats(
        total_reports=total_reports,
        verified_reports=verified_reports,
        total_amount_saved=total_amount,
        users_protected=verified_reports,
        active_scam_upis=active_scam_upis,
        trending_scams=[]
    )


# ============ Evidence File Upload ============

@router.post("/report/{report_id}/upload-evidence")
async def upload_evidence(
    report_id: UUID,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload evidence files for a fraud report"""
    import os, shutil
    
    # Verify report exists
    result = await db.execute(select(FraudReport).where(FraudReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Fraud report not found")
    
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    # Create uploads directory
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "evidence", str(report_id))
    os.makedirs(upload_dir, exist_ok=True)
    
    saved_files = []
    allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".txt", ".mp4", ".webm"}
    max_file_size = 10 * 1024 * 1024  # 10MB
    
    for file in files:
        # Validate extension
        _, ext = os.path.splitext(file.filename or "")
        if ext.lower() not in allowed_extensions:
            continue
        
        # Read and validate size
        content = await file.read()
        if len(content) > max_file_size:
            continue
        
        # Sanitize filename
        safe_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        safe_name = "".join(c for c in safe_name if c.isalnum() or c in "._-")
        
        filepath = os.path.join(upload_dir, safe_name)
        with open(filepath, "wb") as f:
            f.write(content)
        
        saved_files.append({"filename": safe_name, "size": len(content), "type": file.content_type})
    
    # Update report with evidence file list
    existing = report.evidence_urls or []
    if isinstance(existing, str):
        import json as json_lib
        try:
            existing = json_lib.loads(existing)
        except Exception:
            existing = [existing] if existing else []
    
    existing.extend([f["filename"] for f in saved_files])
    report.evidence_urls = existing
    
    await db.commit()
    
    return {
        "message": f"Uploaded {len(saved_files)} file(s)",
        "report_id": str(report_id),
        "files": saved_files,
    }
