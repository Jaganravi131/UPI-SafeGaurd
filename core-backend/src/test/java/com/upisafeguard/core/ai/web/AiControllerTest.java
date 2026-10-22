package com.upisafeguard.core.ai.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;

import com.upisafeguard.core.ai.AiService;
import com.upisafeguard.core.ai.GroqClient;
import com.upisafeguard.core.web.ApiExceptionHandler;

/**
 * Contract tests for /api/v1/ai shapes — mirror backend/app/api/routes/ai.py.
 */
class AiControllerTest {

    private MockMvc mockMvc;

    private GroqClient stub(String content) {
        return new GroqClient(RestClient.builder(), "http://groq.test", "test-key", "llama-test", 1000) {
            @Override
            public String complete(List<Map<String, String>> messages, int maxTokens) {
                return content;
            }
        };
    }

    private GroqClient unavailable() {
        return new GroqClient(RestClient.builder(), "http://groq.test", "", "llama-test", 1000) {
            @Override
            public boolean available() {
                return false;
            }
        };
    }

    @BeforeEach
    void setUp() {
        AiService ai = new AiService(stub("translated text"), new com.fasterxml.jackson.databind.ObjectMapper(), false);
        mockMvc = MockMvcBuilders.standaloneSetup(new AiController(ai))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    private MockMvc mockMvcFor(GroqClient client, boolean demoFallback) {
        AiService ai = new AiService(client, new com.fasterxml.jackson.databind.ObjectMapper(), demoFallback);
        return MockMvcBuilders.standaloneSetup(new AiController(ai))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void languagesReturnsAvailableModelAndList() throws Exception {
        mockMvc.perform(get("/api/v1/ai/languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.model").value("llama-test"))
                .andExpect(jsonPath("$.languages[0].code").value("en"))
                .andExpect(jsonPath("$.languages[0].name").value("English"))
                .andExpect(jsonPath("$.languages[11].code").value("as"));
    }

    @Test
    void languagesUnavailableOmitsModel() throws Exception {
        mockMvcFor(unavailable(), false).perform(get("/api/v1/ai/languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.model").doesNotExist())
                .andExpect(jsonPath("$.languages.length()").value(12));
    }

    @Test
    void translateReturnsFastAPIShape() throws Exception {
        mockMvc.perform(post("/api/v1/ai/translate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text": "Hello", "target_language": "hi"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.original").value("Hello"))
                .andExpect(jsonPath("$.translated").value("translated text"))
                .andExpect(jsonPath("$.language").value("hi"))
                .andExpect(jsonPath("$.language_name").value("Hindi"));
    }

    @Test
    void translateUnavailableIs503WithDetail() throws Exception {
        mockMvcFor(unavailable(), false).perform(post("/api/v1/ai/translate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text": "Hello", "target_language": "hi"}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("AI service unavailable"));
    }

    @Test
    void translateAlertsReturnsTranslationsAndLanguageOnly() throws Exception {
        GroqClient numbered = new GroqClient(RestClient.builder(), "http://groq.test", "k", "m", 1000) {
            @Override
            public String complete(List<Map<String, String>> messages, int maxTokens) {
                return "1. अलर्ट एक\n2. अलर्ट दो";
            }
        };
        mockMvcFor(numbered, false).perform(post("/api/v1/ai/translate-alerts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"texts": ["alert one", "alert two"], "target_language": "hi"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.translations[0]").value("अलर्ट एक"))
                .andExpect(jsonPath("$.translations[1]").value("अलर्ट दो"))
                .andExpect(jsonPath("$.language").value("hi"));
    }

    @Test
    void explainScamReturnsFourKeys() throws Exception {
        mockMvc.perform(post("/api/v1/ai/explain-scam")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scam_type": "lottery_scam", "risk_factors": ["stranger"], "amount": 5000}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.explanation").value("translated text"))
                .andExpect(jsonPath("$.scam_type").value("lottery_scam"))
                .andExpect(jsonPath("$.language").value("en"))
                .andExpect(jsonPath("$.language_name").value("English"));
    }

    @Test
    void chatReturnsReplyLanguageLanguageName() throws Exception {
        mockMvc.perform(post("/api/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"message": "Is this a scam?", "language": "en"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply").value("translated text"))
                .andExpect(jsonPath("$.language").value("en"))
                .andExpect(jsonPath("$.language_name").value("English"));
    }

    @Test
    void chatWithoutKeyFallsBackToDemoReplyWhenEnabled() throws Exception {
        mockMvcFor(unavailable(), true).perform(post("/api/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"message": "I shared my OTP, help", "language": "en"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply").value(org.hamcrest.Matchers.containsString("Demo safety guidance")));
    }

    @Test
    void chatWithoutKeyIs503WhenDemoFallbackDisabled() throws Exception {
        mockMvcFor(unavailable(), false).perform(post("/api/v1/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"message": "Is this a scam?"}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("AI service unavailable"));
    }

    @Test
    void voiceAlertReturnsAlertTextTypeLanguage() throws Exception {
        mockMvc.perform(post("/api/v1/ai/voice-alert")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"alert_type": "high_risk", "context": {"amount": 5000}, "target_language": "hi"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alert_text").value("translated text"))
                .andExpect(jsonPath("$.alert_type").value("high_risk"))
                .andExpect(jsonPath("$.language").value("hi"));
    }

    @Test
    void suggestedPromptsReturnsLanguageAndPrompts() throws Exception {
        mockMvc.perform(get("/api/v1/ai/suggested-prompts").param("language", "ta"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.language").value("ta"))
                .andExpect(jsonPath("$.prompts.length()").value(6));
    }

    @Test
    void translateUiOver60StringsIs400WithDetail() throws Exception {
        StringBuilder strings = new StringBuilder("{");
        IntStream.rangeClosed(1, 61).forEach(i -> {
            strings.append("\"key").append(i).append("\": \"Text ").append(i).append("\",");
        });
        strings.append("\"key62\": \"Text 62\"}");
        mockMvc.perform(post("/api/v1/ai/translate-ui")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"strings\": " + strings + ", \"target_language\": \"hi\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Max 60 strings per request"));
    }
}
