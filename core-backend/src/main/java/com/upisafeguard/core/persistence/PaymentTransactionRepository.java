package com.upisafeguard.core.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, UUID> {
    Optional<PaymentTransaction> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);

    @Query("SELECT t FROM PaymentTransaction t WHERE t.userId = :userId ORDER BY t.createdAt DESC")
    Page<PaymentTransaction> findByUserIdOrderByCreatedAtDesc(@Param("userId") String userId, Pageable pageable);

    @Query("SELECT t FROM PaymentTransaction t WHERE t.status IN :statuses")
    Page<PaymentTransaction> findByStatusIn(@Param("statuses") List<String> statuses, Pageable pageable);
}