package com.upisafeguard.core.services;

import com.upisafeguard.core.persistence.OTPRecord;
import com.upisafeguard.core.persistence.OTPRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Optional;

/**
 * Server-side OTP service backed by the otp_records table.
 *
 * GPay keeps OTP state server-side (Redis); here we keep it in the database so
 * OTPs survive restarts and work across replicas. Email delivery is free:
 * dev = console log, prod = SMTP (configured via spring.mail in production).
 */
@Service
public class OtpService {

    private static final int OTP_LENGTH = 6;
    private static final long OTP_EXPIRY_SECONDS = 300; // 5 minutes
    private static final int MAX_ATTEMPTS = 3;

    private static final SecureRandom random = new SecureRandom();

    /** Demo mode: log the OTP server-side for development. Disabled via app.expose-demo-otp=false in production. */
    @org.springframework.beans.factory.annotation.Value("${app.expose-demo-otp:true}")
    private boolean exposeDemoOtp;

    private final OTPRepository otpRepository;

    public OtpService(OTPRepository otpRepository) {
        this.otpRepository = otpRepository;
    }

    @Transactional
    public String generateAndStoreOTP(String identifier) {
        String email = identifier.toLowerCase().trim();

        // Upsert semantics: the email column is unique, so remove any previous record first
        otpRepository.findByEmailIgnoreCase(email).ifPresent(otpRepository::delete);

        String otp = generateOTP();
        OTPRecord record = new OTPRecord(email, otp, Instant.now().plusSeconds(OTP_EXPIRY_SECONDS));
        otpRepository.save(record);

        // Development delivery: server log (production delivers via SMTP mail config)
        if (exposeDemoOtp) {
            System.out.println("🔐 OTP for " + email + ": " + otp + " (expires in "
                    + (OTP_EXPIRY_SECONDS / 60) + " minutes, persisted server-side)");
        }

        return otp;
    }

    @Transactional
    public boolean verifyOTP(String identifier, String otp) {
        String email = identifier.toLowerCase().trim();

        Optional<OTPRecord> maybeRecord = otpRepository.findByEmailAndNotExpired(email);
        if (maybeRecord.isEmpty()) {
            return false; // no OTP, expired, or already used
        }

        OTPRecord record = maybeRecord.get();

        if (record.getAttempts() >= MAX_ATTEMPTS) {
            otpRepository.delete(record);
            return false; // too many attempts
        }

        if (!record.getOtp().equals(otp)) {
            record.setAttempts(record.getAttempts() + 1);
            otpRepository.save(record); // attempts increment survives restart, unlike the old in-memory map
            return false;
        }

        // Success: single-use, consume the record
        otpRepository.delete(record);
        return true;
    }

    private String generateOTP() {
        int otp = random.nextInt(900000) + 100000; // 6 digits
        return String.valueOf(otp);
    }
}
