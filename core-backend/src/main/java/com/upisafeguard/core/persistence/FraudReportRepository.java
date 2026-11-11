package com.upisafeguard.core.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FraudReportRepository extends JpaRepository<FraudReport, UUID> {
    @Query("SELECT f FROM FraudReport f WHERE f.status = :status")
    Page<FraudReport> findByStatus(@Param("status") String status, Pageable pageable);

    @Query("SELECT f FROM FraudReport f WHERE f.reporter.id = :userId ORDER BY f.createdAt DESC")
    Page<FraudReport> findByReporterId(@Param("userId") String userId, Pageable pageable);

    /** Community-intelligence lookup for the security shield (case-insensitive UPI match). */
    long countByScammerUpiEqualsIgnoreCase(String scammerUpi);

    List<FraudReport> findTop3ByScammerUpiEqualsIgnoreCaseOrderByCreatedAtDesc(String scammerUpi);

    /** GET /admin/analytics/fraud-types — grouped counts + amounts, most-reported first. */
    @Query("""
            SELECT f.scamType AS scamType, COUNT(f.id) AS reportCount, COALESCE(SUM(f.amountLost), 0) AS totalAmount
            FROM FraudReport f
            GROUP BY f.scamType
            ORDER BY COUNT(f.id) DESC
            """)
    List<FraudTypeCount> aggregateByScamType();

    /** Full listing for GET /admin/fraud-reports/export (SELECT ... ORDER BY created_at DESC). */
    List<FraudReport> findAllByOrderByCreatedAtDesc();

    interface FraudTypeCount {
        String getScamType();

        long getReportCount();

        java.math.BigDecimal getTotalAmount();
    }
}