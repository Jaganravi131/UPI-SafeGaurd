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

    @ExceptionHandler(ApiRequestException.class)
    ResponseEntity<Object> handleApiRequest(ApiRequestException exception) {
        // FastAPI-style body the frontend understands: {"detail": "..."}
        return ResponseEntity.status(exception.getStatus())
                .body(java.util.Map.of("detail", exception.getMessage() == null ? "" : exception.getMessage()));
    }

    @ExceptionHandler(RiskServiceUnavailableException.class)
    ResponseEntity<ApiError> handleRiskServiceUnavailable(RiskServiceUnavailableException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError("RISK_SERVICE_UNAVAILABLE", exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        // Surface the real field errors — the old handler hardcoded a
        // transaction-specific message for every controller's validation failure.
        String message = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .distinct()
                .collect(java.util.stream.Collectors.joining("; "));
        if (message.isEmpty()) {
            message = "Validation failed";
        }
        return ResponseEntity.badRequest()
                .body(new ApiError("INVALID_REQUEST", message));
    }

    @ExceptionHandler(InvalidAssessmentTokenException.class)
    ResponseEntity<ApiError> handleInvalidAssessment(InvalidAssessmentTokenException exception) {
        return ResponseEntity.badRequest()
                .body(new ApiError("INVALID_ASSESSMENT", exception.getMessage()));
    }
}
