package com.upisafeguard.core.risk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;

class RiskServiceClientTest {

    @Test
    void mapsCanonicalAssessmentResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(request -> assertThat(request.getURI().getPath()).isEqualTo("/v1/assess"))
                .andRespond(withSuccess("""
                        {
                          "service_version": "risk-service-v1",
                          "engine_version": "risk-engine-v1",
                          "transaction_id": "tx-1",
                          "risk_level": "low",
                          "risk_score": 0.12,
                          "recommended_action": "proceed",
                          "require_guardian_approval": false,
                          "risk_factors": ["normal profile"],
                          "confidence": 0.8,
                          "model_score": 0.12,
                          "rules_applied": [],
                          "model_versions": {"primary_model": "xgboost-paysim-v1"},
                          "details": {}
                        }
                        """, MediaType.APPLICATION_JSON));

        RiskServiceClient client = new RiskServiceClient(
                builder.baseUrl("http://risk-service").build(),
                "http://risk-service"
        );
        RiskAssessmentResponse result = client.assess(new RiskAssessmentRequest(
                Map.of("transaction_id", "tx-1"),
                Map.of("id", "user-1"),
                Map.of("trust_score", 90)
        ));

        assertThat(result.transaction_id()).isEqualTo("tx-1");
        assertThat(result.risk_score()).isEqualTo(0.12);
        assertThat(result.model_versions()).containsEntry("primary_model", "xgboost-paysim-v1");
        server.verify();
    }

    @Test
    void convertsTransportFailureToDomainException() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(request -> {
        })
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        RiskServiceClient client = new RiskServiceClient(
                builder.baseUrl("http://risk-service").build(),
                "http://risk-service"
        );

        assertThatThrownBy(() -> client.assess(new RiskAssessmentRequest(
                Map.of("transaction_id", "tx-1"),
                Map.of("id", "user-1"),
                Map.of("trust_score", 90)
        ))).isInstanceOf(RiskServiceUnavailableException.class);
        server.verify();
    }
}
