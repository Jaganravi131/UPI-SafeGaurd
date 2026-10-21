package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.services.UserProfileService;
import com.upisafeguard.core.services.UserProfileService.UpdateMe;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * /users/me — GET returns the authenticated profile, PUT edits personal
 * details. Exact response-key parity with backend/app/api/routes/users.py.
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserProfileService userProfileService;
    private final AuthSupport authSupport;

    @Autowired
    public UserController(UserProfileService userProfileService, AuthSupport authSupport) {
        this.userProfileService = userProfileService;
        this.authSupport = authSupport;
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = userProfileService.getMe(tokenUser);
        return ResponseEntity.ok(userProfileService.profilePayload(user));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMe(
            @RequestBody UpdateMe update,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String tokenUser = authSupport.requireUserId(authHeader);
        User user = userProfileService.updateMe(tokenUser, update);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "Profile updated");
        body.put("user", userProfileService.profilePayload(user));
        return ResponseEntity.ok(body);
    }
}
