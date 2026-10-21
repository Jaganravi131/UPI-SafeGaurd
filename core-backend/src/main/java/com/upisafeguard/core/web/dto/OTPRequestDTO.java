package com.upisafeguard.core.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class OTPRequestDTO {
    public static class Request {
        @NotBlank(message = "Identifier (email or phone) is required")
        private String identifier;

        public String getIdentifier() { return identifier; }
        public void setIdentifier(String identifier) { this.identifier = identifier; }
    }

    public static class Response {
        private boolean success;
        private String message;
        private String otp; // Only in development

        public Response(boolean success, String message, String otp) {
            this.success = success;
            this.message = message;
            this.otp = otp;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getOtp() { return otp; }
    }
}