package com.upisafeguard.core.events;

/** Topic names for the platform's domain events (docs/system-design.md). */
public final class EventTopics {

    /** Emitted after a wallet transfer or top-up commits successfully. */
    public static final String TRANSACTION_COMPLETED = "upi.transactions.completed";

    /** Emitted when a user submits a fraud report. */
    public static final String FRAUD_REPORTED = "upi.fraud.flagged";

    /** Emitted when the intervention engine raises an intervention. */
    public static final String INTERVENTION_RAISED = "upi.interventions.raised";

    private EventTopics() {
    }
}
