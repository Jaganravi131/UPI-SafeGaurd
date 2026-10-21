package com.upisafeguard.core.risk;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class RiskServiceClient {

    private final RestClient restClient;
    private final String baseUrl;

    RiskServiceClient(RestClient restClient, String baseUrl) {
        this.restClient = restClient;
        this.baseUrl = baseUrl;
    }

    @Autowired
    public RiskServiceClient(
            RestClient.Builder builder,
            @Value("${risk.service.base-url}") String baseUrl,
            @Value("${risk.service.timeout-ms}") int timeoutMs
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        this.restClient = builder
                .requestFactory(requestFactory)
                .baseUrl(baseUrl)
                .build();
        this.baseUrl = baseUrl;
    }

    public RiskAssessmentResponse assess(RiskAssessmentRequest request) {
        try {
            RiskAssessmentResponse response = restClient.post()
                    .uri("/v1/assess")
                    .body(request)
                    .retrieve()
                    .body(RiskAssessmentResponse.class);
            if (response == null) {
                throw new RiskServiceUnavailableException("AI risk service returned an empty response");
            }
            return response;
        } catch (RestClientException exception) {
            throw new RiskServiceUnavailableException(
                    "AI risk service is unavailable or returned an invalid response",
                    exception
            );
        }
    }

    public RiskModelInfo modelInfo() {
        try {
            RiskModelInfo response = restClient.get()
                    .uri("/v1/model-info")
                    .retrieve()
                    .body(RiskModelInfo.class);
            if (response == null) {
                throw new RiskServiceUnavailableException("AI risk service returned empty model metadata");
            }
            return response;
        } catch (RestClientException exception) {
            throw new RiskServiceUnavailableException(
                    "AI risk service model metadata is unavailable",
                    exception
            );
        }
    }

    public String baseUrl() {
        return baseUrl;
    }
}
