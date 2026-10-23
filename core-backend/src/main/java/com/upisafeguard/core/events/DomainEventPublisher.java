package com.upisafeguard.core.events;

import java.util.Map;

/**
 * Outbound domain events. Implementation is decided by configuration:
 * {@code APP_KAFKA_ENABLED=true} → {@link KafkaDomainEventPublisher};
 * otherwise a no-op implementation (single-node deployments, tests).
 */
public interface DomainEventPublisher {

    /**
     * @param topic   one of {@link EventTopics}
     * @param key     message key — drives Kafka partition placement
     * @param payload JSON-ready map (wrapped into the envelope by the impl)
     */
    void publish(String topic, String key, Map<String, Object> payload);
}
