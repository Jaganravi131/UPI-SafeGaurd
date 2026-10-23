package com.upisafeguard.core.intervention.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.intervention.InterventionService;

/** HTTP contract tests for /api/v1/intervention/* — mirrors intervention.py. */
class InterventionControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new InterventionController(new InterventionService()))
                .build();
    }

    private String createIntervention(double riskScore, String factorsJson) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/intervention/check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"transaction_id": "tx-1", "user_id": "user-1", "risk_score": %f,
                                 "risk_factors": %s, "transaction_data": {"amount": 500, "recipient_upi": "a@b"}}
                                """.formatted(riskScore, factorsJson)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        return body.path("intervention").path("intervention_id").asText(null);
    }

    @Test
    void checkLowRiskReturnsNoInterventionMessage() throws Exception {
        mockMvc.perform(post("/api/v1/intervention/check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"transaction_id": "tx-1", "user_id": "user-1", "risk_score": 0.1,
                                 "risk_factors": {}, "transaction_data": {"amount": 100}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intervention_required").value(false))
                .andExpect(jsonPath("$.message").value("Transaction can proceed"));
    }

    @Test
    void checkHighRiskReturnsInterventionWithFastAPIKeys() throws Exception {
        mockMvc.perform(post("/api/v1/intervention/check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"transaction_id": "tx-1", "user_id": "user-1", "risk_score": 0.8,
                                 "risk_factors": {}, "transaction_data": {"amount": 500, "recipient_upi": "a@b"}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intervention_required").value(true))
                .andExpect(jsonPath("$.intervention.intervention_level").value("blocking"))
                .andExpect(jsonPath("$.intervention.agent_message").isNotEmpty())
                .andExpect(jsonPath("$.intervention.requires_user_action").value(true))
                .andExpect(jsonPath("$.intervention.challenges[0].type").value("security_question"))
                .andExpect(jsonPath("$.intervention.challenges[0].timeout_seconds").value(60));
    }

    @Test
    void resolveChallengeFailureThenSuccessFlow() throws Exception {
        String interventionId = createIntervention(0.8, "{}");
        MvcResult check = mockMvc.perform(get("/api/v1/intervention/active/user-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andReturn();
        String challengeId = mapper.readTree(check.getResponse().getContentAsString())
                .path("interventions").get(0).path("challenges").get(0).path("id").asText();

        mockMvc.perform(post("/api/v1/intervention/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"intervention_id": "%s",
                                 "challenge_responses": [{"challenge_id": "%s", "answer": "nope"}]}
                                """.formatted(interventionId, challengeId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transaction_allowed").value(false))
                .andExpect(jsonPath("$.points_earned").value(0));

        // consumed → active list empty
        mockMvc.perform(get("/api/v1/intervention/active/user-1"))
                .andExpect(jsonPath("$.count").value(0));

        mockMvc.perform(post("/api/v1/intervention/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"intervention_id\": \"unknown\", \"challenge_responses\": []}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("Intervention not found"));
    }

    @Test
    void cancelReturnsPointsAndSecondCancelFails() throws Exception {
        String interventionId = createIntervention(0.8, "{}");
        mockMvc.perform(delete("/api/v1/intervention/cancel/" + interventionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.points_earned").value(10));

        mockMvc.perform(delete("/api/v1/intervention/cancel/" + interventionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void thresholdsReturnExactPythonValues() throws Exception {
        mockMvc.perform(get("/api/v1/intervention/thresholds"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.thresholds.none").value(0.30))
                .andExpect(jsonPath("$.thresholds.advisory").value(0.50))
                .andExpect(jsonPath("$.thresholds.warning").value(0.70))
                .andExpect(jsonPath("$.thresholds.blocking").value(0.90))
                .andExpect(jsonPath("$.thresholds.critical").value(1.00))
                .andExpect(jsonPath("$.levels.critical")
                        .value("Full block + guardian notification"));
    }

    @Test
    void statsMirrorPythonDemoNumbers() throws Exception {
        createIntervention(0.8, "{}");
        mockMvc.perform(get("/api/v1/intervention/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active_interventions").value(1))
                .andExpect(jsonPath("$.today.total_interventions").value(127))
                .andExpect(jsonPath("$.outcomes.amount_saved").value(425000));
    }
}
