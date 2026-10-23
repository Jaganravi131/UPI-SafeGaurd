package com.upisafeguard.core.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.persistence.Notification;
import com.upisafeguard.core.persistence.NotificationRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Notification endpoints. Response shapes mirror
 * backend/app/api/routes/notifications.py exactly:
 *   GET  /notifications/            → {"notifications": [...], "count": n}
 *   POST /notifications/{id}/read   → {"message": "Marked as read"}
 *   POST /notifications/read-all    → {"message": "All marked as read"}
 * Each notification row: {id, user_id, type, title, message, data, read, created_at}
 * with `data` decoded to a JSON object.
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationRepository notificationRepository;
    private final AuthSupport authSupport;
    private final ObjectMapper objectMapper;

    @Autowired
    public NotificationController(
            NotificationRepository notificationRepository,
            AuthSupport authSupport,
            ObjectMapper objectMapper) {
        this.notificationRepository = notificationRepository;
        this.authSupport = authSupport;
        this.objectMapper = objectMapper;
    }

    @GetMapping({"/", ""})
    public ResponseEntity<?> getNotifications(
            @RequestParam(name = "notification_type", required = false) String notificationType,
            @RequestParam(name = "unread_only", defaultValue = "false") boolean unreadOnly,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String userId = authSupport.requireUserId(authHeader);

        List<Notification> notifications = unreadOnly
                ? notificationRepository.findUnreadByUserIdOrdered(userId)
                : notificationRepository.findAllByUserIdOrdered(userId);

        if (notificationType != null && !notificationType.isBlank()) {
            notifications = notifications.stream()
                    .filter(n -> notificationType.equals(n.getType()))
                    .toList();
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Notification notification : notifications) {
            rows.add(toRow(notification, userId));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("notifications", rows);
        body.put("count", rows.size());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{notificationId}/read")
    public ResponseEntity<?> markRead(
            @PathVariable String notificationId,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String userId = authSupport.requireUserId(authHeader);
        fromUuid(notificationId).ifPresent(id -> notificationRepository
                .findAllByUserIdOrdered(userId).stream()
                .filter(n -> id.equals(n.getId()))
                .findFirst()
                .ifPresent(n -> {
                    n.setRead(true);
                    notificationRepository.save(n);
                }));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Marked as read");
        return ResponseEntity.ok(body);
    }

    @PostMapping("/read-all")
    public ResponseEntity<?> markAllRead(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String userId = authSupport.requireUserId(authHeader);
        notificationRepository.markAllRead(userId);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "All marked as read");
        return ResponseEntity.ok(body);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Map<String, Object> toRow(Notification notification, String userId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", String.valueOf(notification.getId()));
        row.put("user_id", userId);
        row.put("type", notification.getType());
        row.put("title", notification.getTitle());
        row.put("message", notification.getMessage());
        row.put("data", parseData(notification.getData()));
        row.put("read", Boolean.TRUE.equals(notification.getRead()));
        row.put("created_at", notification.getCreatedAt() == null ? null : notification.getCreatedAt().toString());
        return row;
    }

    private Object parseData(String data) {
        if (data == null || data.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(data, Object.class);
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private static Optional<UUID> fromUuid(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
