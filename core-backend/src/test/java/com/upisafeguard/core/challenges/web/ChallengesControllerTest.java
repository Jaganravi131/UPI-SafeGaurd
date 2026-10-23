package com.upisafeguard.core.challenges.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.web.ApiExceptionHandler;

/** HTTP contract tests for /api/v1/challenges/* — mirror challenge.py. */
class ChallengesControllerTest {

    private static final String QR_ID = "7f3b9c2e-11a4-4d3e-9a51-2b6c8d0e4f71";
    private static final String USER_ID = "33333333-3333-3333-3333-333333333333";

    private UserRepository userRepository;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        userRepository = Mockito.mock(UserRepository.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new ChallengesController(userRepository))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    private static User user(BigDecimal educationScore) {
        User user = new User();
        user.setId(UUID.fromString(USER_ID));
        user.setEducationScore(educationScore);
        return user;
    }

    @Test
    void listHidesScenarioOptionsAndAnswer() throws Exception {
        mockMvc.perform(get("/api/v1/challenges/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].id").value(QR_ID))
                .andExpect(jsonPath("$[0].title").value("Spot the QR Scam"))
                .andExpect(jsonPath("$[0].points").value(10))
                .andExpect(jsonPath("$[0].scenario").doesNotExist())
                .andExpect(jsonPath("$[0].options").doesNotExist())
                .andExpect(jsonPath("$[0].correct_answer").doesNotExist());
    }

    @Test
    void listFiltersByCategoryAndDifficulty() throws Exception {
        mockMvc.perform(get("/api/v1/challenges/list").param("category", "qr_code"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/v1/challenges/list").param("difficulty", "advanced"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].category").value("digital_arrest"));
    }

    @Test
    void dailyIncludesScenarioOptionsAndRecommendation() throws Exception {
        mockMvc.perform(get("/api/v1/challenges/daily"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scenario").isNotEmpty())
                .andExpect(jsonPath("$.options.length()").value(4))
                .andExpect(jsonPath("$.ai_recommendation").isNotEmpty())
                .andExpect(jsonPath("$.correct_answer").doesNotExist());
    }

    @Test
    void getSpecificChallengeReturnsFullShape() throws Exception {
        mockMvc.perform(get("/api/v1/challenges/" + QR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(QR_ID))
                .andExpect(jsonPath("$.options[2]")
                        .value("QR codes can only be used to PAY money, not receive. This is a scam!"))
                .andExpect(jsonPath("$.correct_answer").doesNotExist());
    }

    @Test
    void unknownChallengeIs404WithDetail() throws Exception {
        mockMvc.perform(get("/api/v1/challenges/00000000-0000-0000-0000-000000000000"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Challenge not found"));
    }

    @Test
    void submitCorrectAnswerAwardsPointsAndUpdatesEducationScore() throws Exception {
        User user = user(BigDecimal.valueOf(10));
        when(userRepository.findById(UUID.fromString(USER_ID))).thenReturn(Optional.of(user));

        mockMvc.perform(post("/api/v1/challenges/" + QR_ID + "/submit")
                        .param("answer", "2")
                        .param("time_taken", "12")
                        .param("user_id", USER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.correct_answer").value(2))
                .andExpect(jsonPath("$.points_earned").value(10))
                .andExpect(jsonPath("$.total_points").value(10))
                .andExpect(jsonPath("$.explanation").isNotEmpty());

        // +points/10 added (10/10 = 1), capped behaviour verified by value
        org.assertj.core.api.Assertions.assertThat(user.getEducationScore())
                .isEqualTo(BigDecimal.valueOf(11));
        verify(userRepository).save(any(User.class));
    }

    @Test
    void submitWrongAnswerReturnsCorrectAnswerAndZeroPoints() throws Exception {
        mockMvc.perform(post("/api/v1/challenges/" + QR_ID + "/submit")
                        .param("answer", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(false))
                .andExpect(jsonPath("$.points_earned").value(0));
        Mockito.verifyNoInteractions(userRepository);
    }

    @Test
    void submitIgnoresDemoUserSentinel() throws Exception {
        mockMvc.perform(post("/api/v1/challenges/" + QR_ID + "/submit")
                        .param("answer", "2")
                        .param("user_id", "demo-user"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correct").value(true));
        Mockito.verifyNoInteractions(userRepository);
    }

    @Test
    void categoriesLeaderboardBadgesShapes() throws Exception {
        mockMvc.perform(get("/api/v1/challenges/categories/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[0].id").value("qr_code"));

        mockMvc.perform(get("/api/v1/challenges/leaderboard"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.leaderboard[0].name").value("Rahul S."))
                .andExpect(jsonPath("$.leaderboard[0].points").value(450))
                .andExpect(jsonPath("$.user_rank").value(42))
                .andExpect(jsonPath("$.user_streak").value(3));

        mockMvc.perform(get("/api/v1/challenges/badges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.earned[0].id").value("first_challenge"))
                .andExpect(jsonPath("$.available[2].id").value("streak_7"))
                .andExpect(jsonPath("$.available[2].progress").value(3))
                .andExpect(jsonPath("$.available[2].total").value(7));
    }
}
