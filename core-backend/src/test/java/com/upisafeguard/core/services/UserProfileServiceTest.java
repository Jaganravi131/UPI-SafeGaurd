package com.upisafeguard.core.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.http.HttpStatus;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.web.ApiRequestException;

class UserProfileServiceTest {

    private static final UUID USER_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");

    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserProfileService service = new UserProfileService(userRepository);

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setId(USER_ID);
        user.setPhoneNumber("+919000000001");
        user.setFullName("Old Name");
        user.setEmail("old@example.com");
        user.setSecurityScore(new java.math.BigDecimal("50.00"));
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void getMeReturnsProfile() {
        assertThat(service.getMe(USER_ID.toString()).getFullName()).isEqualTo("Old Name");
    }

    @Test
    void updateMeRenamesUser() {
        UserProfileService.UpdateMe update = new UserProfileService.UpdateMe();
        update.fullName = "  JAGAN BABU  ";

        User result = service.updateMe(USER_ID.toString(), update);

        assertThat(result.getFullName()).isEqualTo("JAGAN BABU");
        Map<String, Object> payload = service.profilePayload(result);
        assertThat(payload.get("full_name")).isEqualTo("JAGAN BABU");
        assertThat(payload.get("id")).isEqualTo(USER_ID.toString());
        assertThat(payload.get("digital_literacy")).isEqualTo("intermediate");
    }

    @Test
    void updateMeRejectsInvalidEmail() {
        UserProfileService.UpdateMe update = new UserProfileService.UpdateMe();
        update.email = "not-an-email";

        assertThatThrownBy(() -> service.updateMe(USER_ID.toString(), update))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).isEqualTo("Invalid email address");
                });
    }

    @Test
    void updateMeRejectsInvalidIndianPhone() {
        UserProfileService.UpdateMe update = new UserProfileService.UpdateMe();
        update.phoneNumber = "5123456789"; // starts with 5, not a valid Indian mobile

        assertThatThrownBy(() -> service.updateMe(USER_ID.toString(), update))
                .isInstanceOfSatisfying(ApiRequestException.class,
                        e -> assertThat(e.getMessage()).isEqualTo("Invalid Indian mobile number"));
    }

    @Test
    void updateMeAcceptsPlus91Phone() {
        UserProfileService.UpdateMe update = new UserProfileService.UpdateMe();
        update.phoneNumber = "+919349606143";
        when(userRepository.existsByPhoneNumber("+919349606143")).thenReturn(false);

        User result = service.updateMe(USER_ID.toString(), update);

        assertThat(result.getPhoneNumber()).isEqualTo("+919349606143");
    }

    @Test
    void updateMeRejectsDuplicateEmail() {
        UserProfileService.UpdateMe update = new UserProfileService.UpdateMe();
        update.email = "taken@example.com";
        when(userRepository.existsByEmail("taken@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.updateMe(USER_ID.toString(), update))
                .isInstanceOfSatisfying(ApiRequestException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).isEqualTo("Email already registered");
                });
    }

    @Test
    void updateMeRejectsDuplicatePhone() {
        UserProfileService.UpdateMe update = new UserProfileService.UpdateMe();
        update.phoneNumber = "+919999999999";
        when(userRepository.existsByPhoneNumber("+919999999999")).thenReturn(true);

        assertThatThrownBy(() -> service.updateMe(USER_ID.toString(), update))
                .isInstanceOfSatisfying(ApiRequestException.class,
                        e -> assertThat(e.getMessage()).isEqualTo("Phone number already registered"));
    }
}
