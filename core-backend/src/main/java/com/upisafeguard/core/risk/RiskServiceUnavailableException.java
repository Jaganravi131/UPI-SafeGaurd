package com.upisafeguard.core.risk;

public class RiskServiceUnavailableException extends RuntimeException {

    public RiskServiceUnavailableException(String message) {
        super(message);
    }

    public RiskServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
