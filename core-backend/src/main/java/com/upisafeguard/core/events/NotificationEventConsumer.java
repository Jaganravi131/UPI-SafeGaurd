package com.upisafeguard.core.events;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.persistence.Notification;
import com.upisafeguard.core.persistence.NotificationRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;

/**
 * Event-driven notification fanout (the consumer side of the Kafka topics):
 * completed transactions, fraud reports and raised interventions become user
 * notifications instead of being generated inline by request handlers. This
 * is what lets a future burst of traffic fan out as subscribers scale
 * independently — the API thread never blocks on notification writes.
 *
 * Only registered when {@code APP_KAFKA_ENABLED=true}; disabled deployments
 * keep the previous synchronous behaviour.
 */
@Component
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true")
public class NotificationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventConsumer.class);

    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final ObjectMapper mapper;

    public NotificationEventConsumer(
            UserRepository userRepository,
            NotificationRepository notificationRepository,
            ObjectMapper mapper) {
        this.userRepository = userRepository;
        this.notificationRepository = notificationRepository;
        this.mapper = mapper;
    }

    @KafkaListener(
            topics = {
                    EventTopics.TRANSACTION_COMPLETED,
                    EventTopics.FRAUD_REPORTED,
                    EventTopics.INTERVENTION_RAISED
            },
            groupId = "${spring.kafka.consumer.group-id}")
    public void onDomainEvent(String message) {
        if (message == null || message.isBlank()) {
            return;
        }
        try {
            Map<?, ?> event = mapper.readValue(message, Map.class);
            String type = String.valueOf(event.get("event_type"));
            String userId = String.valueOf(event.get("user_id"));
            User user = parseId(userId) == null ? null : userRepository.findById(parseId(userId)).orElse(null);
            if (user == null) {
                log.debug("Skipping {} event: unknown user {}", type, userId);
                return;
            }

            switch (type) {
                case "TRANSACTION_COMPLETED" -> onTransactionCompleted(event, user);
                case "FRAUD_REPORTED" -> onFraudReported(event, user);
                case "INTERVENTION_RAISED" -> onInterventionRaised(event, user);
                default -> log.debug("Unknown event type {}: ignoring", type);
            }
        } catch (Exception exception) {
            // Malformed consumer input must never crash the listener loop.
            log.warn("Failed to process event: {}", exception.getMessage());
        }
    }

    private void onTransactionCompleted(Map<?, ?> event, User user) {
        Object amountValue = event.get("amount");
        String amount = amountValue == null ? "" : String.valueOf(amountValue);
        String recipient = event.get("recipient_name") == null
                ? String.valueOf(event.get("recipient_upi"))
                : String.valueOf(event.get("recipient_name"));
        String title = "topup".equals(event.get("kind"))
                ? "Money added to your wallet"
                : "Payment successful";
        String message = "topup".equals(event.get("kind"))
                ? "Rs." + amount + " was added to your wallet successfully."
                : "Rs." + amount + " was successfully paid to " + recipient + ".";
        saveNotification(event, user, "transaction", title, message);
    }

    private void onFraudReported(Map<?, ?> event, User user) {
        saveNotification(event, user, "security",
                "Fraud report received",
                "Thank you for reporting " + event.get("scammer_upi")
                        + ". Our officers will review this report shortly.");
    }

    private void onInterventionRaised(Map<?, ?> event, User user) {
        Object levelValue = event.get("intervention_level");
        String level = levelValue == null ? "warning" : String.valueOf(levelValue);
        saveNotification(event, user, "security",
                "Risk protection triggered",
                "We blocked a suspicious transaction temporarily (level: " + level
                        + "). Please verify this payment was made by you.");
    }

    private void saveNotification(Map<?, ?> event, User user, String type, String title, String message) {
        Notification notification = new Notification();
        notification.setUser(user);
        notification.setType(type);
        notification.setTitle(title);
        notification.setMessage(message);
        try {
            notification.setData(mapper.writeValueAsString(toData(event)));
        } catch (Exception ignored) {
            notification.setData("{}");
        }
        notificationRepository.save(notification);
    }

    private Map<String, Object> toData(Map<?, ?> event) {
        Map<String, Object> data = new LinkedHashMap<>();
        putIfPresent(data, event, "transaction_id");
        putIfPresent(data, event, "intervention_id");
        putIfPresent(data, event, "amount");
        putIfPresent(data, event, "intervention_level");
        putIfPresent(data, event, "report_id");
        putIfPresent(data, event, "scammer_upi");
        return data;
    }

    private void putIfPresent(Map<String, Object> target, Map<?, ?> source, String key) {
        if (source.get(key) != null) {
            target.put(key, source.get(key));
        }
    }

    private static UUID parseId(String value) {
        if (value == null || value.isBlank() || "null".equals(value)) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
