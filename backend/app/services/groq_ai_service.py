"""
Groq AI Service — LLM-powered features for UPI SafeGuard
==========================================================
Uses Groq's ultra-fast LLaMA 3.3 70B model for:
  1. Real-time translation of risk alerts into 12 Indian languages
  2. AI Scam Advisor chatbot (answers fraud questions in any language)
  3. Smart contextual voice-alert generation
  4. Scam explanation in the user's mother tongue
"""

from typing import Dict, Any, List, Optional
from groq import Groq
import logging
import json
import asyncio
from functools import lru_cache

from app.config import settings

logger = logging.getLogger(__name__)

# Language code → full name mapping (matching frontend Settings.tsx)
LANGUAGE_MAP: Dict[str, str] = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
    "mr": "Marathi",
    "bn": "Bengali",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "or": "Odia",
    "as": "Assamese",
}


class GroqAIService:
    """Singleton service wrapping the Groq LLM client."""

    def __init__(self):
        self.client: Optional[Groq] = None
        self.model = settings.GROQ_MODEL
        self._init_client()

    def _init_client(self):
        try:
            if settings.GROQ_API_KEY and settings.GROQ_API_KEY != "":
                self.client = Groq(api_key=settings.GROQ_API_KEY)
                logger.info("✅ Groq AI client initialised (model: %s)", self.model)
            else:
                logger.warning("⚠️ GROQ_API_KEY not set — AI features disabled")
        except Exception as exc:
            logger.warning("⚠️ Groq client init failed: %s", exc)

    @property
    def available(self) -> bool:
        return self.client is not None

    # ── 1. Translate text ────────────────────────────────────────────────
    async def translate(
        self,
        text: str,
        target_language_code: str,
        context: str = "UPI digital payments fraud prevention",
    ) -> str:
        """Translate text into any of the 12 supported Indian languages."""
        if not self.available:
            return text
        if target_language_code == "en":
            return text  # already in English

        lang_name = LANGUAGE_MAP.get(target_language_code, target_language_code)

        prompt = (
            f"Translate the following text into {lang_name}. "
            f"Context: {context}. Keep UPI-specific terms (UPI, OTP, KYC) as-is. "
            f"Return ONLY the translated text, nothing else.\n\n"
            f"Text: {text}"
        )

        return await self._chat(prompt, max_tokens=1024)

    # ── 2. Translate risk alerts (batch) ─────────────────────────────────
    async def translate_risk_alerts(
        self,
        alerts: List[str],
        target_language_code: str,
    ) -> List[str]:
        """Translate a list of risk alert strings in a single LLM call."""
        if not self.available or target_language_code == "en" or not alerts:
            return alerts

        lang_name = LANGUAGE_MAP.get(target_language_code, target_language_code)
        numbered = "\n".join(f"{i+1}. {a}" for i, a in enumerate(alerts))

        prompt = (
            f"Translate each numbered line into {lang_name}. "
            "Keep UPI/OTP/KYC terms as-is. Return ONLY the numbered translations.\n\n"
            f"{numbered}"
        )

        result = await self._chat(prompt, max_tokens=2048)
        # Parse numbered lines back
        lines = [l.strip() for l in result.strip().split("\n") if l.strip()]
        translated: List[str] = []
        for line in lines:
            # Strip leading number + dot, e.g. "1. translated text"
            parts = line.split(". ", 1)
            translated.append(parts[1] if len(parts) > 1 else line)

        # Fallback: if parsing gave wrong count, return originals
        if len(translated) != len(alerts):
            return alerts
        return translated

    # ── 3. Explain a scam in the user's language ─────────────────────────
    async def explain_scam(
        self,
        scam_type: str,
        risk_factors: List[str],
        amount: float,
        target_language_code: str = "en",
    ) -> str:
        """Generate a clear, empathetic scam explanation in the target language."""
        if not self.available:
            return f"This transaction may be a {scam_type} scam. Please be careful."

        lang_name = LANGUAGE_MAP.get(target_language_code, target_language_code)

        prompt = (
            f"You are a friendly fraud prevention advisor for UPI digital payments in India. "
            f"Explain this potential fraud to a user in {lang_name}.\n\n"
            f"Scam type: {scam_type}\n"
            f"Risk factors: {', '.join(risk_factors)}\n"
            f"Transaction amount: ₹{amount:,.0f}\n\n"
            f"Rules:\n"
            f"- Use simple language a non-technical person can understand\n"
            f"- Be empathetic and helpful, not scary\n"
            f"- Explain WHY this is risky\n"
            f"- Give 1-2 actionable tips\n"
            f"- Keep it under 100 words\n"
            f"- Write entirely in {lang_name}"
        )

        return await self._chat(prompt, max_tokens=512)

    # ── 4. AI Scam Advisor (chatbot) ────────────────────────────────────
    async def scam_advisor_chat(
        self,
        user_message: str,
        language_code: str = "en",
        conversation_history: Optional[List[Dict[str, str]]] = None,
        user_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        AI-powered scam advisor chatbot that answers fraud-related questions
        in the user's preferred language.  When user_context is provided the
        model can reference the user's real transaction history and recipient
        safety information.
        """
        if not self.available:
            return "AI advisor is currently unavailable. Please try again later."

        lang_name = LANGUAGE_MAP.get(language_code, "English")

        is_local_language = language_code != "en"

        system_prompt = (
            f"You are 'SafeGuard AI', a friendly, expert fraud prevention advisor "
            f"for UPI digital payments in India. "
            f"Respond in {lang_name}.\n\n"
            f"Your knowledge covers:\n"
            f"- UPI fraud types (lottery, KYC, OTP, job, investment, digital arrest scams)\n"
            f"- How to verify if a payment request is legitimate\n"
            f"- What to do after being scammed (report to bank, cybercrime portal)\n"
            f"- How UPI SafeGuard's AI protects users\n"
            f"- General digital payment safety\n\n"
        )

        # ── Enhanced instructions for local-language users ────────────
        if is_local_language:
            system_prompt += (
                f"IMPORTANT — The user is communicating in {lang_name}. "
                f"They may be a rural, elderly, or first-generation UPI user. Follow these rules:\n"
                f"- Use very simple, everyday {lang_name} words — avoid English jargon\n"
                f"- Explain technical terms (OTP, phishing, malware) in {lang_name} with examples\n"
                f"- Use relatable analogies (e.g., 'OTP is like the key to your locker')\n"
                f"- Be warm, respectful, and patient — like talking to a family elder\n"
                f"- Give step-by-step instructions when explaining what to do\n"
                f"- Mention the 1930 helpline and cybercrime.gov.in in every safety answer\n"
                f"- If the user seems confused, reassure them and simplify further\n\n"
            )

        # ── Inject real user data if available ────────────────────────
        if user_context:
            system_prompt += "=== USER'S REAL DATA (from database) ===\n"

            # Profile summary
            profile = user_context.get("profile")
            if profile:
                system_prompt += (
                    f"User profile: {profile.get('total_transactions', 0)} total transactions, "
                    f"avg amount ₹{profile.get('avg_transaction_amount', 0):.0f}, "
                    f"max amount ₹{profile.get('max_transaction_amount', 0):.0f}, "
                    f"security score {profile.get('security_score', 'N/A')}/100.\n"
                )

            # Recent transactions
            txns = user_context.get("recent_transactions", [])
            if txns:
                system_prompt += f"\nRecent transactions ({len(txns)} most recent):\n"
                for t in txns:
                    risk_tag = ""
                    if t.get("risk_level") and t["risk_level"] not in ("NONE", "LOW"):
                        risk_tag = f" ⚠ RISK={t['risk_level']} score={t.get('risk_score', '?')}"
                    system_prompt += (
                        f"  • ₹{t.get('amount', 0)} → {t.get('recipient_name', 'Unknown')} "
                        f"({t.get('recipient_upi', '?')}) — {t.get('status', '?')}"
                        f"{risk_tag} [{t.get('created_at', '')}]\n"
                    )

            # Flagged / risky transactions
            flagged = user_context.get("flagged_transactions", [])
            if flagged:
                system_prompt += f"\n⚠ Flagged/blocked transactions ({len(flagged)}):\n"
                for t in flagged:
                    system_prompt += (
                        f"  • ₹{t.get('amount', 0)} → {t.get('recipient_name', 'Unknown')} "
                        f"({t.get('recipient_upi', '?')}) — status={t.get('status', '?')} "
                        f"risk={t.get('risk_level', '?')} score={t.get('risk_score', '?')} "
                        f"factors={t.get('risk_factors', '')}\n"
                    )

            # Scammer checks on recipients
            scammer_hits = user_context.get("scammer_recipients", [])
            if scammer_hits:
                system_prompt += f"\n🚨 Recipients found in scammer database ({len(scammer_hits)}):\n"
                for s in scammer_hits:
                    system_prompt += (
                        f"  • {s.get('upi_id', '?')} — scam type: {s.get('scam_type', '?')}, "
                        f"risk: {s.get('risk_level', '?')}, reports: {s.get('report_count', 0)}, "
                        f"total stolen: ₹{s.get('total_amount_stolen', 0)}\n"
                    )

            clean_count = user_context.get("clean_recipients_count", 0)
            if clean_count:
                system_prompt += f"✅ {clean_count} recent recipients are NOT in the scammer database.\n"

            # User's fraud reports
            user_reports = user_context.get("user_fraud_reports", [])
            if user_reports:
                system_prompt += f"\n📝 User's submitted fraud reports ({len(user_reports)}):\n"
                for r in user_reports:
                    system_prompt += (
                        f"  • Reported {r.get('scammer_upi', '?')} — type: {r.get('scam_type', '?')}, "
                        f"amount lost: ₹{r.get('amount_lost', 0)}, status: {r.get('status', '?')} "
                        f"[{r.get('created_at', '')}]\n"
                    )

            # Platform safety stats
            pstats = user_context.get("platform_stats", {})
            if pstats:
                system_prompt += (
                    f"\n📊 Platform stats: {pstats.get('total_transactions', 0)} total transactions, "
                    f"{pstats.get('blocked_transactions', 0)} blocked, "
                    f"{pstats.get('total_fraud_reports', 0)} fraud reports filed.\n"
                )

            system_prompt += "=== END OF USER DATA ===\n\n"

        system_prompt += (
            f"Rules:\n"
            f"- Be concise (max 200 words)\n"
            f"- Use simple language\n"
            f"- If the user asks about their transactions, refer to the real data above\n"
            f"- If the user asks about a specific recipient, check if they appear in scammer hits\n"
            f"- If the user asks about their fraud reports, reference the reports data above\n"
            f"- If the user asks about platform safety, cite the platform stats above\n"
            f"- If the question is NOT about fraud/payments/their transactions, politely redirect\n"
            f"- Always respond entirely in {lang_name} (not a single word in another language unless it is a UPI/OTP/KYC term)\n"
            f"- Include actionable advice when possible\n"
            f"- Mention cybercrime.gov.in or 1930 helpline when relevant\n"
            f"- If the user's message is in a local language, mirror their language style"
        )

        messages = [{"role": "system", "content": system_prompt}]
        if conversation_history:
            messages.extend(conversation_history[-6:])  # keep last 3 exchanges
        messages.append({"role": "user", "content": user_message})

        return await self._chat_with_messages(messages, max_tokens=512)

    # ── 5. Generate smart voice alert ────────────────────────────────────
    async def generate_voice_alert(
        self,
        alert_type: str,
        context: Dict[str, Any],
        target_language_code: str = "en",
    ) -> str:
        """Generate a dynamic voice alert in any supported language."""
        if not self.available:
            return ""

        lang_name = LANGUAGE_MAP.get(target_language_code, "English")

        prompt = (
            f"Generate a short spoken voice alert (1-2 sentences, max 30 words) "
            f"in {lang_name} for a UPI payment app.\n\n"
            f"Alert type: {alert_type}\n"
            f"Context: {json.dumps(context, default=str)}\n\n"
            f"The alert should sound natural when spoken aloud (text-to-speech). "
            f"Be urgent but not scary. Write ONLY the alert text."
        )

        return await self._chat(prompt, max_tokens=128)

    # ── 6. Translate risk assessment result ─────────────────────────────
    async def translate_risk_result(
        self,
        risk_result: Dict[str, Any],
        target_language_code: str,
    ) -> Dict[str, Any]:
        """Translate the human-readable parts of a risk assessment result."""
        if not self.available or target_language_code == "en":
            return risk_result

        # Fields to translate
        to_translate: List[str] = []
        keys_to_translate = []

        for key in ["primary_reason", "education_link"]:
            val = risk_result.get(key)
            if val and isinstance(val, str):
                to_translate.append(val)
                keys_to_translate.append(key)

        # Translate all_reasons and safety_tips
        all_reasons = risk_result.get("all_reasons", [])
        safety_tips = risk_result.get("safety_tips", [])
        risk_factors = risk_result.get("risk_factors", [])
        explanations = risk_result.get("explanations", [])

        combined = to_translate + all_reasons + safety_tips + risk_factors + explanations
        if not combined:
            return risk_result

        translated = await self.translate_risk_alerts(combined, target_language_code)

        idx = 0
        result = {**risk_result}
        for key in keys_to_translate:
            result[key] = translated[idx]
            idx += 1

        result["all_reasons"] = translated[idx:idx + len(all_reasons)]
        idx += len(all_reasons)
        result["safety_tips"] = translated[idx:idx + len(safety_tips)]
        idx += len(safety_tips)
        result["risk_factors"] = translated[idx:idx + len(risk_factors)]
        idx += len(risk_factors)
        result["explanations"] = translated[idx:idx + len(explanations)]

        return result

    # ── 7. Translate UI strings (batch, keyed) ────────────────────────────
    async def translate_ui_strings(
        self,
        strings: Dict[str, str],
        target_language_code: str,
    ) -> Dict[str, str]:
        """
        Translate a dict of {key: english_text} into the target language.
        Returns {key: translated_text}.  Efficient single-call approach.
        """
        if not self.available or target_language_code == "en" or not strings:
            return strings

        lang_name = LANGUAGE_MAP.get(target_language_code, target_language_code)
        # Build numbered list for the LLM
        keys = list(strings.keys())
        numbered = "\n".join(f"{i+1}. {strings[k]}" for i, k in enumerate(keys))

        prompt = (
            f"Translate each numbered line into {lang_name}. "
            "Keep UPI/OTP/KYC/PIN and monetary symbols (₹) as-is. "
            "Keep numbers, amounts, and names as-is. "
            "Return ONLY the numbered translations, one per line.\n\n"
            f"{numbered}"
        )

        result = await self._chat(prompt, max_tokens=4096)
        lines = [l.strip() for l in result.strip().split("\n") if l.strip()]
        translated: List[str] = []
        for line in lines:
            parts = line.split(". ", 1)
            translated.append(parts[1] if len(parts) > 1 else line)

        if len(translated) != len(keys):
            return strings  # fallback

        return {keys[i]: translated[i] for i in range(len(keys))}

    # ── Internal helpers ────────────────────────────────────────────────
    async def _chat(self, prompt: str, max_tokens: int = 512) -> str:
        """Single-turn LLM call."""
        return await self._chat_with_messages(
            [{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )

    async def _chat_with_messages(
        self, messages: list, max_tokens: int = 512
    ) -> str:
        """Run Groq chat completion in a thread to avoid blocking the event loop."""
        if not self.client:
            return ""
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content.strip()
        except Exception as exc:
            logger.error("Groq API error: %s", exc)
            return ""


# ── Singleton ───────────────────────────────────────────────────────────
_service: Optional[GroqAIService] = None


def get_groq_service() -> GroqAIService:
    global _service
    if _service is None:
        _service = GroqAIService()
    return _service
