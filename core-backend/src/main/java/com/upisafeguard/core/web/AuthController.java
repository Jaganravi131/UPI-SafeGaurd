package com.upisafeguard.core.web;

import com.upisafeguard.core.risk.AssessmentTokenService;
import com.upisafeguard.core.risk.RiskAssessmentRequest;
import com.upisafeguard.core.risk.RiskAssessmentResponse;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.services.OtpService;
import com.upisafeguard.core.web.dto.AuthRequestDTO;
import com.upisafeguard.core.web.dto.AuthResponseDTO;
import com.upisafeguard.core.web.dto.RegisterRequestDTO;
import com.upisafeguard.core.web.dto.OTPRequestDTO;
import com.upisafeguard.core.web.dto.OTPVerifyDTO;
import com.upisafeguard.core.web.dto.SessionValidationDTO;
import com.upisafeguard.core.config.JwtConfig;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final OtpService otpService;
    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final AssessmentTokenService assessmentTokenService;
    private final JwtConfig jwtConfig;

    private final com.upisafeguard.core.services.RateLimitService rateLimitService;

    /** Demo mode: expose the generated OTP in the response. Disabled in production via config. */
    @org.springframework.beans.factory.annotation.Value("${app.expose-demo-otp:true}")
    private boolean exposeDemoOtp;

    @Autowired
    public AuthController(
            OtpService otpService,
            UserRepository userRepository,
            WalletRepository walletRepository,
            AssessmentTokenService assessmentTokenService,
            JwtConfig jwtConfig,
            com.upisafeguard.core.services.RateLimitService rateLimitService) {
        this.otpService = otpService;
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.assessmentTokenService = assessmentTokenService;
        this.jwtConfig = jwtConfig;
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/request-otp")
    public ResponseEntity<OTPRequestDTO.Response> requestOTP(@Valid @RequestBody OTPRequestDTO.Request request) {
        String identifier = request.getIdentifier(); // email or phone
        rateLimitService.otpRequest(identifier);
        String otpCode = otpService.generateAndStoreOTP(identifier);

        String message = exposeDemoOtp
                ? "OTP generated (check server logs)"
                : "OTP sent to your email";

        return ResponseEntity.ok(new OTPRequestDTO.Response(true, message, exposeDemoOtp ? otpCode : null));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<AuthResponseDTO> verifyOTP(@Valid @RequestBody OTPVerifyDTO request) {
        String identifier = request.getIdentifier(); // email or phone
        String otp = request.getOtp();
        rateLimitService.otpVerify(identifier);

        boolean valid = otpService.verifyOTP(identifier, otp);
        if (!valid) {
            return ResponseEntity.badRequest()
                    .body(new AuthResponseDTO(false, "Invalid or expired OTP", null, null, false, null));
        }

        // Check if user exists
        Optional<User> userOpt = userRepository.findByEmail(identifier);
        // Also try phone number
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByPhoneNumber(identifier);
        }

        if (userOpt.isEmpty()) {
            // New user - return info for registration
            return ResponseEntity.ok(new AuthResponseDTO(
                    true, "OTP verified. Please complete registration.",
                    null, null, true, null
            ));
        }

        User user = userOpt.get();
        
        // Generate JWT token
        String token = jwtConfig.generateToken(user.getId().toString(), user.getEmail());
        
        return ResponseEntity.ok(new AuthResponseDTO(
                true, "Login successful",
                token, user.getId().toString(), false, user.getFullName()
        ));
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponseDTO> register(@Valid @RequestBody RegisterRequestDTO request) {
        // Check if user already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            return ResponseEntity.badRequest()
                    .body(new AuthResponseDTO(false, "Email already registered", null, null, false, null));
        }
        if (userRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            return ResponseEntity.badRequest()
                    .body(new AuthResponseDTO(false, "Phone number already registered", null, null, false, null));
        }

        // Create user
        User user = new User();
        user.setEmail(request.getEmail());
        user.setPhoneNumber(request.getPhoneNumber());
        user.setFullName(request.getFullName());
        user.setUpiId(request.getUpiId());
        user.setFirebaseUid(request.getFirebaseUid());
        user.setSecurityScore(BigDecimal.valueOf(50.0));
        user.setBehaviorScore(BigDecimal.valueOf(50.0));
        user.setDailyLimit(BigDecimal.valueOf(100000.0));
        user.setPreferredLanguage("en");
        
        userRepository.save(user);

        // Create wallet with initial balance
        Wallet wallet = new Wallet(user.getId(), BigDecimal.valueOf(10000.0));
        walletRepository.save(wallet);

        String token = jwtConfig.generateToken(user.getId().toString(), user.getEmail());

        return ResponseEntity.ok(new AuthResponseDTO(
                true, "Account created successfully",
                token, user.getId().toString(), false, user.getFullName()
        ));
    }

    @PostMapping("/validate-session")
    public ResponseEntity<SessionValidationDTO> validateSession(
            @RequestHeader("Authorization") String authHeader) {
        String token = authHeader.replace("Bearer ", "");
        // Validate JWT token
        // For now, return valid
        return ResponseEntity.ok(new SessionValidationDTO(true, "Session valid"));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader("Authorization") String authHeader) {
        // Invalidate token (in production, add to blacklist)
        return ResponseEntity.ok().build();
    }
}