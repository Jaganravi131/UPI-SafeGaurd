package com.upisafeguard.core.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * Flat assess-risk request, port of the Python TransactionRequest schema
 * (backend/app/api/routes/transaction.py). Profiles are built server-side —
 * the frontend sends snake_case keys only.
 */
public class TransactionAssessRequest {
    @NotBlank(message = "Recipient UPI ID is required")
    @com.fasterxml.jackson.annotation.JsonAlias("recipient_upi")
    private String recipientUpi;

    @NotNull(message = "Amount is required")
    @Positive(message = "Amount must be positive")
    private Double amount;

    private String purpose;

    /** Note for AI scam detection on the message text. */
    private String note;

    @com.fasterxml.jackson.annotation.JsonAlias("is_new_recipient")
    private Boolean isNewRecipient;

    @com.fasterxml.jackson.annotation.JsonAlias("call_active")
    private Boolean callActive;

    @com.fasterxml.jackson.annotation.JsonAlias("sensor_data")
    private java.util.Map<String, Object> sensorData;

    public String getRecipientUpi() { return recipientUpi; }
    public void setRecipientUpi(String recipientUpi) { this.recipientUpi = recipientUpi; }
    public Double getAmount() { return amount; }
    public void setAmount(Double amount) { this.amount = amount; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Boolean getIsNewRecipient() { return isNewRecipient; }
    public void setIsNewRecipient(Boolean isNewRecipient) { this.isNewRecipient = isNewRecipient; }
    public Boolean getCallActive() { return callActive; }
    public void setCallActive(Boolean callActive) { this.callActive = callActive; }
    public java.util.Map<String, Object> getSensorData() { return sensorData; }
    public void setSensorData(java.util.Map<String, Object> sensorData) { this.sensorData = sensorData; }
}
