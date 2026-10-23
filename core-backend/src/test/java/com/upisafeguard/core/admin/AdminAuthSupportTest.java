package com.upisafeguard.core.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import com.upisafeguard.core.config.JwtConfig;
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;
import com.upisafeguard.core.web.ApiRequestException;

import io.jsonwebtoken.Claims;

/** Token semantics + guard/error pairing against the FastAPI helper contract. */
class AdminAuthSupportTest {

    private static final String USER_TOKEN = new JwtConfigUser().generateToken("j-1", "user@x.com");

    private AdminAuthSupport support;
    private Admin admin;

    private static class JwtConfigUser extends JwtConfig {
        JwtConfigUser() {
            ReflectionTestUtils.setField(this, "secret", "test-secret-value-for-admin-suite");
        }
    }

    @BeforeEach
    void setUp() {
        admin = new Admin();
        admin.setId(UUID.fromString("8f1a2b3c-1111-4222-8333-444455556666"));
        admin.setEmail("ops@upisafeguard.com");
        admin.setUsername("ops");
        admin.setPasswordHash(AdminAuthSupport.hashPassword("s3cure-pass!"));
        admin.setFullName("Ops Admin");
        admin.setRole("analyst");
        admin.setIsActive(true);

        AdminRepository repo = org.mockito.Mockito.mock(AdminRepository.class);
        org.mockito.Mockito.when(repo.findById(admin.getId())).thenReturn(java.util.Optional.of(admin));
        support = new AdminAuthSupport(new JwtConfigUser(), repo);
    }

    @Test
    void issuedTokenCarriesAdminTypeTwelveHourExpiryAndClaims() {
        String token = support.createToken(admin);
        java.util.Optional<Claims> claims = support.decode("Bearer " + token);

        assertThat(claims).isPresent();
        assertThat(claims.get().getSubject()).isEqualTo(admin.getId().toString());
        assertThat(claims.get().get("type", String.class)).isEqualTo("admin");
        assertThat(claims.get().get("email", String.class)).isEqualTo("ops@upisafeguard.com");
        long validityMs = claims.get().getExpiration().getTime() - claims.get().getIssuedAt().getTime();
        assertThat(validityMs).isEqualTo(12L * 60 * 60 * 1000); // 12 h, admin contract
        assertThat(AdminAuthSupport.expiryInFuture(claims)).isTrue();
        assertThat(support.isAdminToken("Bearer " + token)).isTrue();
    }

    @Test
    void userTokensDoNotAuthenticateAsAdmin() {
        java.util.Optional<Claims> claims = support.decode("Bearer " + USER_TOKEN);
        assertThat(claims).isEmpty(); // no type=admin claim
        assertThat(support.isAdminToken("Bearer " + USER_TOKEN)).isFalse();
    }

    @Test
    void guardErrorsMirrorFastAPIStatusDetailPairs() {
        final String token = "Bearer " + support.createToken(admin);

        // missing / malformed bearer → 401 Not authenticated
        assertThatThrownBy(() -> support.requireAdmin(null))
                .isInstanceOfSatisfying(ApiRequestException.class, e ->
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED))
                .hasMessage("Not authenticated");

        // wrong type or tampered → 401 Invalid or expired token
        assertThatThrownBy(() -> support.requireAdmin("Bearer " + USER_TOKEN))
                .isInstanceOf(ApiRequestException.class)
                .hasMessage("Invalid or expired token");
        assertThatThrownBy(() -> support.requireAdmin("Bearer garbage.token.here"))
                .isInstanceOf(ApiRequestException.class)
                .hasMessage("Invalid or expired token");

        // signed + typed but not in DB → 401 Admin not found
        Admin ghost = new Admin();
        ghost.setId(UUID.fromString("00000000-0000-0000-0000-000000000000"));
        assertThatThrownBy(() -> support.requireAdmin("Bearer " + support.createToken(ghost)))
                .isInstanceOf(ApiRequestException.class)
                .hasMessage("Admin not found");

        // deactivated account → 403 Admin account is deactivated
        admin.setIsActive(false);
        assertThatThrownBy(() -> support.requireAdmin(token))
                .isInstanceOfSatisfying(ApiRequestException.class, e ->
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN))
                .hasMessage("Admin account is deactivated");

        // role enforcement → 403 Insufficient permissions
        admin.setIsActive(true);
        assertThatThrownBy(() -> support.requireRole(token, java.util.Set.of("super_admin", "admin")))
                .isInstanceOf(ApiRequestException.class)
                .hasMessage("Insufficient permissions");

        // happy paths
        assertThat(support.requireAdmin(token).getId()).isEqualTo(admin.getId());
        assertThat(support.requireRole(token, AdminAuthSupport.ALL_ROLES).getId()).isEqualTo(admin.getId());
    }

    @Test
    void bcryptVerifyMatchesAndRejectsWrongInputs() {
        assertThat(AdminAuthSupport.verifyPassword("s3cure-pass!", admin.getPasswordHash())).isTrue();
        assertThat(AdminAuthSupport.verifyPassword("wrong", admin.getPasswordHash())).isFalse();
        // non-bcrypt hashes (e.g. legacy) fail closed
        assertThat(AdminAuthSupport.verifyPassword("s3cure-pass!", "not-a-bcrypt-hash")).isFalse();
    }
}
