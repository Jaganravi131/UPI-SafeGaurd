package com.upisafeguard.core.web;

import org.springframework.http.HttpStatus;

/**
 * Business-rule violation raised by the wallet/user services. Rendered as a
 * FastAPI-compatible error body ({@code {"detail": "..."}}) by ApiExceptionHandler
 * so the frontend receives the actual reason, not a generic error blob.
 */
public class ApiRequestException extends RuntimeException {

    private final HttpStatus status;

    public ApiRequestException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
