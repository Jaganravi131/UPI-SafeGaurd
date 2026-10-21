package com.upisafeguard.core.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GuardianRepository extends JpaRepository<Guardian, UUID> {
    List<Guardian> findByUser(User user);
    List<Guardian> findByGuardianPhone(String guardianPhone);
    List<Guardian> findByGuardianPhoneAndStatus(String guardianPhone, String status);
    Optional<Guardian> findByUserAndGuardianPhone(User user, String guardianPhone);
}