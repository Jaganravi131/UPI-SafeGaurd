package com.upisafeguard.core.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class OTPVerifyDTO {
    @NotBlank(message = "Identifier (email or phone) is required")
    private String identifier;

    @NotBlank(message = "OTP is required")
    @Size(min = 6, max = 6, message = "OTP must be 6 digits")
    private String otp;

    public String getIdentifier() { return identifier; }
    public void setIdentifier(String identifier) { this.identifier = identifier; }
    public String getOtp() { return otp; }
    public void setOtp(String otp) { this.otp = otp; }
}