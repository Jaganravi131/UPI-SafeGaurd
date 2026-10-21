package com.upisafeguard.core.web.dto;

public class SessionValidationDTO {
    private boolean valid;
    private String message;

    public SessionValidationDTO(boolean valid, String message) {
        this.valid = valid;
        this.message = message;
    }

    public boolean isValid() { return valid; }
    public String getMessage() { return message; }
}