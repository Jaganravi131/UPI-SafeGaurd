"""
Security Shield API Routes
==========================
7-Layer Security Analysis for UPI transactions
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...ml.security_shield import SecurityShield, RiskLevel
from ...db.excel_database import ExcelDatabase
from ...db.database import get_db
from ...db.models import User, Transaction, TransactionStatus

router = APIRouter(prefix="/security", tags=["Security Shield"])

# Initialize security shield
security_shield = SecurityShield(excel_database=ExcelDatabase())


class EnvironmentData(BaseModel):
    """Environment security data from client"""
    screen_recording: bool = False
    screen_sharing: bool = False
    overlay_detected: bool = False
    device_rooted: bool = False
    call_active: bool = False
    suspicious_apps: List[str] = []


class UserProfile(BaseModel):
    """User profile for behavioral analysis"""
    avg_transaction_amount: float = 1000
    max_transaction_amount: float = 10000
    transaction_count: int = 50
    account_age_days: int = 180
    security_score: int = 50


class AnalyzeRequest(BaseModel):
    """Request for security analysis"""
    upi_id: str = Field(..., description="UPI ID to analyze")
    amount: float = Field(..., gt=0, description="Transaction amount")
    user_id: Optional[str] = None
    environment: Optional[EnvironmentData] = None
    user_profile: Optional[UserProfile] = None


class LayerResultResponse(BaseModel):
    """Response for a single layer"""
    layer_name: str
    passed: bool
    risk_score: float
    reasons: List[str]
    threats: List[str]


class AnalyzeResponse(BaseModel):
    """Complete security analysis response"""
    transaction_id: str
    timestamp: str
    
    # Final Decision
    risk_level: str
    risk_level_label: str
    final_score: float
    is_blocked: bool
    can_proceed: bool
    
    # Visual
    risk_color: str
    risk_icon: str
    
    # Details
    layer_results: List[LayerResultResponse]
    primary_reason: str
    all_reasons: List[str]
    safety_tips: List[str]
    scam_type_detected: Optional[str]
    scam_type_label: Optional[str]
    
    # Education
    education_link: Optional[str]
    
    # For frontend visualization
    layer_summary: List[Dict[str, Any]]


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_transaction(request: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    """
    🛡️ THE 7-LAYER SECURITY SHIELD
    
    Analyzes a UPI transaction through 7 security layers:
    1. Environment Shield (Kill Switch)
    2. Input Sanitization
    3. Hard Rules (Blocklist, Keywords)
    4. UPI Verification
    5. ML Intelligence
    6. Community Reports
    7. Final Decision
    
    Returns detailed risk analysis with explainable reasons.
    """
    try:
        # Build environment data dict
        env_data = {}
        if request.environment:
            env_data = {
                "screen_recording": request.environment.screen_recording,
                "screen_sharing": request.environment.screen_sharing,
                "overlay_detected": request.environment.overlay_detected,
                "device_rooted": request.environment.device_rooted,
            }
        
        # Build user profile dict — fetch from DB if user_id provided, else use request data or defaults
        profile_data = None
        if request.user_id:
            try:
                user_result = await db.execute(select(User).where(User.id == request.user_id))
                user = user_result.scalar_one_or_none()
                if user:
                    # Get real transaction stats
                    txn_result = await db.execute(
                        select(Transaction)
                        .where(Transaction.user_id == user.id)
                        .where(Transaction.status == TransactionStatus.COMPLETED)
                    )
                    transactions = txn_result.scalars().all()
                    amounts = [float(t.amount) for t in transactions] if transactions else []
                    
                    profile_data = {
                        "avg_transaction_amount": sum(amounts) / len(amounts) if amounts else 0.0,
                        "max_transaction_amount": max(amounts) if amounts else 0.0,
                        "transaction_count": len(transactions),
                        "account_age_days": (datetime.now(timezone.utc) - user.created_at).days if user.created_at else 0,
                        "security_score": int(user.security_score or 50),
                    }
            except Exception:
                pass  # Fall through to defaults
        
        if profile_data is None:
            profile = request.user_profile or UserProfile()
            profile_data = {
                "avg_transaction_amount": profile.avg_transaction_amount,
                "max_transaction_amount": profile.max_transaction_amount,
                "transaction_count": profile.transaction_count,
                "account_age_days": profile.account_age_days,
                "security_score": profile.security_score,
            }
        user_data = profile_data
        
        # Run security analysis
        result = await security_shield.analyze_transaction(
            upi_id=request.upi_id,
            amount=request.amount,
            user_id=request.user_id or "anonymous",
            environment_data=env_data,
            user_profile=user_data,
        )
        
        # Format layer results for response
        layer_responses = []
        layer_summary = []
        
        for layer in result.layer_results:
            layer_responses.append(LayerResultResponse(
                layer_name=layer.layer_name,
                passed=layer.passed,
                risk_score=layer.risk_score,
                reasons=layer.reasons,
                threats=[t.value for t in layer.threats],
            ))
            
            # Summary for visualization
            layer_summary.append({
                "name": layer.layer_name.split(" (")[0],  # Remove parenthetical
                "passed": layer.passed,
                "score": round(layer.risk_score),
                "status": "danger" if layer.risk_score > 70 else "warning" if layer.risk_score > 40 else "safe",
                "icon": "🛡️" if layer.passed else "⚠️" if layer.risk_score < 70 else "🚫",
            })
        
        # Risk level labels and colors
        risk_config = {
            RiskLevel.SAFE: {"label": "Safe to Pay", "color": "green", "icon": "✓"},
            RiskLevel.CAUTION: {"label": "Proceed with Caution", "color": "yellow", "icon": "⚠️"},
            RiskLevel.RISKY: {"label": "High Risk - Verify First", "color": "orange", "icon": "⚠️"},
            RiskLevel.DANGEROUS: {"label": "Do Not Pay", "color": "red", "icon": "🚫"},
            RiskLevel.BLOCKED: {"label": "BLOCKED", "color": "red", "icon": "🚫"},
        }
        
        config = risk_config.get(result.risk_level, risk_config[RiskLevel.CAUTION])
        
        # Scam type labels
        scam_labels = {
            "lottery": "Lottery/Prize Scam",
            "kyc_fraud": "KYC Verification Fraud",
            "digital_arrest": "Digital Arrest Scam",
            "refund_scam": "Fake Refund Scam",
            "fake_support": "Fake Customer Support",
        }
        
        return AnalyzeResponse(
            transaction_id=result.transaction_id,
            timestamp=result.timestamp.isoformat(),
            risk_level=result.risk_level.value,
            risk_level_label=config["label"],
            final_score=round(result.final_score, 1),
            is_blocked=result.is_blocked,
            can_proceed=result.can_proceed,
            risk_color=config["color"],
            risk_icon=config["icon"],
            layer_results=layer_responses,
            primary_reason=result.primary_reason,
            all_reasons=result.all_reasons,
            safety_tips=result.safety_tips,
            scam_type_detected=result.scam_type_detected,
            scam_type_label=scam_labels.get(result.scam_type_detected) if result.scam_type_detected else None,
            education_link=result.education_link,
            layer_summary=layer_summary,
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Security analysis failed: {str(e)}")


@router.get("/layers")
async def get_security_layers():
    """Get information about all 7 security layers"""
    return {
        "total_layers": 7,
        "layers": [
            {
                "number": 1,
                "name": "Environment Shield",
                "aka": "The Kill Switch",
                "description": "Detects screen recording, sharing, overlay attacks",
                "protects_against": ["AnyDesk scams", "TeamViewer fraud", "Clickjacking"],
                "can_block": True,
            },
            {
                "number": 2,
                "name": "Input Sanitization",
                "description": "Validates and sanitizes UPI ID format",
                "protects_against": ["Injection attacks", "Invalid inputs"],
                "can_block": True,
            },
            {
                "number": 3,
                "name": "Hard Rules Shield",
                "description": "Deterministic rules that cannot be bypassed",
                "protects_against": ["Known scam patterns", "Blocklisted UPIs", "Suspicious keywords"],
                "can_block": True,
            },
            {
                "number": 4,
                "name": "Verification Shield",
                "description": "Real UPI verification with account holder name",
                "protects_against": ["Fake UPIs", "Impersonation"],
                "can_block": False,
            },
            {
                "number": 5,
                "name": "ML Intelligence Shield",
                "description": "5 ML models for fraud detection",
                "models": ["XGBoost", "LSTM", "Isolation Forest", "GNN", "Sensor"],
                "protects_against": ["Unknown patterns", "Behavioral anomalies", "Fraud networks"],
                "can_block": False,
            },
            {
                "number": 6,
                "name": "Community Intelligence",
                "description": "Crowdsourced fraud reports from users",
                "protects_against": ["Newly identified scammers", "Emerging fraud patterns"],
                "can_block": True,
            },
            {
                "number": 7,
                "name": "Decision & Explanation",
                "description": "Final risk calculation and user explanation",
                "output": ["Risk level", "Specific reasons", "Safety tips", "Education links"],
                "can_block": False,
            },
        ],
        "usp": "Even if one layer fails, others catch the fraud. Defense in depth."
    }


@router.post("/report-scam")
async def report_scam(
    upi_id: str,
    scam_type: str,
    description: Optional[str] = None,
    amount_lost: Optional[float] = None
):
    """Report a scam UPI to community database"""
    try:
        # Add to scammer database
        success = ExcelDatabase.add_scammer(
            upi_id=upi_id,
            phone="",
            scam_type=scam_type,
            risk_level="high"
        )
        
        if success:
            return {
                "success": True,
                "message": "Thank you for reporting! Your report helps protect other users.",
                "upi_id": upi_id,
                "scam_type": scam_type
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to save report")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scam-education/{scam_type}")
async def get_scam_education(scam_type: str):
    """Get educational content about a specific scam type"""
    education_content = {
        "lottery": {
            "title": "Lottery & Prize Scams",
            "summary": "Scammers tell you that you've won a lottery or prize, but you need to pay 'taxes' or 'processing fees' to claim it.",
            "how_it_works": [
                "You receive a call/message saying you won a lottery (you never entered)",
                "They ask for 'processing fee' or 'tax' to release your prize",
                "After you pay, they ask for more fees, or disappear",
            ],
            "warning_signs": [
                "You can't win a lottery you didn't enter",
                "Real lotteries never ask for upfront payments",
                "Prizes don't require 'tax' to be paid via UPI",
            ],
            "what_to_do": [
                "Never pay to receive a prize",
                "Block the number immediately",
                "Report to Cyber Crime helpline: 1930",
            ],
            "real_examples": [
                "KBC Lottery - Fake calls claiming KBC prize",
                "Amazon/Flipkart Lucky Draw - No such draws exist",
            ]
        },
        "kyc_fraud": {
            "title": "KYC & Verification Fraud",
            "summary": "Scammers pretend to be from your bank and claim your account will be blocked if you don't 'update KYC' immediately.",
            "how_it_works": [
                "You get an SMS/call saying 'Your account will be blocked in 24 hours'",
                "They send a link to 'update KYC' which is a phishing site",
                "Or they ask you to download an app (AnyDesk) to 'help you update'",
            ],
            "warning_signs": [
                "Banks never threaten to block accounts over phone",
                "KYC updates happen at bank branches or official apps only",
                "No one needs remote access to update KYC",
            ],
            "what_to_do": [
                "Ignore such messages completely",
                "Visit your bank branch if genuinely concerned",
                "Never share OTP or download remote access apps",
            ],
        },
        "digital_arrest": {
            "title": "Digital Arrest Scam",
            "summary": "Scammers impersonate police/CBI and claim you're involved in a crime. They keep you on video call and demand money to 'clear your name'.",
            "how_it_works": [
                "You receive a call claiming to be from Police/CBI/Customs",
                "They say your Aadhaar is linked to crime/money laundering",
                "They put you on video call and show fake 'arrest warrant'",
                "They demand money to 'settle the case' and not arrest you",
            ],
            "warning_signs": [
                "Police NEVER arrest via video call",
                "No government agency asks for money to 'clear charges'",
                "Real arrests happen in person, not over phone",
                "They create panic so you don't think clearly",
            ],
            "what_to_do": [
                "Hang up immediately - it's 100% a scam",
                "Call 1930 (Cyber Crime) to report",
                "Call your local police station to verify (they will confirm it's fake)",
            ],
            "important": "⚠️ This is one of the most dangerous scams. Victims have lost crores. NO MATTER WHAT THEY SAY - HANG UP."
        },
        "refund_scam": {
            "title": "Fake Refund Scam",
            "summary": "Scammers claim you're eligible for a refund but trick you into sending money instead of receiving it.",
            "how_it_works": [
                "You receive call/SMS about a 'refund' for cancelled order/extra payment",
                "They ask you to 'enter amount' on UPI app to 'receive' the refund",
                "What you're actually doing is SENDING money, not receiving",
                "Or they send a QR code that actually deducts money",
            ],
            "warning_signs": [
                "Refunds are automatic - you never need to 'approve' them",
                "You don't need to scan QR code to receive money",
                "Entering amount and clicking 'Pay' always SENDS money",
            ],
            "what_to_do": [
                "Never scan QR codes to 'receive' money",
                "Check your bank statement for actual refunds",
                "Contact company through official website only",
            ],
        },
        "fake_support": {
            "title": "Fake Customer Support",
            "summary": "Scammers create fake customer care numbers that appear in Google search results. When you call, they steal your money.",
            "how_it_works": [
                "You search 'Amazon/Bank customer care number' on Google",
                "Scammers pay to show their fake number in top results",
                "When you call, they pretend to help but ask for remote access",
                "They use AnyDesk/TeamViewer to access your phone and steal money",
            ],
            "warning_signs": [
                "Customer care never asks for remote access",
                "They never ask you to download AnyDesk/TeamViewer",
                "Official numbers are only on company's official app/website",
            ],
            "what_to_do": [
                "Never Google for customer care numbers",
                "Find contact details only from official app/website",
                "If someone asks for AnyDesk - HANG UP immediately",
            ],
        },
    }
    
    content = education_content.get(scam_type)
    if not content:
        raise HTTPException(status_code=404, detail=f"Education content not found for: {scam_type}")
    
    return content
