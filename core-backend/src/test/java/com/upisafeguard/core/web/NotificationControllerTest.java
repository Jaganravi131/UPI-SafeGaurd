package com.upisafeguard.core.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.persistence.Notification;
import com.upisafeguard.core.persistence.NotificationRepository;

/**
 * HTTP contract tests for /api/v1/notifications/* — mirror
 * backend/app/api/routes/notifications.py.
 */
class NotificationControllerTest {

    private static final String BEARER = "Bearer fake-token";

    private NotificationRepository repo;
    private Notification notification;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        repo = Mockito.mock(NotificationRepository.class);
        AuthSupport auth = Mockito.mock(AuthSupport.class);
        Mockito.when(auth.requireUserId(any())).thenAnswer(invocation -> {
            String header = invocation.getArgument(0);
            if (header == null || !header.startsWith("Bearer ")) {
                throw new ApiRequestException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Not authenticated");
            }
            return "11111111-1111-1111-1111-111111111111";
        });

        notification = new Notification();
        notification.setId(UUID.fromString("22222222-2222-2222-2222-222222222222"));
        notification.setType("security");
        notification.setTitle("High Risk Alert");
        notification.setMessage("Blocked a suspicious payment");
        notification.setData("{\"transaction_id\":\"tx-1\"}");
        notification.setRead(false);
        notification.setCreatedAt(Instant.parse("2026-10-23T10:00:00Z"));

        Mockito.when(repo.findAllByUserIdOrdered(anyString())).thenReturn(List.of(notification));
        Mockito.when(repo.findUnreadByUserIdOrdered(anyString()))
                .thenReturn(List.of(notification));

        mockMvc = MockMvcBuilders.standaloneSetup(new NotificationController(repo, auth, new ObjectMapper()))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void listReturnsFastPIShapeWithDecodedData() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/").header(HttpHeaders.AUTHORIZATION, BEARER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.notifications[0].id").value(notification.getId().toString()))
                .andExpect(jsonPath("$.notifications[0].user_id")
                        .value("11111111-1111-1111-1111-111111111111"))
                .andExpect(jsonPath("$.notifications[0].type").value("security"))
                .andExpect(jsonPath("$.notifications[0].data.transaction_id").value("tx-1"))
                .andExpect(jsonPath("$.notifications[0].read").value(false))
                .andExpect(jsonPath("$.notifications[0].created_at").value("2026-10-23T10:00:00Z"))
                .andReturn();

        // trailing-slash-free variant also served (axios compatibility)
        mockMvc.perform(get("/api/v1/notifications").header(HttpHeaders.AUTHORIZATION, BEARER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void listWithoutBearerUnauthorizedWithDetail() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Not authenticated"));
    }

    @Test
    void markReadUpdatesOwnedNotification() throws Exception {
        Mockito.when(repo.findById(notification.getId())).thenReturn(Optional.of(notification));

        mockMvc.perform(post("/api/v1/notifications/" + notification.getId() + "/read")
                        .header(HttpHeaders.AUTHORIZATION, BEARER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Marked as read"));
        Mockito.verify(repo).save(any(Notification.class));
    }

    @Test
    void readAllMarksAllRead() throws Exception {
        mockMvc.perform(post("/api/v1/notifications/read-all")
                        .header(HttpHeaders.AUTHORIZATION, BEARER)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("All marked as read"));
        Mockito.verify(repo).markAllRead(eq("11111111-1111-1111-1111-111111111111"));
    }
}
