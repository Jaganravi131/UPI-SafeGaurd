package com.upisafeguard.core.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface OTPRepository extends JpaRepository<OTPRecord, UUID> {

    Optional<OTPRecord> findByEmailIgnoreCase(String email);

    @Query("SELECT o FROM OTPRecord o WHERE o.email = :email AND o.expiresAt > CURRENT_TIMESTAMP")
    Optional<OTPRecord> findByEmailAndNotExpired(@Param("email") String email);

    @Modifying
    @Query("DELETE FROM OTPRecord o WHERE o.email = :email AND o.expiresAt < CURRENT_TIMESTAMP")
    void deleteExpiredByEmail(@Param("email") String email);

    @Modifying
    @Query("DELETE FROM OTPRecord o WHERE o.expiresAt < CURRENT_TIMESTAMP")
    void deleteAllExpired();
}