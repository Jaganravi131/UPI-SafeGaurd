package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.persistence.FraudReport;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import java.math.BigDecimal;
import java.util.stream.Collectors;
import java.math.BigDecimal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final FraudReportRepository fraudReportRepository;
    private final PaymentTransactionRepository transactionRepository;
    private final com.upisafeguard.core.admin.AdminAuthSupport adminAuth;

    /** Roles allowed for user-matching mutations — mirrors backend/app/api/routes/admin.py. */
    private static final java.util.Set<String> MANAGER_ROLES = java.util.Set.of("super_admin", "admin");

    @Autowired
    public AdminController(UserRepository userRepository,
                          WalletRepository walletRepository,
                          FraudReportRepository fraudReportRepository,
                          PaymentTransactionRepository transactionRepository,
                          com.upisafeguard.core.admin.AdminAuthSupport adminAuth) {
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.fraudReportRepository = fraudReportRepository;
        this.transactionRepository = transactionRepository;
        this.adminAuth = adminAuth;
    }

    // Dashboard
    @GetMapping("/dashboard/overview")
    public ResponseEntity<AdminDashboardResponse> getDashboardOverview(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);
        long totalUsers = userRepository.count();
        long totalWallets = walletRepository.count();
        long totalTransactions = transactionRepository.count();
        long totalFraudReports = fraudReportRepository.count();

        return ResponseEntity.ok(new AdminDashboardResponse(
                totalUsers, totalWallets, totalTransactions, totalFraudReports
        ));
    }

    // Users
    @GetMapping("/users")
    public ResponseEntity<Page<User>> getUsers(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search) {

        adminAuth.requireAdmin(authHeader);
        Pageable pageable = PageRequest.of(page, pageSize);
        Page<User> users;
        
        if (search != null && !search.isEmpty()) {
            Page<User> allUsers = userRepository.findAll(PageRequest.of(page, pageSize));
            List<User> filtered = allUsers.getContent().stream()
                .filter(user -> 
                    (user.getFullName() != null && user.getFullName().toLowerCase().contains(search.toLowerCase())) ||
                    (user.getEmail() != null && user.getEmail().toLowerCase().contains(search.toLowerCase()))
                )
                .collect(Collectors.toList());
            users = new PageImpl<>(filtered, PageRequest.of(page, pageSize), allUsers.getTotalElements());
        } else {
            users = userRepository.findAll(PageRequest.of(page, pageSize));
        }
        
        return ResponseEntity.ok(users);
    }

    @GetMapping("/users/{userId}")
    public ResponseEntity<User> getUserDetails(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId) {
        adminAuth.requireAdmin(authHeader);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            return userOpt.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/users/{userId}/security-score")
    public ResponseEntity<Void> updateSecurityScore(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId, @RequestParam(name = "security_score") double securityScore) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            user.setSecurityScore(BigDecimal.valueOf(securityScore));
            userRepository.save(user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/users/{userId}/status")
    public ResponseEntity<Void> updateUserStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId, @RequestParam(name = "is_active") boolean isActive) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            user.setIsActive(isActive);
            userRepository.save(user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/users/{userId}/edit")
    public ResponseEntity<Void> editUser(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId, @RequestBody UserEditRequest request) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            
            if (request.getFullName() != null) user.setFullName(request.getFullName());
            if (request.getEmail() != null) user.setEmail(request.getEmail());
            if (request.getDigitalLiteracy() != null) user.setDigitalLiteracy(User.DigitalLiteracy.valueOf(request.getDigitalLiteracy().toUpperCase()));
            if (request.getDailyLimit() != null) user.setDailyLimit(BigDecimal.valueOf(request.getDailyLimit()));
            if (request.getPerTransactionLimit() != null) user.setPerTransactionLimit(BigDecimal.valueOf(request.getPerTransactionLimit()));
            if (request.getGuardianThreshold() != null) user.setGuardianThreshold(BigDecimal.valueOf(request.getGuardianThreshold()));
            
            userRepository.save(user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // Fraud Reports
    @GetMapping("/fraud-reports")
    public ResponseEntity<Page<FraudReport>> getFraudReports(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status) {

        Pageable pageable = PageRequest.of(page, pageSize);
        Page<FraudReport> reports;
        
        if (status != null && !status.isEmpty()) {
            reports = fraudReportRepository.findByStatus(status, PageRequest.of(page, pageSize));
        } else {
            reports = fraudReportRepository.findAll(PageRequest.of(page, pageSize));
        }
        
        return ResponseEntity.ok(reports);
    }

    @PutMapping("/fraud-reports/{reportId}/status")
    public ResponseEntity<Void> updateReportStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String reportId, @RequestParam String status) {
        adminAuth.requireAdmin(authHeader);
        try {
            UUID uuid = UUID.fromString(reportId);
            Optional<FraudReport> reportOpt = fraudReportRepository.findById(uuid);
            if (reportOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            FraudReport report = reportOpt.get();
            report.setStatus(status);
            fraudReportRepository.save(report);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // Transactions
    @GetMapping("/transactions/flagged")
    public ResponseEntity<Page<PaymentTransaction>> getFlaggedTransactions(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize) {

        adminAuth.requireAdmin(authHeader);
        Pageable pageable = PageRequest.of(page, pageSize);
        Page<PaymentTransaction> transactions = transactionRepository.findByStatusIn(
                List.of("blocked", "failed", "guardian_pending"), pageable);
        return ResponseEntity.ok(transactions);
    }

    // DTOs
    public static class AdminDashboardResponse {
        private long totalUsers;
        private long totalWallets;
        private long totalTransactions;
        private long totalFraudReports;

        public AdminDashboardResponse(long totalUsers, long totalWallets, long totalTransactions, long totalFraudReports) {
            this.totalUsers = totalUsers;
            this.totalWallets = totalWallets;
            this.totalTransactions = totalTransactions;
            this.totalFraudReports = totalFraudReports;
        }

        public long getTotalUsers() { return totalUsers; }
        public long getTotalWallets() { return totalWallets; }
        public long getTotalTransactions() { return totalTransactions; }
        public long getTotalFraudReports() { return totalFraudReports; }
    }

    public static class UserEditRequest {
        private String fullName;
        private String email;
        private String digitalLiteracy;
        private Double dailyLimit;
        private Double perTransactionLimit;
        private Double guardianThreshold;

        public String getFullName() { return fullName; }
        public void setFullName(String fullName) { this.fullName = fullName; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getDigitalLiteracy() { return digitalLiteracy; }
        public void setDigitalLiteracy(String digitalLiteracy) { this.digitalLiteracy = digitalLiteracy; }
        public Double getDailyLimit() { return dailyLimit; }
        public void setDailyLimit(Double dailyLimit) { this.dailyLimit = dailyLimit; }
        public Double getPerTransactionLimit() { return perTransactionLimit; }
        public void setPerTransactionLimit(Double perTransactionLimit) { this.perTransactionLimit = perTransactionLimit; }
        public Double getGuardianThreshold() { return guardianThreshold; }
        public void setGuardianThreshold(Double guardianThreshold) { this.guardianThreshold = guardianThreshold; }
    }
}