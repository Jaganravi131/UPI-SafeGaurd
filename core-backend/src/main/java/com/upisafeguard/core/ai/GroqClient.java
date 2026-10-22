package com.upisafeguard.core.ai;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Minimal Groq chat-completions client (OpenAI-compatible API at
 * https://api.groq.com/openai/v1). Mirrors the Python service in
 * backend/app/services/groq_ai_service.py: temperature 0.3 and "" (empty
 * string) on any transport/API failure so callers can fall back to
 * deterministic copy instead of erroring out.
 */
@Component
public class GroqClient {

    private final RestClient restClient;
    private final String baseUrl;
    private final String apiKey;
    private final String model;

    GroqClient(RestClient restClient, String baseUrl, String apiKey, String model) {
        this.restClient = restClient;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Autowired
    public GroqClient(
            RestClient.Builder builder,
            @Value("${groq.base-url}") String baseUrl,
            @Value("${groq.api-key}") String apiKey,
            @Value("${groq.model}") String model,
            @Value("${groq.timeout-ms}") int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        this.restClient = builder
                .requestFactory(requestFactory)
                .baseUrl(baseUrl)
                .build();
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.model = model;
    }

    /** True when GROQ_API_KEY is configured — "AI features enabled". */
    public boolean available() {
        return apiKey != null && !apiKey.isBlank();
    }

    public String model() {
        return model;
    }

    public String baseUrl() {
        return baseUrl;
    }

    /**
     * Single (or multi-turn via messages) LLM call. Returns the stripped
     * assistant content, or "" when unavailable/failing — matching the Python
     * fallback contract.
     */
    public String complete(List<Map<String, String>> messages, int maxTokens) {
        if (!available()) {
            return "";
        }
        Map<String, Object> requestBody = Map.of(
                "model", model,
                "messages", messages,
                "temperature", 0.3,
                "max_tokens", maxTokens);
        try {
            ChatCompletionResponse response = restClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(ChatCompletionResponse.class);
            if (response != null && response.choices() != null && !response.choices().isEmpty()) {
                String content = response.choices().get(0).message().content();
                return content == null ? "" : content.strip();
            }
            return "";
        } catch (Exception exception) {
            return "";
        }
    }

    /** Groq chat-completions response, only the part we need. */
    public record ChatCompletionResponse(List<Choice> choices) {
        public static record Choice(Message message) {
        }

        public static record Message(String content) {
        }
    }
}
