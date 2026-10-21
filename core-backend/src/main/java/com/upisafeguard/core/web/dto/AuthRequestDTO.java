package com.upisafeguard.core.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AuthRequestDTO {
    private String identifier; // email or phone
    private String otp;

    public String getIdentifier() { return identifier; }
    public void setIdentifier(String identifier) { this.identifier = identifier; }
    public String getOtp() { return otp; }
    public void setOtp(String otp) { this.otp = otp; }
}