package com.upisafeguard.core.ai;

import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * LLM feature logic for the AI surface, translated 1:1 from
 * backend/app/services/groq_ai_service.py (Groq, LLaMA 3.3-70B):
 * translation, batch alert translation, scam explanations, the SafeGuard AI
 * advisor chatbot, voice alerts and keyed UI translation.
 */
@Component
public class AiService {

    /** Language code → full name (matches frontend Settings.tsx). */
    private static final Map<String, String> LANGUAGE_MAP = buildLanguageMap();

    /** Localized suggested prompts for key Indian languages. */
    private static final Map<String, List<String>> LOCALIZED_PROMPTS = buildLocalizedPrompts();

    private static final DecimalFormat AMOUNT_FORMAT = new DecimalFormat("#,##0");

    private final GroqClient groqClient;
    private final ObjectMapper objectMapper;
    private final boolean demoFallback;

    @Autowired
    public AiService(
            GroqClient groqClient,
            ObjectMapper objectMapper,
            @Value("${groq.demo-fallback}") boolean demoFallback) {
        this.groqClient = groqClient;
        this.objectMapper = objectMapper;
        this.demoFallback = demoFallback;
    }

    // ── Capabilities ─────────────────────────────────────────────────────

    public boolean isAvailable() {
        return groqClient.available();
    }

    public String model() {
        return groqClient.available() ? groqClient.model() : null;
    }

    public List<Map<String, String>> languages() {
        List<Map<String, String>> result = new ArrayList<>();
        for (Map.Entry<String, String> entry : LANGUAGE_MAP.entrySet()) {
            Map<String, String> language = new LinkedHashMap<>();
            language.put("code", entry.getKey());
            language.put("name", entry.getValue());
            result.add(language);
        }
        return result;
    }

    public String languageName(String code) {
        return LANGUAGE_MAP.getOrDefault(code, code);
    }

    public List<String> suggestedPrompts(String language) {
        return LOCALIZED_PROMPTS.getOrDefault(language, LOCALIZED_PROMPTS.get("en"));
    }

    // ── 1. Translate text ────────────────────────────────────────────────

    public String translate(String text, String targetLanguageCode) {
        if (!groqClient.available() || "en".equals(targetLanguageCode)) {
            return text;
        }
        String langName = languageName(targetLanguageCode);
        String prompt = "Translate the following text into " + langName
                + ". Context: UPI digital payments fraud prevention. "
                + "Keep UPI-specific terms (UPI, OTP, KYC) as-is. "
                + "Return ONLY the translated text, nothing else.\n\n"
                + "Text: " + text;
        return groqClient.complete(List.of(message("user", prompt)), 1024);
    }

    // ── 2. Translate risk alerts (batch, numbered) ───────────────────────

    public List<String> translateAlerts(List<String> alerts, String targetLanguageCode) {
        if (!groqClient.available() || "en".equals(targetLanguageCode) || alerts == null || alerts.isEmpty()) {
            return alerts;
        }
        String langName = languageName(targetLanguageCode);
        StringBuilder numbered = new StringBuilder();
        for (int i = 0; i < alerts.size(); i++) {
            numbered.append(i + 1).append(". ").append(alerts.get(i));
            if (i < alerts.size() - 1) {
                numbered.append('\n');
            }
        }
        String prompt = "Translate each numbered line into " + langName + ". "
                + "Keep UPI/OTP/KYC terms as-is. Return ONLY the numbered translations.\n\n"
                + numbered;
        String result = groqClient.complete(List.of(message("user", prompt)), 2048);

        List<String> translated = parseNumberedLines(result);
        if (translated.size() != alerts.size()) {
            return alerts;
        }
        return translated;
    }

    // ── 3. Explain a scam in the user's language ─────────────────────────

    public String explainScam(String scamType, List<String> riskFactors, double amount, String targetLanguageCode) {
        if (!groqClient.available()) {
            return "This transaction may be a " + scamType + " scam. Please be careful.";
        }
        String langName = languageName(targetLanguageCode);
        String factors = riskFactors == null ? "" : String.join(", ", riskFactors);
        String prompt = "You are a friendly fraud prevention advisor for UPI digital payments in India. "
                + "Explain this potential fraud to a user in " + langName + ".\n\n"
                + "Scam type: " + scamType + "\n"
                + "Risk factors: " + factors + "\n"
                + "Transaction amount: ₹" + AMOUNT_FORMAT.format(amount) + "\n\n"
                + "Rules:\n"
                + "- Use simple language a non-technical person can understand\n"
                + "- Be empathetic and helpful, not scary\n"
                + "- Explain WHY this is risky\n"
                + "- Give 1-2 actionable tips\n"
                + "- Keep it under 100 words\n"
                + "- Write entirely in " + langName;
        return groqClient.complete(List.of(message("user", prompt)), 512);
    }

    // ── 4. AI Scam Advisor (chatbot) ─────────────────────────────────────

    /**
     * Builds the SafeGuard AI advisor conversation. Personalised context from
     * the user's transaction history is injected once the payment-transaction
     * parity port lands (see backend/app/api/routes/ai.py _build_user_context).
     */
    public String chat(String userMessage, String languageCode, List<Map<String, String>> conversationHistory) {
        String langName = LANGUAGE_MAP.getOrDefault(languageCode, "English");

        StringBuilder systemPrompt = new StringBuilder(
                "You are 'SafeGuard AI', a friendly, expert fraud prevention advisor "
                        + "for UPI digital payments in India. "
                        + "Respond in " + langName + ".\n\n"
                        + "Your knowledge covers:\n"
                        + "- UPI fraud types (lottery, KYC, OTP, job, investment, digital arrest scams)\n"
                        + "- How to verify if a payment request is legitimate\n"
                        + "- What to do after being scammed (report to bank, cybercrime portal)\n"
                        + "- How UPI SafeGuard's AI protects users\n"
                        + "- General digital payment safety\n\n");

        if (!"en".equals(languageCode)) {
            systemPrompt.append(
                    "IMPORTANT — The user is communicating in " + langName + ". "
                            + "They may be a rural, elderly, or first-generation UPI user. Follow these rules:\n"
                            + "- Use very simple, everyday " + langName + " words — avoid English jargon\n"
                            + "- Explain technical terms (OTP, phishing, malware) in " + langName + " with examples\n"
                            + "- Use relatable analogies (e.g., 'OTP is like the key to your locker')\n"
                            + "- Be warm, respectful, and patient — like talking to a family elder\n"
                            + "- Give step-by-step instructions when explaining what to do\n"
                            + "- Mention the 1930 helpline and cybercrime.gov.in in every safety answer\n"
                            + "- If the user seems confused, reassure them and simplify further\n\n");
        }

        systemPrompt.append("Rules:\n")
                .append("- Be concise (max 200 words)\n")
                .append("- Use simple language\n")
                .append("- If the question is NOT about fraud/payments/their transactions, politely redirect\n")
                .append("- Always respond entirely in ").append(langName)
                .append(" (not a single word in another language unless it is a UPI/OTP/KYC term)\n")
                .append("- Include actionable advice when possible\n")
                .append("- Mention cybercrime.gov.in or 1930 helpline when relevant\n")
                .append("- If the user's message is in a local language, mirror their language style");

        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(message("system", systemPrompt.toString()));
        if (conversationHistory != null && !conversationHistory.isEmpty()) {
            // keep the last 3 exchanges, mirroring the Python [-6:] slice
            List<Map<String, String>> history = conversationHistory;
            int from = Math.max(0, history.size() - 6);
            for (Map<String, String> turn : history.subList(from, history.size())) {
                messages.add(message(turn.getOrDefault("role", "user"), turn.getOrDefault("content", "")));
            }
        }
        messages.add(message("user", userMessage));

        return groqClient.complete(messages, 512);
    }

    // ── 5. Generate smart voice alert ────────────────────────────────────

    public String voiceAlert(String alertType, Map<String, Object> context, String targetLanguageCode) {
        if (!groqClient.available()) {
            return "";
        }
        String langName = LANGUAGE_MAP.getOrDefault(targetLanguageCode, "English");
        String contextJson;
        try {
            contextJson = objectMapper.writeValueAsString(context == null ? Map.of() : context);
        } catch (JsonProcessingException exception) {
            contextJson = "{}";
        }
        String prompt = "Generate a short spoken voice alert (1-2 sentences, max 30 words) "
                + "in " + langName + " for a UPI payment app.\n\n"
                + "Alert type: " + alertType + "\n"
                + "Context: " + contextJson + "\n\n"
                + "The alert should sound natural when spoken aloud (text-to-speech). "
                + "Be urgent but not scary. Write ONLY the alert text.";
        return groqClient.complete(List.of(message("user", prompt)), 128);
    }

    // ── 6. Translate UI strings (batch, keyed) ──────────────────────────

    public Map<String, String> translateUi(Map<String, String> strings, String targetLanguageCode) {
        if (!groqClient.available() || "en".equals(targetLanguageCode) || strings == null || strings.isEmpty()) {
            return strings;
        }
        String langName = languageName(targetLanguageCode);
        List<String> keys = new ArrayList<>(strings.keySet());
        StringBuilder numbered = new StringBuilder();
        for (int i = 0; i < keys.size(); i++) {
            numbered.append(i + 1).append(". ").append(strings.get(keys.get(i)));
            if (i < keys.size() - 1) {
                numbered.append('\n');
            }
        }
        String prompt = "Translate each numbered line into " + langName + ". "
                + "Keep UPI/OTP/KYC/PIN and monetary symbols (₹) as-is. "
                + "Keep numbers, amounts, and names as-is. "
                + "Return ONLY the numbered translations, one per line.\n\n"
                + numbered;
        String result = groqClient.complete(List.of(message("user", prompt)), 4096);

        List<String> translated = parseNumberedLines(result);
        if (translated.size() != keys.size()) {
            return strings;
        }
        Map<String, String> mapped = new LinkedHashMap<>();
        for (int i = 0; i < keys.size(); i++) {
            mapped.put(keys.get(i), translated.get(i));
        }
        return mapped;
    }

    // ── 7. Deterministic demo advisor (no GROQ_API_KEY) ──────────────────

    /** Transparent, deterministic guidance when Groq is not configured. */
    public String demoAdvisorReply(String messageText) {
        String normalized = messageText == null ? "" : messageText.toLowerCase();
        if (normalized.contains("otp") || normalized.contains("one-time")) {
            return "Demo safety guidance: never share an OTP, UPI PIN, or screen with anyone. "
                    + "Banks and legitimate support teams do not need your OTP to receive money. "
                    + "If you shared one, contact your bank immediately and freeze affected payments.";
        }
        if (normalized.contains("qr")) {
            return "Demo safety guidance: scanning a QR code and entering a UPI PIN usually sends money; "
                    + "it does not receive money. Only scan codes from trusted recipients and verify the name "
                    + "shown in your UPI app before confirming.";
        }
        if (normalized.contains("scam") || normalized.contains("fraud") || normalized.contains("safe")) {
            return "Demo safety guidance: pause when a caller creates urgency, requests an OTP or UPI PIN, "
                    + "asks you to install a remote-support app, or promises guaranteed returns. Verify through "
                    + "the organisation's official website or phone number before paying.";
        }
        return "Demo safety guidance: verify the recipient name and UPI ID, never share your OTP or UPI PIN, "
                + "and stop the payment if someone is pressuring you. This local response is deterministic demo "
                + "content; configure GROQ_API_KEY to enable the live AI advisor.";
    }

    public boolean demoFallbackEnabled() {
        return demoFallback;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Map<String, String> message(String role, String content) {
        return Map.of("role", role, "content", content);
    }

    /** Parse "1. translated" lines back to bare translations. */
    private List<String> parseNumberedLines(String result) {
        List<String> translated = new ArrayList<>();
        if (result == null || result.isBlank()) {
            return translated;
        }
        for (String line : result.strip().split("\n")) {
            String trimmed = line.strip();
            if (trimmed.isEmpty()) {
                continue;
            }
            int dot = trimmed.indexOf(". ");
            translated.add(dot >= 0 ? trimmed.substring(dot + 2) : trimmed);
        }
        return translated;
    }

    private static Map<String, String> buildLanguageMap() {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("en", "English");
        map.put("hi", "Hindi");
        map.put("ta", "Tamil");
        map.put("te", "Telugu");
        map.put("kn", "Kannada");
        map.put("ml", "Malayalam");
        map.put("mr", "Marathi");
        map.put("bn", "Bengali");
        map.put("gu", "Gujarati");
        map.put("pa", "Punjabi");
        map.put("or", "Odia");
        map.put("as", "Assamese");
        return map;
    }

    private static Map<String, List<String>> buildLocalizedPrompts() {
        Map<String, List<String>> prompts = new LinkedHashMap<>();
        prompts.put("en", List.of(
                "How can I identify a UPI scam?",
                "What should I do if I shared my OTP?",
                "Is it safe to scan QR codes from strangers?",
                "How to protect elderly parents from fraud?",
                "What are the latest UPI fraud trends?",
                "Someone is calling saying my KYC expired, is it real?"));
        prompts.put("hi", List.of(
                "UPI स्कैम की पहचान कैसे करें?",
                "अगर मैंने OTP शेयर कर दिया तो क्या करूँ?",
                "अनजान लोगों के QR कोड स्कैन करना सेफ है?",
                "बुज़ुर्ग माता-पिता को फ्रॉड से कैसे बचाएं?",
                "KYC एक्सपायर हो गया बोलकर कॉल आया, क्या करूँ?",
                "UPI से पैसे कट गए तो वापस कैसे मिलेंगे?"));
        prompts.put("ta", List.of(
                "UPI மோசடியை எப்படி கண்டறிவது?",
                "OTP பகிர்ந்து விட்டால் என்ன செய்ய வேண்டும்?",
                "அறிமுகமில்லாதவர்களின் QR குறியீடுகளை ஸ்கேன் செய்வது பாதுகாப்பானதா?",
                "பெரியவர்களை மோசடியிலிருந்து எப்படி காப்பது?",
                "KYC காலாவதியாகிவிட்டது என்று அழைப்பு வந்தது, உண்மையா?",
                "UPI மூலம் பணம் போய்விட்டால் எப்படி திரும்ப பெறுவது?"));
        prompts.put("mr", List.of(
                "UPI घोटाळा कसा ओळखायचा?",
                "OTP शेअर केला तर काय करावे?",
                "अनोळखी लोकांचे QR कोड स्कॅन करणे सुरक्षित आहे का?",
                "वृद्ध आई-वडिलांना फसवणुकीपासून कसे वाचवायचे?",
                "KYC एक्सपायर झाल्याचा कॉल आला, खरे आहे का?",
                "UPI मधून पैसे कापले गेले तर परत कसे मिळतील?"));
        return prompts;
    }
}
