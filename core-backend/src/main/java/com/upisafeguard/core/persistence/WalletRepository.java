package com.upisafeguard.core.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {
    /**
     * Pessimistic row lock so concurrent debits against the same wallet are
     * serialized inside the caller's transaction (prevents lost-balance races).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Wallet> findByUserId(String userId);
}
