package com.upisafeguard.core.services;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.web.ApiRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Profile endpoints (/users/me). Mirrors backend/app/api/routes/users.py:
 * GET returns the profile snapshot, PUT edits personal details with email and
 * Indian mobile number validation plus uniqueness checks.
 */
@Service
public class UserProfileService {

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern INDIAN_PHONE = Pattern.compile("^[6-9]\\d{9}$");

    private final UserRepository userRepository;

    public UserProfileService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User getMe(String userId) {
        return userRepository.findById(parse(userId))
                .orElseThrow(() -> new ApiRequestException(HttpStatus.NOT_FOUND, "User not found"));
    }

    @Transactional
    public User updateMe(String userId, UpdateMe update) {
        User user = getMe(userId);

        if (update.email != null && !update.email.isBlank()) {
            String email = update.email.strip().toLowerCase();
            if (!EMAIL.matcher(email).matches()) {
                throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Invalid email address");
            }
            String current = user.getEmail() == null ? "" : user.getEmail().toLowerCase();
            if (!email.equals(current)) {
                if (userRepository.existsByEmail(email)) {
                    throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Email already registered");
                }
                user.setEmail(email);
            }
        }

        if (update.phoneNumber != null && !update.phoneNumber.isBlank()) {
            String clean = cleanPhone(update.phoneNumber);
            if (!INDIAN_PHONE.matcher(clean).matches()) {
                throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Invalid Indian mobile number");
            }
            if (!clean.equals(cleanPhone(user.getPhoneNumber()))) {
                if (userRepository.existsByPhoneNumber(update.phoneNumber)) {
                    throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Phone number already registered");
                }
                user.setPhoneNumber(update.phoneNumber);
            }
        }

        if (update.fullName != null && !update.fullName.isBlank()) {
            user.setFullName(update.fullName.strip());
        }
        if (update.preferredLanguage != null && !update.preferredLanguage.isBlank()) {
            user.setPreferredLanguage(update.preferredLanguage.strip());
        }

        return userRepository.save(user);
    }

    /** Shape-compatible payload builder — identical keys to users.py. */
    public Map<String, Object> profilePayload(User user) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", user.getId().toString());
        body.put("full_name", user.getFullName());
        body.put("email", user.getEmail());
        body.put("phone_number", user.getPhoneNumber());
        body.put("upi_id", user.getUpiId());
        body.put("preferred_language", user.getPreferredLanguage() == null ? "english" : user.getPreferredLanguage());
        body.put("digital_literacy",
                user.getDigitalLiteracy() == null ? "intermediate" : user.getDigitalLiteracy().name().toLowerCase());
        body.put("security_score", user.getSecurityScore() == null ? 0 : user.getSecurityScore());
        body.put("guardian_enabled", user.getGuardianEnabled() != null && user.getGuardianEnabled());
        return body;
    }

    private static UUID parse(String userId) {
        try {
            return UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            throw new ApiRequestException(HttpStatus.BAD_REQUEST, "Invalid user id");
        }
    }

    private static String cleanPhone(String value) {
        return value == null ? "" : value.replace("+91", "").replace(" ", "").strip();
    }

    /** Incoming PUT body. FastAPI keys are snake_case. */
    public static class UpdateMe {
        @com.fasterxml.jackson.annotation.JsonAlias({"full_name"})
        public String fullName;
        @com.fasterxml.jackson.annotation.JsonAlias({"email"})
        public String email;
        @com.fasterxml.jackson.annotation.JsonAlias({"phone_number"})
        public String phoneNumber;
        @com.fasterxml.jackson.annotation.JsonAlias({"preferred_language"})
        public String preferredLanguage;

        public String getFullName() { return fullName; }
        public String getEmail() { return email; }
        public String getPhoneNumber() { return phoneNumber; }
        public String getPreferredLanguage() { return preferredLanguage; }
    }
}
