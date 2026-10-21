package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.Notification;
import com.upisafeguard.core.persistence.NotificationRepository;
import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    @Autowired
    public NotificationController(NotificationRepository notificationRepository, UserRepository userRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<Page<Notification>> getAll(
            @RequestParam(required = false) String userId,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            Pageable pageable) {
        
        if (userId == null) {
            return ResponseEntity.badRequest().build();
        }
        
        try {
            UUID uuid = UUID.fromString(userId);
            
            if (unreadOnly) {
                return ResponseEntity.ok(notificationRepository.findUnreadByUserId(uuid.toString(), PageRequest.of(0, 20)));
            }
            
            return ResponseEntity.ok(notificationRepository.findByUserId(uuid.toString(), PageRequest.of(0, 20)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{notificationId}/read")
    public ResponseEntity<Void> markRead(@PathVariable String notificationId) {
        try {
            UUID uuid = UUID.fromString(notificationId);
            // In a real implementation, would update the notification
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/read-all")
    public ResponseEntity<Void> markAllRead(@RequestParam String userId) {
        try {
            UUID uuid = UUID.fromString(userId);
            // In a real implementation, would mark all as read
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}