"""
AI Routes — Groq LLM-powered endpoints
========================================
Provides:
  POST /ai/translate           — Translate text to any supported language
  POST /ai/translate-alerts    — Batch-translate risk alerts
  POST /ai/explain-scam        — Explain a scam in the user's language
  POST /ai/chat                — AI Scam Advisor chatbot
  POST /ai/voice-alert         — Generate dynamic voice alert text
  GET  /ai/languages           — List supported languages
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import logging

from app.services.groq_ai_service import get_groq_service, LANGUAGE_MAP
from app.api.deps import get_optional_user_id
from app.db.database import get_db
from app.db.models import Transaction, User, FraudReport, TransactionStatus, RiskLevel as DBRiskLevel
from app.db.excel_database import ExcelDatabase
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI (Groq LLM)"])

# ── Localized suggested prompts for key Indian languages ─────────────
LOCALIZED_PROMPTS = {
    "en": [
        "How can I identify a UPI scam?",
        "What should I do if I shared my OTP?",
        "Is it safe to scan QR codes from strangers?",
        "How to protect elderly parents from fraud?",
        "What are the latest UPI fraud trends?",
        "Someone is calling saying my KYC expired, is it real?",
    ],
    "hi": [
        "UPI स्कैम की पहचान कैसे करें?",
        "अगर मैंने OTP शेयर कर दिया तो क्या करूँ?",
        "अनजान लोगों के QR कोड स्कैन करना सेफ है?",
        "बुज़ुर्ग माता-पिता को फ्रॉड से कैसे बचाएं?",
        "KYC एक्सपायर हो गया बोलकर कॉल आया, क्या करूँ?",
        "UPI से पैसे कट गए तो वापस कैसे मिलेंगे?",
    ],
    "ta": [
        "UPI மோசடியை எப்படி கண்டறிவது?",
        "OTP பகிர்ந்து விட்டால் என்ன செய்ய வேண்டும்?",
        "அறிமுகமில்லாதவர்களின் QR குறியீடுகளை ஸ்கேன் செய்வது பாதுகாப்பானதா?",
        "பெரியவர்களை மோசடியிலிருந்து எப்படி காப்பது?",
        "KYC காலாவதியாகிவிட்டது என்று அழைப்பு வந்தது, உண்மையா?",
        "UPI மூலம் பணம் போய்விட்டால் எப்படி திரும்ப பெறுவது?",
    ],
    "mr": [
        "UPI घोटाळा कसा ओळखायचा?",
        "OTP शेअर केला तर काय करावे?",
        "अनोळखी लोकांचे QR कोड स्कॅन करणे सुरक्षित आहे का?",
        "वृद्ध आई-वडिलांना फसवणुकीपासून कसे वाचवायचे?",
        "KYC एक्सपायर झाल्याचा कॉल आला, खरे आहे का?",
        "UPI मधून पैसे कापले गेले तर परत कसे मिळतील?",
    ],
}


# ── Schemas ──────────────────────────────────────────────────────────────

class TranslateRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    target_language: str = Field(..., description="Language code e.g. 'hi', 'ta', 'te'")

class TranslateResponse(BaseModel):
    original: str
    translated: str
    language: str
    language_name: str

class BatchTranslateRequest(BaseModel):
    texts: List[str] = Field(..., max_length=20)
    target_language: str

class BatchTranslateResponse(BaseModel):
    translations: List[str]
    language: str

class ExplainScamRequest(BaseModel):
    scam_type: str = Field(..., description="e.g. 'lottery_scam', 'kyc_fraud'")
    risk_factors: List[str] = []
    amount: float = 0
    target_language: str = "en"

class ChatRequest(BaseModel):
    message: str = Field(..., max_length=500)
    language: str = "en"
    conversation_history: Optional[List[Dict[str, str]]] = None

class ChatResponse(BaseModel):
    reply: str
    language: str
    language_name: str

class VoiceAlertRequest(BaseModel):
    alert_type: str = Field(..., description="e.g. 'high_risk', 'fraud_recipient', 'call_warning'")
    context: Dict[str, Any] = {}
    target_language: str = "en"

class UITranslateRequest(BaseModel):
    strings: Dict[str, str] = Field(..., description="Key→English text map to translate")
    target_language: str = Field(..., description="Language code e.g. 'hi', 'ta'")

class UITranslateResponse(BaseModel):
    translations: Dict[str, str]
    language: str
    language_name: str


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/languages")
async def get_supported_languages():
    """List all supported languages for AI translation."""
    svc = get_groq_service()
    return {
        "available": svc.available,
        "model": svc.model if svc.available else None,
        "languages": [
            {"code": code, "name": name}
            for code, name in LANGUAGE_MAP.items()
        ],
    }


@router.get("/suggested-prompts")
async def get_suggested_prompts(language: str = "en"):
    """Get suggested chatbot prompts in the user's preferred language."""
    prompts = LOCALIZED_PROMPTS.get(language, LOCALIZED_PROMPTS["en"])
    return {
        "language": language,
        "prompts": prompts,
    }


@router.post("/translate", response_model=TranslateResponse)
async def translate_text(request: TranslateRequest):
    """Translate any text into a supported Indian language using Groq LLaMA."""
    svc = get_groq_service()
    if not svc.available:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    translated = await svc.translate(request.text, request.target_language)
    lang_name = LANGUAGE_MAP.get(request.target_language, request.target_language)

    return TranslateResponse(
        original=request.text,
        translated=translated or request.text,
        language=request.target_language,
        language_name=lang_name,
    )


@router.post("/translate-alerts", response_model=BatchTranslateResponse)
async def translate_alerts(request: BatchTranslateRequest):
    """Batch-translate risk alert strings (efficient single-call)."""
    svc = get_groq_service()
    if not svc.available:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    translated = await svc.translate_risk_alerts(request.texts, request.target_language)

    return BatchTranslateResponse(
        translations=translated,
        language=request.target_language,
    )


@router.post("/explain-scam")
async def explain_scam(request: ExplainScamRequest):
    """Explain why a transaction is risky in the user's preferred language."""
    svc = get_groq_service()
    if not svc.available:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    explanation = await svc.explain_scam(
        scam_type=request.scam_type,
        risk_factors=request.risk_factors,
        amount=request.amount,
        target_language_code=request.target_language,
    )

    return {
        "explanation": explanation,
        "scam_type": request.scam_type,
        "language": request.target_language,
        "language_name": LANGUAGE_MAP.get(request.target_language, request.target_language),
    }


@router.post("/chat", response_model=ChatResponse)
async def scam_advisor_chat(
    request: ChatRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    AI Scam Advisor chatbot — answers fraud-related questions in any language.
    
    When the user is authenticated (Bearer token), the chatbot gets access to
    the user's real transaction history, risk assessments, and recipient
    scammer checks — enabling personalised answers like "are my past
    transactions safe?" or "is this person a scammer?"
    
    Send conversation_history as a list of {role: 'user'|'assistant', content: '...'}
    for multi-turn conversations.
    """
    svc = get_groq_service()
    if not svc.available:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    # ── Build user context from DB if authenticated ──────────────────
    user_context = None
    if user_id:
        try:
            user_context = await _build_user_context(user_id, db)
        except Exception as exc:
            logger.warning("Failed to build user context for chat: %s", exc)

    reply = await svc.scam_advisor_chat(
        user_message=request.message,
        language_code=request.language,
        conversation_history=request.conversation_history,
        user_context=user_context,
    )

    return ChatResponse(
        reply=reply or "I'm sorry, I couldn't process your question. Please try again.",
        language=request.language,
        language_name=LANGUAGE_MAP.get(request.language, "English"),
    )


async def _build_user_context(user_id: str, db: AsyncSession) -> Dict[str, Any]:
    """
    Fetch the authenticated user's profile, recent transactions, flagged
    transactions, and cross-check recipients against the scammer database.
    Returns a dict ready to be injected into the AI system prompt.
    """
    context: Dict[str, Any] = {}

    # 1. User profile summary
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    # Get completed transaction stats
    txn_stats = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .where(Transaction.status == TransactionStatus.COMPLETED)
    )
    completed = txn_stats.scalars().all()
    amounts = [float(t.amount) for t in completed if t.amount]
    context["profile"] = {
        "total_transactions": len(completed),
        "avg_transaction_amount": sum(amounts) / len(amounts) if amounts else 0,
        "max_transaction_amount": max(amounts) if amounts else 0,
        "security_score": getattr(user, "security_score", 50) if user else 50,
    }

    # 2. Recent transactions (last 15)
    recent_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(desc(Transaction.created_at))
        .limit(15)
    )
    recent_txns = recent_result.scalars().all()

    context["recent_transactions"] = [
        {
            "amount": float(t.amount) if t.amount else 0,
            "recipient_name": t.recipient_name or "Unknown",
            "recipient_upi": t.recipient_upi or "?",
            "status": t.status.value if t.status else "?",
            "risk_level": t.risk_level.value if t.risk_level else "NONE",
            "risk_score": round(float(t.risk_score), 2) if t.risk_score else 0,
            "risk_factors": t.risk_factors or "",
            "created_at": t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else "",
        }
        for t in recent_txns
    ]

    # 3. Flagged/risky/blocked transactions
    flagged_result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .where(
            (Transaction.risk_level.in_([
                DBRiskLevel.HIGH, DBRiskLevel.CRITICAL
            ])) |
            (Transaction.status.in_([
                TransactionStatus.BLOCKED, TransactionStatus.CANCELLED
            ]))
        )
        .order_by(desc(Transaction.created_at))
        .limit(10)
    )
    flagged_txns = flagged_result.scalars().all()
    context["flagged_transactions"] = [
        {
            "amount": float(t.amount) if t.amount else 0,
            "recipient_name": t.recipient_name or "Unknown",
            "recipient_upi": t.recipient_upi or "?",
            "status": t.status.value if t.status else "?",
            "risk_level": t.risk_level.value if t.risk_level else "?",
            "risk_score": round(float(t.risk_score), 2) if t.risk_score else 0,
            "risk_factors": t.risk_factors or "",
        }
        for t in flagged_txns
    ]

    # 4. Check each unique recipient against the scammer database
    unique_upis = list({t.recipient_upi for t in recent_txns if t.recipient_upi})
    scammer_hits = []
    for upi in unique_upis:
        hit = ExcelDatabase.check_scammer(upi)
        if hit:
            scammer_hits.append(hit)
    context["scammer_recipients"] = scammer_hits
    context["clean_recipients_count"] = len(unique_upis) - len(scammer_hits)

    # 5. User's own fraud reports
    try:
        reports_result = await db.execute(
            select(FraudReport)
            .where(FraudReport.reporter_id == user_id)
            .order_by(desc(FraudReport.created_at))
            .limit(5)
        )
        user_reports = reports_result.scalars().all()
        context["user_fraud_reports"] = [
            {
                "scammer_upi": r.scammer_upi,
                "scam_type": r.scam_type,
                "amount_lost": float(r.amount_lost) if r.amount_lost else 0,
                "status": r.status or "pending",
                "created_at": r.created_at.strftime("%Y-%m-%d") if r.created_at else "",
            }
            for r in user_reports
        ]
    except Exception:
        context["user_fraud_reports"] = []

    # 6. Platform-wide safety stats (aggregate, no PII)
    try:
        total_txns = await db.execute(
            select(func.count(Transaction.id))
        )
        blocked_txns = await db.execute(
            select(func.count(Transaction.id))
            .where(Transaction.status == TransactionStatus.BLOCKED)
        )
        total_reports = await db.execute(
            select(func.count(FraudReport.id))
        )
        context["platform_stats"] = {
            "total_transactions": total_txns.scalar() or 0,
            "blocked_transactions": blocked_txns.scalar() or 0,
            "total_fraud_reports": total_reports.scalar() or 0,
        }
    except Exception:
        context["platform_stats"] = {}

    return context


@router.post("/voice-alert")
async def generate_voice_alert(request: VoiceAlertRequest):
    """Generate a dynamic voice alert in the specified language."""
    svc = get_groq_service()
    if not svc.available:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    alert_text = await svc.generate_voice_alert(
        alert_type=request.alert_type,
        context=request.context,
        target_language_code=request.target_language,
    )

    return {
        "alert_text": alert_text,
        "alert_type": request.alert_type,
        "language": request.target_language,
    }


@router.post("/translate-ui", response_model=UITranslateResponse)
async def translate_ui_strings(request: UITranslateRequest):
    """
    Batch-translate UI strings (keyed dict) into a target language in one LLM call.
    Input:  { strings: {"nav_home": "Home", "nav_pay": "Pay", ...}, target_language: "hi" }
    Output: { translations: {"nav_home": "होम", "nav_pay": "भुगतान", ...}, ... }
    """
    svc = get_groq_service()
    if not svc.available:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    if len(request.strings) > 60:
        raise HTTPException(status_code=400, detail="Max 60 strings per request")

    translated = await svc.translate_ui_strings(request.strings, request.target_language)
    lang_name = LANGUAGE_MAP.get(request.target_language, request.target_language)

    return UITranslateResponse(
        translations=translated,
        language=request.target_language,
        language_name=lang_name,
    )
