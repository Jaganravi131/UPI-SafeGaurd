package com.upisafeguard.core.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ContactRepository extends JpaRepository<Contact, Long> {
    Optional<Contact> findByPhone(String phone);
    Optional<Contact> findByUpiId(String upiId);
    List<Contact> findByIsScammerTrue();
    List<Contact> findByIsVerifiedTrue();
    List<Contact> findByNameContainingIgnoreCase(String name);
}