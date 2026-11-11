package com.upisafeguard.core.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdminRepository extends JpaRepository<Admin, UUID> {

    Optional<Admin> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /** Listing order for GET /admin/admins (SELECT ... ORDER BY created_at DESC). */
    List<Admin> findAllByOrderByCreatedAtDesc();
}
