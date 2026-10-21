package com.upisafeguard.core.risk;

import com.fasterxml.jackson.annotation.JsonProperty;

public record RiskModelInfo(
        @JsonProperty("service_version") String serviceVersion,
        @JsonProperty("engine_version") String engineVersion,
        @JsonProperty("primary_model") String primaryModel,
        @JsonProperty("feature_schema_version") String featureSchemaVersion,
        @JsonProperty("trained_artifact_loaded") boolean trainedArtifactLoaded,
        @JsonProperty("live_graph_model") boolean liveGraphModel
) {
}
