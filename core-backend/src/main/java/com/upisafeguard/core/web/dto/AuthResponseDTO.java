package com.upisafeguard.core.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Auth response, FastAPI contract shape (schemas/auth.py): the frontend reads
 * {@code access_token}, {@code user_id}, {@code is_new_user}, {@code full_name}.
 * Explicit annotations so boolean-is prefixes serialize exactly as the
 * Python backend does.
 */
public class AuthResponseDTO {
    @JsonProperty("success")
    private boolean success;
    @JsonProperty("message")
    private String message;
    @JsonProperty("access_token")
    private String token;
    @JsonProperty("user_id")
    private String userId;
    @JsonProperty("is_new_user")
    private boolean isNewUser;
    @JsonProperty("full_name")
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
    @JsonProperty("is_new_user")
    public boolean isNewUser() { return isNewUser; }
    public String getFullName() { return fullName; }
}
