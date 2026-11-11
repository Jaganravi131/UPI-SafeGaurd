package com.upisafeguard.core.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UpiProfileRepository extends JpaRepository<UpiProfile, UUID> {
    Optional<UpiProfile> findByUpiId(String upiId);
}
