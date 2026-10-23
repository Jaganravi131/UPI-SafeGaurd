package com.upisafeguard.core.challenges.web;

import java.util.ArrayList;
import java.util.List;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.web.ApiRequestException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Challenge/gamification endpoints. Data mirrors backend/app/api/routes/
 * challenge.py (SAMPLE_CHALLENGES + demo leaderboard/badges). Challenge IDs
 * are fixed constants instead of per-boot random UUIDs so links survive
 * redeploys.
 */
@RestController
@RequestMapping("/api/v1/challenges")
public class ChallengesController {

    // Fixed catalog — same content as the Python SAMPLE_CHALLENGES.
    private static final List<Map<String, Object>> CHALLENGES = buildChallenges();
    private static final List<Map<String, Object>> CATEGORIES = buildCategories();

    private final UserRepository userRepository;

    @Autowired
    public ChallengesController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/list")
    public ResponseEntity<?> list(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String difficulty) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> challenge : CHALLENGES) {
            if (category != null && !category.equals(challenge.get("category"))) {
                continue;
            }
            if (difficulty != null && !difficulty.equals(challenge.get("difficulty"))) {
                continue;
            }
            // Don't expose correct answer, scenario or options in the list —
            // matching the Python contract.
            result.add(silhouette((String) challenge.get("id")));
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/daily")
    public ResponseEntity<?> daily() {
        // Random selection, matching the Python demo behaviour.
        Map<String, Object> challenge = CHALLENGES.get(java.util.concurrent.ThreadLocalRandom.current()
                .nextInt(CHALLENGES.size()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", challenge.get("id"));
        body.put("title", challenge.get("title"));
        body.put("category", challenge.get("category"));
        body.put("difficulty", challenge.get("difficulty"));
        body.put("scenario", challenge.get("scenario"));
        body.put("options", challenge.get("options"));
        body.put("points", challenge.get("points"));
        body.put("ai_recommendation", "Based on trending scams, we recommend practicing this scenario");
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{challengeId}")
    public ResponseEntity<?> get(@PathVariable String challengeId) {
        Map<String, Object> challenge = byId(challengeId);
        if (challenge == null) {
            throw new ApiRequestException(HttpStatus.NOT_FOUND, "Challenge not found");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", challenge.get("id"));
        body.put("title", challenge.get("title"));
        body.put("category", challenge.get("category"));
        body.put("difficulty", challenge.get("difficulty"));
        body.put("scenario", challenge.get("scenario"));
        body.put("options", challenge.get("options"));
        body.put("points", challenge.get("points"));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{challengeId}/submit")
    public ResponseEntity<?> submit(
            @PathVariable String challengeId,
            @RequestParam(name = "answer") int answer,
            @RequestParam(name = "time_taken", required = false, defaultValue = "0") Integer timeTaken,
            @RequestParam(name = "user_id", required = false) String userId) {
        Map<String, Object> challenge = byId(challengeId);
        if (challenge == null) {
            throw new ApiRequestException(HttpStatus.NOT_FOUND, "Challenge not found");
        }

        int correctAnswer = (Integer) challenge.get("correct_answer");
        boolean isCorrect = answer == correctAnswer;
        int pointsEarned = isCorrect ? (Integer) challenge.get("points") : 0;

        // Update the user's education score exactly like the Python route:
        // user_id provided and not the demo sentinel.
        if (userId != null && !"demo-user".equals(userId)) {
            try {
                userRepository.findById(UUID.fromString(userId)).ifPresent(user -> {
                    BigDecimal score = user.getEducationScore() == null
                            ? BigDecimal.ZERO
                            : user.getEducationScore();
                    BigDecimal updated = score.add(BigDecimal.valueOf(pointsEarned).divide(BigDecimal.TEN));
                    user.setEducationScore(updated.min(BigDecimal.valueOf(100)));
                    userRepository.save(user);
                });
            } catch (IllegalArgumentException ignored) {
                // Non-UUID user id (demo mode) — skip persistence.
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("correct", isCorrect);
        body.put("correct_answer", correctAnswer);
        body.put("explanation", challenge.get("explanation"));
        body.put("points_earned", pointsEarned);
        body.put("total_points", pointsEarned); // accumulates in production
        return ResponseEntity.ok(body);
    }

    @GetMapping("/categories/list")
    public ResponseEntity<?> categories() {
        return ResponseEntity.ok(CATEGORIES);
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<?> leaderboard() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("leaderboard", List.of(
                Map.of("rank", 1, "name", "Rahul S.", "points", 450, "streak", 15),
                Map.of("rank", 2, "name", "Priya M.", "points", 380, "streak", 12),
                Map.of("rank", 3, "name", "Amit K.", "points", 320, "streak", 8),
                Map.of("rank", 4, "name", "Sneha R.", "points", 290, "streak", 7),
                Map.of("rank", 5, "name", "Vijay P.", "points", 250, "streak", 5)));
        body.put("user_rank", 42);
        body.put("user_points", 120);
        body.put("user_streak", 3);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/badges")
    public ResponseEntity<?> badges() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("earned", List.of(
                Map.of("id", "first_challenge", "name", "First Steps",
                        "description", "Complete your first challenge", "icon", "🎯"),
                Map.of("id", "streak_3", "name", "Consistent Learner",
                        "description", "3-day streak", "icon", "🔥")));
        body.put("available", List.of(
                Map.of("id", "scam_spotter", "name", "Scam Spotter",
                        "description", "Complete 10 challenges", "icon", "🔍",
                        "progress", 3, "total", 10),
                Map.of("id", "ai_star", "name", "AI's Star Student",
                        "description", "90% accuracy", "icon", "⭐",
                        "progress", 75, "total", 90),
                Map.of("id", "streak_7", "name", "Streak Master",
                        "description", "7-day streak", "icon", "🏆",
                        "progress", 3, "total", 7)));
        return ResponseEntity.ok(body);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Map<String, Object> byId(String id) {
        for (Map<String, Object> challenge : CHALLENGES) {
            if (challenge.get("id").equals(id)) {
                return challenge;
            }
        }
        return null;
    }

    /** Public silhouette: id/title/category/difficulty/points only. */
    private Map<String, Object> silhouette(String id) {
        Map<String, Object> challenge = byId(id);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", challenge.get("id"));
        body.put("title", challenge.get("title"));
        body.put("category", challenge.get("category"));
        body.put("difficulty", challenge.get("difficulty"));
        body.put("points", challenge.get("points"));
        return body;
    }

    private static Map<String, Object> entry(
            String id, String title, String category, String difficulty,
            String scenario, List<String> options, int correctAnswer,
            String explanation, int points) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", id);
        map.put("title", title);
        map.put("category", category);
        map.put("difficulty", difficulty);
        map.put("scenario", scenario);
        map.put("options", options);
        map.put("correct_answer", correctAnswer);
        map.put("explanation", explanation);
        map.put("points", points);
        return map;
    }

    private static List<Map<String, Object>> buildChallenges() {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(entry(
                "7f3b9c2e-11a4-4d3e-9a51-2b6c8d0e4f71",
                "Spot the QR Scam",
                "qr_code",
                "beginner",
                "You're selling a phone on OLX for ₹15,000. A buyer says: 'I'll pay now. Scan this QR code to receive ₹15,000 instantly.' What should you do?",
                List.of(
                        "Scan the QR code to receive the money",
                        "Ask them to pay directly to your UPI ID",
                        "QR codes can only be used to PAY money, not receive. This is a scam!",
                        "Ask for a different QR code"),
                2,
                "QR codes are ONLY for PAYING money, never for receiving! When you scan a QR code, money goes OUT of your account. Scammers trick people by saying 'scan to receive money'. Always remember: To receive money, share your UPI ID - never scan any QR code.",
                10));
        list.add(entry(
                "9a1d5e7f-24b8-4c6a-8e92-3f5b7a9c1d84",
                "The Fake Bank Call",
                "phone_call",
                "beginner",
                "You receive a call: 'Sir, this is from SBI Bank. Your account will be blocked in 2 hours due to KYC issues. Please share your OTP to verify your account.' What do you do?",
                List.of(
                        "Share the OTP quickly to save your account",
                        "Ask them to call back later",
                        "Hang up immediately - banks NEVER ask for OTP on calls",
                        "Give them your ATM PIN instead"),
                2,
                "Banks NEVER call and ask for OTP, PIN, or passwords. This is 100% a scam! Real banks will ask you to visit the branch or use official app. If someone claims to be from bank and asks for OTP - it's always a scam. Hang up and call your bank's official number if worried.",
                10));
        list.add(entry(
                "4d8c1f3a-92e6-4b7d-a1c3-5e8b2f6a9d47",
                "The Digital Arrest Scam",
                "digital_arrest",
                "advanced",
                "You get a video call from someone in police uniform claiming you're involved in money laundering. They say: 'Pay ₹50,000 as security deposit or we'll arrest you. Don't tell anyone or disconnect.' What should you do?",
                List.of(
                        "Pay immediately to avoid arrest",
                        "Ask for more time to arrange money",
                        "This is the 'Digital Arrest' scam - no such thing exists. Hang up and report to 1930",
                        "Transfer half the amount first"),
                2,
                "Digital Arrest is a SCAM - there's no such legal procedure! Police never demand money on video calls. They cannot 'digitally arrest' anyone. Scammers dress as police/CBI to scare victims. If this happens: 1) Hang up immediately, 2) Don't pay anything, 3) Report to Cyber Crime helpline 1930.",
                15));
        list.add(entry(
                "b6e2a8f4-7d91-4a5e-8c3f-1a9d6b4e7c52",
                "Remote Access Trap",
                "remote_access",
                "intermediate",
                "Someone calls claiming to be from 'customer support' and says: 'Your UPI is not working. Install AnyDesk app and share the code - I'll fix it remotely.' What's the right action?",
                List.of(
                        "Install AnyDesk and share the code",
                        "Ask them to fix without remote access",
                        "Never install remote access apps for strangers - this gives them control of your phone!",
                        "Share screen but not code"),
                2,
                "Remote access apps like AnyDesk give COMPLETE control of your phone! Scammers can then: See your OTPs, Access your bank apps, Make payments from your accounts. NO legitimate support will ever ask you to install such apps. If UPI isn't working, contact your bank directly.",
                12));
        list.add(entry(
                "c8f4d3b2-5a17-4e9b-b2d6-7c1e3a5f8d64",
                "The Lucky Winner",
                "lottery",
                "beginner",
                "You receive a message: 'Congratulations! You've won ₹10,00,000 in Jio Lucky Draw! Pay ₹5,000 processing fee to claim your prize.' What's the truth?",
                List.of(
                        "Pay the fee to claim the prize",
                        "Ask if you can pay less",
                        "This is a lottery scam - you can't win a contest you never entered!",
                        "Check if Jio really has this offer"),
                2,
                "You cannot win a lottery or contest you never entered! All such messages are scams. Real prizes never require you to pay first. Companies like Jio don't run such SMS lottery schemes. If you need to pay to 'receive' money - it's always a scam!",
                10));
        return list;
    }

    private static List<Map<String, Object>> buildCategories() {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(Map.of("id", "qr_code", "name", "QR Code Scams",
                "description", "Learn to identify QR code fraud attempts"));
        list.add(Map.of("id", "phone_call", "name", "Phone Call Scams",
                "description", "Recognize fake bank and KYC calls"));
        list.add(Map.of("id", "digital_arrest", "name", "Digital Arrest",
                "description", "Understand the digital arrest scam"));
        list.add(Map.of("id", "remote_access", "name", "Remote Access Scams",
                "description", "Avoid screen sharing traps"));
        list.add(Map.of("id", "lottery", "name", "Lottery & Prize Scams",
                "description", "Spot fake winning announcements"));
        list.add(Map.of("id", "job_scam", "name", "Job Scams",
                "description", "Identify fraudulent job offers"));
        return list;
    }
}
