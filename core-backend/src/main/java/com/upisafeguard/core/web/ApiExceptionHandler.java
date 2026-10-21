package com.upisafeguard.core.web;

import com.upisafeguard.core.risk.RiskServiceUnavailableException;
import com.upisafeguard.core.risk.InvalidAssessmentTokenException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(RiskServiceUnavailableException.class)
    ResponseEntity<ApiError> handleRiskServiceUnavailable(RiskServiceUnavailableException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError("RISK_SERVICE_UNAVAILABLE", exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        return ResponseEntity.badRequest()
                .body(new ApiError("INVALID_REQUEST", "Risk assessment input is invalid"));
    }

    @ExceptionHandler(InvalidAssessmentTokenException.class)
    ResponseEntity<ApiError> handleInvalidAssessment(InvalidAssessmentTokenException exception) {
        return ResponseEntity.badRequest()
                .body(new ApiError("INVALID_ASSESSMENT", exception.getMessage()));
    }
}
