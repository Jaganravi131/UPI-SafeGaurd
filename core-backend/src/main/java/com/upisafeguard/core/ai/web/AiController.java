package com.upisafeguard.core.ai.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.upisafeguard.core.ai.AiService;
import com.upisafeguard.core.web.ApiRequestException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI endpoints. Response shapes mirror backend/app/api/routes/ai.py exactly —
 * the frontend (AI Chat, translations, scam explanations, voice alerts) is
 * built against that contract.
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiController {

    private final AiService ai;

    @Autowired
    public AiController(AiService ai) {
        this.ai = ai;
    }

    @GetMapping("/languages")
    public ResponseEntity<?> languages() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", ai.isAvailable());
        body.put("model", ai.model());
        body.put("languages", ai.languages());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/suggested-prompts")
    public ResponseEntity<?> suggestedPrompts(@RequestParam(defaultValue = "en") String language) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("language", language);
        body.put("prompts", ai.suggestedPrompts(language));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/translate")
    public ResponseEntity<?> translate(@Valid @RequestBody TranslateRequest request) {
        requireAi();
        String translated = ai.translate(request.getText(), request.getTargetLanguage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("original", request.getText());
        body.put("translated", translated == null || translated.isBlank() ? request.getText() : translated);
        body.put("language", request.getTargetLanguage());
        body.put("language_name", ai.languageName(request.getTargetLanguage()));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/translate-alerts")
    public ResponseEntity<?> translateAlerts(@Valid @RequestBody BatchTranslateRequest request) {
        requireAi();
        List<String> translations = ai.translateAlerts(request.getTexts(), request.getTargetLanguage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("translations", translations);
        body.put("language", request.getTargetLanguage());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/explain-scam")
    public ResponseEntity<?> explainScam(@Valid @RequestBody ExplainScamRequest request) {
        requireAi();
        String explanation = ai.explainScam(
                request.getScamType(),
                request.getRiskFactors(),
                request.getAmount(),
                request.getTargetLanguage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("explanation", explanation);
        body.put("scam_type", request.getScamType());
        body.put("language", request.getTargetLanguage());
        body.put("language_name", ai.languageName(request.getTargetLanguage()));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@Valid @RequestBody ChatRequest request) {
        if (!ai.isAvailable()) {
            if (ai.demoFallbackEnabled()) {
                return chatBody(ai.demoAdvisorReply(request.getMessage()), request.getLanguage());
            }
            throw unavailable();
        }
        // TODO(parity): personalised user context (transactions, flagged items,
        // fraud reports) is injected by the Python route when the caller sends a
        // Bearer token; port with the statistics module.
        String reply = ai.chat(
                request.getMessage(),
                request.getLanguage(),
                request.getConversationHistory());
        if (reply == null || reply.isBlank()) {
            reply = "I'm sorry, I couldn't process your question. Please try again.";
        }
        return chatBody(reply, request.getLanguage());
    }

    @PostMapping("/voice-alert")
    public ResponseEntity<?> voiceAlert(@Valid @RequestBody VoiceAlertRequest request) {
        requireAi();
        String alertText = ai.voiceAlert(
                request.getAlertType(),
                request.getContext(),
                request.getTargetLanguage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("alert_text", alertText);
        body.put("alert_type", request.getAlertType());
        body.put("language", request.getTargetLanguage());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/translate-ui")
    public ResponseEntity<?> translateUi(@Valid @RequestBody UITranslateRequest request) {
        requireAi();
        if (request.getStrings() != null && request.getStrings().size() > 60) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Max 60 strings per request");
        }
        Map<String, String> translations = ai.translateUi(request.getStrings(), request.getTargetLanguage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("translations", translations);
        body.put("language", request.getTargetLanguage());
        body.put("language_name", ai.languageName(request.getTargetLanguage()));
        return ResponseEntity.ok(body);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private void requireAi() {
        if (!ai.isAvailable()) {
            throw unavailable();
        }
    }

    private ApiRequestException unavailable() {
        return new ApiRequestException(HttpStatus.SERVICE_UNAVAILABLE, "AI service unavailable");
    }

    private ResponseEntity<?> chatBody(String reply, String language) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reply", reply);
        body.put("language", language);
        body.put("language_name", ai.languageName(language));
        return ResponseEntity.ok(body);
    }

    // ── Request DTOs (FastAPI schemas in ai.py) ──────────────────────────

    public static class TranslateRequest {
        @NotBlank
        @Size(max = 2000)
        private String text;
        @NotBlank
        @JsonAlias({"target_language"})
        private String targetLanguage;

        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
        public String getTargetLanguage() { return targetLanguage; }
        public void setTargetLanguage(String targetLanguage) { this.targetLanguage = targetLanguage; }
    }

    public static class BatchTranslateRequest {
        @Size(max = 20)
        private List<String> texts;
        @NotBlank
        @JsonAlias({"target_language"})
        private String targetLanguage;

        public List<String> getTexts() { return texts; }
        public void setTexts(List<String> texts) { this.texts = texts; }
        public String getTargetLanguage() { return targetLanguage; }
        public void setTargetLanguage(String targetLanguage) { this.targetLanguage = targetLanguage; }
    }

    public static class ExplainScamRequest {
        @NotBlank
        @JsonAlias({"scam_type"})
        private String scamType;
        @JsonAlias({"risk_factors"})
        private List<String> riskFactors = new ArrayList<>();
        private double amount = 0;
        @JsonAlias({"target_language"})
        private String targetLanguage = "en";

        public String getScamType() { return scamType; }
        public void setScamType(String scamType) { this.scamType = scamType; }
        public List<String> getRiskFactors() { return riskFactors; }
        public void setRiskFactors(List<String> riskFactors) { this.riskFactors = riskFactors; }
        public double getAmount() { return amount; }
        public void setAmount(double amount) { this.amount = amount; }
        public String getTargetLanguage() { return targetLanguage; }
        public void setTargetLanguage(String targetLanguage) { this.targetLanguage = targetLanguage; }
    }

    public static class ChatRequest {
        @NotBlank
        @Size(max = 500)
        private String message;
        private String language = "en";
        @JsonAlias({"conversation_history"})
        private List<Map<String, String>> conversationHistory;

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }
        public List<Map<String, String>> getConversationHistory() { return conversationHistory; }
        public void setConversationHistory(List<Map<String, String>> conversationHistory) {
            this.conversationHistory = conversationHistory;
        }
    }

    public static class VoiceAlertRequest {
        @NotBlank
        @JsonAlias({"alert_type"})
        private String alertType;
        private Map<String, Object> context;
        @JsonAlias({"target_language"})
        private String targetLanguage = "en";

        public String getAlertType() { return alertType; }
        public void setAlertType(String alertType) { this.alertType = alertType; }
        public Map<String, Object> getContext() { return context; }
        public void setContext(Map<String, Object> context) { this.context = context; }
        public String getTargetLanguage() { return targetLanguage; }
        public void setTargetLanguage(String targetLanguage) { this.targetLanguage = targetLanguage; }
    }

    public static class UITranslateRequest {
        private Map<String, String> strings;
        @NotBlank
        @JsonAlias({"target_language"})
        private String targetLanguage;

        public Map<String, String> getStrings() { return strings; }
        public void setStrings(Map<String, String> strings) { this.strings = strings; }
        public String getTargetLanguage() { return targetLanguage; }
        public void setTargetLanguage(String targetLanguage) { this.targetLanguage = targetLanguage; }
    }
}
