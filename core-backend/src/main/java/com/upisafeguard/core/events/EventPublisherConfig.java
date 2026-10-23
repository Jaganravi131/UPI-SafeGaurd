package com.upisafeguard.core.events;

import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Chooses the publisher implementation from configuration. Kafka sending is
 * fire-and-forget (at-most-once): an unavailable broker logs a warning but
 * must NEVER fail a payment. The transactional-outbox upgrade is on the
 * roadmap in docs/system-design.md.
 */
@Configuration
public class EventPublisherConfig {

    private static final Logger log = LoggerFactory.getLogger(EventPublisherConfig.class);

    @Bean
    @ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true")
    public DomainEventPublisher kafkaDomainEventPublisher(KafkaTemplate<String, String> template, ObjectMapper mapper) {
        return (topic, key, payload) -> {
            try {
                template.send(topic, key, mapper.writeValueAsString(payload));
            } catch (Exception exception) {
                log.warn("Failed to publish {} event (continuing without it): {}",
                        topic, exception.getMessage());
            }
        };
    }

    @Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean(DomainEventPublisher.class)
    public DomainEventPublisher noopDomainEventPublisher() {
        return (topic, key, payload) -> {
            // Kafka disabled — events are intentionally dropped.
        };
    }

    /** Standard envelope fields every payload carries. */
    public static Map<String, Object> envelope(String eventType, Map<String, Object> fields) {
        java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
        map.put("event_id", UUID.randomUUID().toString());
        map.put("event_type", eventType);
        map.put("occurred_at", java.time.Instant.now().toString());
        map.putAll(fields);
        return map;
    }
}
