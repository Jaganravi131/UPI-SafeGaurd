package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.Guardian;
import com.upisafeguard.core.persistence.GuardianRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/guardian")
public class GuardianController {

    private final GuardianRepository guardianRepository;
    private final UserRepository userRepository;

    @Autowired
    public GuardianController(GuardianRepository guardianRepository, UserRepository userRepository) {
        this.guardianRepository = guardianRepository;
        this.userRepository = userRepository;
    }

    @PostMapping("/setup")
    public ResponseEntity<GuardianSetupResponse> setupGuardian(@Valid @RequestBody GuardianSetupRequest request) {
        // Find ward user
        Optional<User> wardOpt = userRepository.findByPhoneNumber(request.getUserPhone());
        if (wardOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new GuardianSetupResponse(false, "User not found", null));
        }

        User ward = wardOpt.get();

        // Create guardian
        Guardian guardian = new Guardian();
        guardian.setUser(ward);
        guardian.setGuardianPhone(request.getGuardianPhone());
        guardian.setGuardianName(request.getGuardianName());
        guardian.setRelationType(request.getRelationType());
        guardian.setStatus("pending");

        guardianRepository.save(guardian);

        return ResponseEntity.ok(new GuardianSetupResponse(true, "Guardian request sent", guardian.getId().toString()));
    }

    @GetMapping("/list")
    public ResponseEntity<List<Guardian>> listGuardians(@RequestParam String userPhone) {
        Optional<User> userOpt = userRepository.findByPhoneNumber(userPhone);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        List<Guardian> guardians = guardianRepository.findByUser(userOpt.get());
        return ResponseEntity.ok(guardians);
    }

    @DeleteMapping("/{guardianId}")
    public ResponseEntity<Void> removeGuardian(@PathVariable String guardianId) {
        try {
            UUID uuid = UUID.fromString(guardianId);
            guardianRepository.deleteById(uuid);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/my-wards")
    public ResponseEntity<List<Guardian>> getMyWards(@RequestParam String guardianPhone) {
        List<Guardian> wards = guardianRepository.findByGuardianPhone(guardianPhone);
        return ResponseEntity.ok(wards);
    }

    @GetMapping("/pending-approvals")
    public ResponseEntity<List<Guardian>> getPendingApprovals(@RequestParam String guardianPhone) {
        List<Guardian> wards = guardianRepository.findByGuardianPhoneAndStatus(guardianPhone, "pending");
        return ResponseEntity.ok(wards);
    }

    @PostMapping("/approve/{transactionId}")
    public ResponseEntity<Void> approve(@PathVariable String transactionId) {
        // In real implementation, would approve transaction
        return ResponseEntity.ok().build();
    }

    @PostMapping("/reject/{transactionId}")
    public ResponseEntity<Void> reject(@PathVariable String transactionId, @RequestParam(required = false) String reason) {
        // In real implementation, would reject transaction
        return ResponseEntity.ok().build();
    }

    // DTOs
    public static class GuardianSetupRequest {
        private String userPhone;
        private String guardianPhone;
        private String guardianName;
        private String relationType;

        public String getUserPhone() { return userPhone; }
        public void setUserPhone(String userPhone) { this.userPhone = userPhone; }
        public String getGuardianPhone() { return guardianPhone; }
        public void setGuardianPhone(String guardianPhone) { this.guardianPhone = guardianPhone; }
        public String getGuardianName() { return guardianName; }
        public void setGuardianName(String guardianName) { this.guardianName = guardianName; }
        public String getRelationType() { return relationType; }
        public void setRelationType(String relationType) { this.relationType = relationType; }
    }

    public static class GuardianSetupResponse {
        private boolean success;
        private String message;
        private String guardianId;

        public GuardianSetupResponse(boolean success, String message, String guardianId) {
            this.success = success;
            this.message = message;
            this.guardianId = guardianId;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getGuardianId() { return guardianId; }
    }
}