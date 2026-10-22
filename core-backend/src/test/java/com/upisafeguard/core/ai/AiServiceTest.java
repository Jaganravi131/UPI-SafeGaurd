package com.upisafeguard.core.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Feature logic contract tests against a stubbed Groq transport — mirrors the
 * fallback/parse behaviour of backend/app/services/groq_ai_service.py.
 */
class AiServiceTest {

    private AiService service(GroqClient client, boolean demoFallback) {
        return new AiService(client, new ObjectMapper(), demoFallback);
    }

    private GroqClient clientReturning(String cannedContent) {
        return new GroqClient(null, "http://groq.test", "test-key", "test-model") {
            @Override
            public String complete(List<Map<String, String>> messages, int maxTokens) {
                return cannedContent;
            }
        };
    }

    private GroqClient unavailableClient() {
        return new GroqClient(null, "http://groq.test", "", "test-model") {
            @Override
            public boolean available() {
                return false;
            }
        };
    }

    private GroqClient capturing(List<List<Map<String, String>>> captured, String cannedContent) {
        return new GroqClient(null, "http://groq.test", "test-key", "test-model") {
            @Override
            public String complete(List<Map<String, String>> messages, int maxTokens) {
                captured.add(messages);
                return cannedContent;
            }
        };
    }

    @Test
    void translateShortCircuitsEnglish() {
        AiService ai = service(clientReturning("SHOULD NOT BE CALLED"), false);
        assertThat(ai.translate("Hello", "en")).isEqualTo("Hello");
    }

    @Test
    void translateReturnsModelOutput() {
        AiService ai = service(clientReturning("नमस्ते"), false);
        assertThat(ai.translate("Hello", "hi")).isEqualTo("नमस्ते");
    }

    @Test
    void translateUnavailableReturnsOriginal() {
        AiService ai = service(unavailableClient(), false);
        assertThat(ai.translate("Hello", "hi")).isEqualTo("Hello");
    }

    @Test
    void translateAlertsParsesNumberedLines() {
        AiService ai = service(clientReturning("1. बड़ा खर्च\n2. अजनबी को भेजें"), false);
        assertThat(ai.translateAlerts(List.of("Large spend", "Send to stranger"), "hi"))
                .containsExactly("बड़ा खर्च", "अजनबी को भेजें");
    }

    @Test
    void translateAlertsWrongCountFallsBackToOriginals() {
        AiService ai = service(clientReturning("1. only one line"), false);
        List<String> alerts = List.of("first", "second");
        assertThat(ai.translateAlerts(alerts, "hi")).isSameAs(alerts);
    }

    @Test
    void explainScamUnavailableUsesDeterministicCopy() {
        AiService ai = service(unavailableClient(), false);
        assertThat(ai.explainScam("lottery_scam", List.of("unknown recipient"), 10000, "hi"))
                .isEqualTo("This transaction may be a lottery_scam scam. Please be careful.");
    }

    @Test
    void explainScamFormatsAmountInPrompt() {
        List<List<Map<String, String>>> captured = new java.util.ArrayList<>();
        AiService ai = service(capturing(captured, "explanation"), false);
        ai.explainScam("lottery_scam", List.of("unknown"), 1234567, "en");
        String content = captured.get(0).get(0).get("content");
        assertThat(content).contains("Transaction amount: ₹1,234,567");
        assertThat(content).contains("unknown");
    }

    @Test
    void chatBuildsSystemPromptAndTrimsHistoryToSix() {
        List<List<Map<String, String>>> captured = new java.util.ArrayList<>();
        AiService ai = service(capturing(captured, "reply"), false);
        List<Map<String, String>> history = new java.util.ArrayList<>();
        for (int i = 0; i < 8; i++) {
            history.add(Map.of("role", "user", "content", "old-" + i));
        }

        String reply = ai.chat("Is this a scam?", "en", history);

        assertThat(reply).isEqualTo("reply");
        List<Map<String, String>> messages = captured.get(0);
        assertThat(messages).hasSize(1 + 6 + 1);
        assertThat(messages.get(0).get("role")).isEqualTo("system");
        assertThat(messages.get(0).get("content")).contains("SafeGuard AI", "English");
        // last 6 entries kept, oldest dropped
        assertThat(messages.get(1).get("content")).isEqualTo("old-2");
        assertThat(messages.get(6).get("content")).isEqualTo("old-7");
        assertThat(messages.get(7)).containsEntry("role", "user").containsEntry("content", "Is this a scam?");
    }

    @Test
    void chatLocalLanguageAddsSimplificationRules() {
        List<List<Map<String, String>>> captured = new java.util.ArrayList<>();
        AiService ai = service(capturing(captured, "reply"), false);
        ai.chat("क्या यह सुरक्षित है?", "hi", List.of());
        String system = captured.get(0).get(0).get("content");
        assertThat(system).contains("Hindi", "1930", "family elder");
    }

    @Test
    void voiceAlertUnavailableReturnsEmpty() {
        AiService ai = service(unavailableClient(), false);
        assertThat(ai.voiceAlert("high_risk", Map.of("amount", 5000), "en")).isEmpty();
    }

    @Test
    void voiceAlertSerialisesContext() {
        List<List<Map<String, String>>> captured = new java.util.ArrayList<>();
        AiService ai = service(capturing(captured, "alert!"), false);
        String result = ai.voiceAlert("high_risk", Map.of("amount", 5000, "recipient", "stranger"), "hi");
        assertThat(result).isEqualTo("alert!");
        String prompt = captured.get(0).get(0).get("content");
        assertThat(prompt).contains("high_risk", "\"amount\":5000", "Hindi");
    }

    @Test
    void translateUiMapsBackByKeys() {
        AiService ai = service(clientReturning("1. होम\n2. भुगतान"), false);
        assertThat(ai.translateUi(new java.util.LinkedHashMap<>(Map.of("nav_home", "Home", "nav_pay", "Pay")), "hi"))
                .containsEntry("nav_home", "होम")
                .containsEntry("nav_pay", "भुगतान");
    }

    @Test
    void translateUiShortCircuitsEnglish() {
        AiService ai = service(clientReturning("unused"), false);
        Map<String, String> strings = Map.of("nav_home", "Home");
        assertThat(ai.translateUi(strings, "en")).isSameAs(strings);
    }

    @Test
    void demoAdvisorReplyBranches() {
        AiService ai = service(unavailableClient(), true);
        assertThat(ai.demoAdvisorReply("I shared my OTP")).contains("never share an OTP");
        assertThat(ai.demoAdvisorReply("scanned a QR")).contains("entering a UPI PIN");
        assertThat(ai.demoAdvisorReply("am I safe?")).contains("pause when a caller");
        assertThat(ai.demoAdvisorReply("hello there")).contains("configure GROQ_API_KEY");
    }

    @Test
    void languagesListMatchesPythonContract() {
        AiService ai = service(unavailableClient(), false);
        List<Map<String, String>> languages = ai.languages();
        assertThat(languages).hasSize(12);
        assertThat(languages.get(0)).containsEntry("code", "en").containsEntry("name", "English");
        assertThat(languages.get(7)).containsEntry("code", "bn").containsEntry("name", "Bengali");
    }

    @Test
    void suggestedPromptsLocalizeAndFallback() {
        AiService ai = service(unavailableClient(), false);
        assertThat(ai.suggestedPrompts("hi").get(0)).isEqualTo("UPI स्कैम की पहचान कैसे करें?");
        assertThat(ai.suggestedPrompts("xx")).isEqualTo(ai.suggestedPrompts("en"));
    }
}
