package com.upisafeguard.core.risk;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/risk")
public class RiskAssessmentController {

    private final RiskServiceClient riskServiceClient;
    private final AssessmentTokenService assessmentTokenService;

    public RiskAssessmentController(
            RiskServiceClient riskServiceClient,
            AssessmentTokenService assessmentTokenService
    ) {
        this.riskServiceClient = riskServiceClient;
        this.assessmentTokenService = assessmentTokenService;
    }

    @PostMapping("/assess")
    public RiskAssessmentResponse assess(@Valid @RequestBody RiskAssessmentRequest request) {
        RiskAssessmentResponse response = riskServiceClient.assess(request);
        AssessmentTokenService.IssuedAssessment issued =
                assessmentTokenService.issue(request, response);
        return new RiskAssessmentResponse(
                response.service_version(),
                response.engine_version(),
                response.transaction_id(),
                response.risk_level(),
                response.risk_score(),
                response.recommended_action(),
                response.require_guardian_approval(),
                response.risk_factors(),
                response.confidence(),
                response.model_score(),
                response.rules_applied(),
                response.model_versions(),
                response.details(),
                issued.token(),
                issued.expiresAt().toString()
        );
    }

    @GetMapping("/model-info")
    public RiskModelInfo modelInfo() {
        return riskServiceClient.modelInfo();
    }
}
