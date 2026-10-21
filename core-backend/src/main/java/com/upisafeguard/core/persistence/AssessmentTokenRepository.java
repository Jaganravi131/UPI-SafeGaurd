package com.upisafeguard.core.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface AssessmentTokenRepository extends JpaRepository<AssessmentTokenEntity, String> {
    Optional<AssessmentTokenEntity> findByToken(@Param("token") String token);
}