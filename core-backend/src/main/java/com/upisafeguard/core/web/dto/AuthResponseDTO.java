package com.upisafeguard.core.web.dto;

public class AuthResponseDTO {
    private boolean success;
    private String message;
    private String token;
    private String userId;
    private boolean isNewUser;
    private String fullName;

    public AuthResponseDTO(boolean success, String message, String token, String userId, boolean isNewUser, String fullName) {
        this.success = success;
        this.message = message;
        this.token = token;
        this.userId = userId;
        this.isNewUser = isNewUser;
        this.fullName = fullName;
    }

    public boolean isSuccess() { return success; }
    public String getMessage() { return message; }
    public String getToken() { return token; }
    public String getUserId() { return userId; }
    public boolean isNewUser() { return isNewUser; }
    public String getFullName() { return fullName; }
}