package com.upisafeguard.core.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.upisafeguard.core.cache.InMemoryCacheService;
import com.upisafeguard.core.intervention.InterventionService;

class EventLayerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void kafkaPublisherSendsJsonWithTopicAndKey() throws Exception {
        org.springframework.kafka.core.KafkaTemplate<String, String> template =
                mock(org.springframework.kafka.core.KafkaTemplate.class);
        DomainEventPublisher publisher =
                new EventPublisherConfig().kafkaDomainEventPublisher(template, mapper);

        publisher.publish(EventTopics.TRANSACTION_COMPLETED, "user-1", Map.of("amount", 500));

        // Captured value must be valid JSON carrying the payload fields
        org.mockito.ArgumentCaptor<String> value = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(template).send(org.mockito.ArgumentMatchers.eq(EventTopics.TRANSACTION_COMPLETED),
                org.mockito.ArgumentMatchers.eq("user-1"), value.capture());

        ObjectNode parsed = (ObjectNode) mapper.readTree(value.getValue());
        assertThat(parsed.path("amount").asInt()).isEqualTo(500);
    }

    @Test
    void kafkaPublisherSwallowsBrokerFailures() {
        org.springframework.kafka.core.KafkaTemplate<String, String> template =
                mock(org.springframework.kafka.core.KafkaTemplate.class);
        org.mockito.Mockito.when(template.send(org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString()))
                .thenThrow(new IllegalStateException("broker down"));
        DomainEventPublisher publisher =
                new EventPublisherConfig().kafkaDomainEventPublisher(template, mapper);

        assertThatCode(() -> publisher.publish(EventTopics.FRAUD_REPORTED, "k", Map.of("x", 1)))
                .doesNotThrowAnyException(); // payments never fail because of Kafka
    }

    @Test
    void noopPublisherIsEmptyAndSafe() {
        DomainEventPublisher publisher = new EventPublisherConfig().noopDomainEventPublisher();
        assertThatCode(() -> publisher.publish(EventTopics.INTERVENTION_RAISED, "k", Map.of()))
                .doesNotThrowAnyException();
    }

    @Test
    void interventionStateSurvivesInMemoryRegistryAcrossLookupPaths() {
        InterventionService service = new InterventionService(new InMemoryCacheService(), mapper);
        Map<String, Object> intervention = service.analyzeAndIntervene(
                "tx-1", "u-1", 0.75, Map.of(), Map.of("amount", 500));
        String id = String.valueOf(intervention.get("intervention_id"));

        assertThat(service.isKnownIntervention(id)).isTrue();
        assertThat(service.activeCount()).isEqualTo(1);
        assertThat(service.activeForUser("u-1")).hasSize(1);
        assertThat(service.activeForUser("u-2")).isEmpty();

        // JSON round-trip preserved the nested challenge structure
        Map<String, Object> fresh = service.activeForUser("u-1").get(0);
        @SuppressWarnings("unchecked")
        var challenges = (java.util.List<Map<String, Object>>) fresh.get("challenges");
        assertThat(challenges.get(0).get("points_reward")).isEqualTo(20);
        assertThat(challenges.get(0).get("timeout_seconds")).isEqualTo(60);
    }
}
