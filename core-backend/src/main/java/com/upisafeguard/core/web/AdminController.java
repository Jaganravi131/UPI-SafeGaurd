package com.upisafeguard.core.web;

import com.upisafeguard.core.persistence.User;
import com.upisafeguard.core.persistence.UserRepository;
import com.upisafeguard.core.persistence.Wallet;
import com.upisafeguard.core.persistence.WalletRepository;
import com.upisafeguard.core.persistence.FraudReport;
import com.upisafeguard.core.persistence.FraudReportRepository;
import com.upisafeguard.core.persistence.PaymentTransaction;
import com.upisafeguard.core.persistence.PaymentTransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import java.math.BigDecimal;
import java.util.stream.Collectors;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upisafeguard.core.persistence.ActivityLog;
import com.upisafeguard.core.persistence.ActivityLogRepository;
import com.upisafeguard.core.persistence.Admin;
import com.upisafeguard.core.persistence.AdminRepository;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final UserRepository userRepository;
    private final WalletRepository walletRepository;
    private final FraudReportRepository fraudReportRepository;
    private final PaymentTransactionRepository transactionRepository;
    private final ActivityLogRepository activityLogRepository;
    private final AdminRepository adminRepository;
    private final com.upisafeguard.core.admin.AdminAuthSupport adminAuth;

    /** Roles allowed for user-matching mutations — mirrors backend/app/api/routes/admin.py. */
    private static final java.util.Set<String> MANAGER_ROLES = java.util.Set.of("super_admin", "admin");

    /** Valid ML model ids — mirrors the valid_ids list in admin.py. */
    private static final java.util.Set<String> ML_MODEL_IDS = java.util.Set.of("xgb", "lstm", "iso", "gnn", "sensor");

    /**
     * In-memory ensemble weights (admin.py: _model_weights). Process-lifetime only,
     * exactly like the Python reference; production would move these to DB/Redis.
     */
    private static final Map<String, Double> MODEL_WEIGHTS = new ConcurrentHashMap<>(Map.of(
            "xgb", 0.30,
            "lstm", 0.25,
            "iso", 0.15,
            "gnn", 0.20,
            "sensor", 0.10));

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    public AdminController(UserRepository userRepository,
                          WalletRepository walletRepository,
                          FraudReportRepository fraudReportRepository,
                          PaymentTransactionRepository transactionRepository,
                          ActivityLogRepository activityLogRepository,
                          AdminRepository adminRepository,
                          com.upisafeguard.core.admin.AdminAuthSupport adminAuth) {
        this.userRepository = userRepository;
        this.walletRepository = walletRepository;
        this.fraudReportRepository = fraudReportRepository;
        this.transactionRepository = transactionRepository;
        this.activityLogRepository = activityLogRepository;
        this.adminRepository = adminRepository;
        this.adminAuth = adminAuth;
    }

    // Dashboard
    @GetMapping("/dashboard/overview")
    public ResponseEntity<AdminDashboardResponse> getDashboardOverview(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);
        long totalUsers = userRepository.count();
        long totalWallets = walletRepository.count();
        long totalTransactions = transactionRepository.count();
        long totalFraudReports = fraudReportRepository.count();

        return ResponseEntity.ok(new AdminDashboardResponse(
                totalUsers, totalWallets, totalTransactions, totalFraudReports
        ));
    }

    // Users
    @GetMapping("/users")
    public ResponseEntity<Page<User>> getUsers(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search) {

        adminAuth.requireAdmin(authHeader);
        Pageable pageable = PageRequest.of(page, pageSize);
        Page<User> users;
        
        if (search != null && !search.isEmpty()) {
            Page<User> allUsers = userRepository.findAll(PageRequest.of(page, pageSize));
            List<User> filtered = allUsers.getContent().stream()
                .filter(user -> 
                    (user.getFullName() != null && user.getFullName().toLowerCase().contains(search.toLowerCase())) ||
                    (user.getEmail() != null && user.getEmail().toLowerCase().contains(search.toLowerCase()))
                )
                .collect(Collectors.toList());
            users = new PageImpl<>(filtered, PageRequest.of(page, pageSize), allUsers.getTotalElements());
        } else {
            users = userRepository.findAll(PageRequest.of(page, pageSize));
        }
        
        return ResponseEntity.ok(users);
    }

    @GetMapping("/users/{userId}")
    public ResponseEntity<User> getUserDetails(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId) {
        adminAuth.requireAdmin(authHeader);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            return userOpt.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/users/{userId}/security-score")
    public ResponseEntity<Void> updateSecurityScore(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId, @RequestParam(name = "security_score") double securityScore) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            user.setSecurityScore(BigDecimal.valueOf(securityScore));
            userRepository.save(user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/users/{userId}/status")
    public ResponseEntity<Void> updateUserStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId, @RequestParam(name = "is_active") boolean isActive) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            user.setIsActive(isActive);
            userRepository.save(user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/users/{userId}/edit")
    public ResponseEntity<Void> editUser(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String userId, @RequestBody UserEditRequest request) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        try {
            UUID uuid = UUID.fromString(userId);
            Optional<User> userOpt = userRepository.findById(uuid);
            if (userOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            User user = userOpt.get();
            
            if (request.getFullName() != null) user.setFullName(request.getFullName());
            if (request.getEmail() != null) user.setEmail(request.getEmail());
            if (request.getDigitalLiteracy() != null) user.setDigitalLiteracy(User.DigitalLiteracy.valueOf(request.getDigitalLiteracy().toUpperCase()));
            if (request.getDailyLimit() != null) user.setDailyLimit(BigDecimal.valueOf(request.getDailyLimit()));
            if (request.getPerTransactionLimit() != null) user.setPerTransactionLimit(BigDecimal.valueOf(request.getPerTransactionLimit()));
            if (request.getGuardianThreshold() != null) user.setGuardianThreshold(BigDecimal.valueOf(request.getGuardianThreshold()));
            
            userRepository.save(user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // Fraud Reports
    @GetMapping("/fraud-reports")
    public ResponseEntity<Page<FraudReport>> getFraudReports(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status) {

        Pageable pageable = PageRequest.of(page, pageSize);
        Page<FraudReport> reports;
        
        if (status != null && !status.isEmpty()) {
            reports = fraudReportRepository.findByStatus(status, PageRequest.of(page, pageSize));
        } else {
            reports = fraudReportRepository.findAll(PageRequest.of(page, pageSize));
        }
        
        return ResponseEntity.ok(reports);
    }

    @PutMapping("/fraud-reports/{reportId}/status")
    public ResponseEntity<Void> updateReportStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String reportId, @RequestParam String status) {
        adminAuth.requireAdmin(authHeader);
        try {
            UUID uuid = UUID.fromString(reportId);
            Optional<FraudReport> reportOpt = fraudReportRepository.findById(uuid);
            if (reportOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            FraudReport report = reportOpt.get();
            report.setStatus(status);
            fraudReportRepository.save(report);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // Transactions
    @GetMapping("/transactions/flagged")
    public ResponseEntity<Page<PaymentTransaction>> getFlaggedTransactions(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize) {

        adminAuth.requireAdmin(authHeader);
        Pageable pageable = PageRequest.of(page, pageSize);
        Page<PaymentTransaction> transactions = transactionRepository.findByStatusIn(
                List.of(com.upisafeguard.core.payment.PaymentStatus.BLOCKED,
                        com.upisafeguard.core.payment.PaymentStatus.REJECTED,
                        com.upisafeguard.core.payment.PaymentStatus.GUARDIAN_PENDING), pageable);
        return ResponseEntity.ok(transactions);
    }

    // ============ Analytics (admin.py: get_risk_distribution / get_fraud_type_analytics) ============

    @GetMapping("/analytics/risk-distribution")
    public ResponseEntity<Map<String, Object>> getRiskDistribution(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(name = "days", defaultValue = "7") int days) {
        adminAuth.requireAdmin(authHeader);
        Instant start = Instant.now().minus(Duration.ofDays(days));

        Map<String, Object> distribution = new LinkedHashMap<>();
        distribution.put("low", transactionRepository.countByRiskLevelAndCreatedAtGreaterThanEqual("LOW", start));
        distribution.put("medium", transactionRepository.countByRiskLevelAndCreatedAtGreaterThanEqual("MEDIUM", start));
        distribution.put("high", transactionRepository.countByRiskLevelAndCreatedAtGreaterThanEqual("HIGH", start));
        distribution.put("critical", transactionRepository.countByRiskLevelAndCreatedAtGreaterThanEqual("CRITICAL", start));

        // Synthetic trend series, exactly like the Python reference (real aggregation is a roadmap item).
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = days - 1; i >= 0; i--) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", today.minusDays(i).toString());
            point.put("low", 100);
            point.put("medium", 20);
            point.put("high", 5);
            point.put("critical", 1);
            trend.add(point);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("period_days", days);
        body.put("distribution", distribution);
        body.put("trend", trend);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/analytics/fraud-types")
    public ResponseEntity<Map<String, Object>> getFraudTypeAnalytics(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);

        List<Map<String, Object>> fraudTypes = new ArrayList<>();
        long totalReports = 0;
        double totalAmountLost = 0;
        for (FraudReportRepository.FraudTypeCount row : fraudReportRepository.aggregateByScamType()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("type", row.getScamType());
            entry.put("count", row.getReportCount());
            entry.put("total_amount", row.getTotalAmount() == null ? 0 : row.getTotalAmount().doubleValue());
            fraudTypes.add(entry);
            totalReports += row.getReportCount();
            totalAmountLost += row.getTotalAmount() == null ? 0 : row.getTotalAmount().doubleValue();
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fraud_types", fraudTypes);
        body.put("total_reports", totalReports);
        body.put("total_amount_lost", totalAmountLost);
        return ResponseEntity.ok(body);
    }

    // ============ ML Performance (admin.py: get_ml_performance) ============
    //
    // The trained .joblib artifacts live with the Python backend / ai-service, so the Spring
    // port always renders the artifact-less fallback — byte-identical to the Python response
    // when no trained models exist on disk.

    @GetMapping("/ml/performance")
    public ResponseEntity<Map<String, Object>> getMlPerformance(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);

        Map<String, Object> xgboost = new LinkedHashMap<>();
        xgboost.put("name", "XGBoost Risk Scorer");
        xgboost.put("version", "1.0-heuristic");
        xgboost.put("accuracy", 94.2);
        xgboost.put("roc_auc", null);
        xgboost.put("pr_auc", null);
        xgboost.put("is_trained", false);
        xgboost.put("inference_latency_ms", 45);

        Map<String, Object> lstm = new LinkedHashMap<>();
        lstm.put("name", "Behavioral Profiler (GBT)");
        lstm.put("version", "1.0-heuristic");
        lstm.put("accuracy", 89.5);
        lstm.put("roc_auc", null);
        lstm.put("pr_auc", null);
        lstm.put("is_trained", false);
        lstm.put("inference_latency_ms", 35);

        Map<String, Object> isolationForest = new LinkedHashMap<>();
        isolationForest.put("name", "Isolation Forest Anomaly");
        isolationForest.put("version", "1.0-heuristic");
        isolationForest.put("is_fitted", false);
        isolationForest.put("inference_latency_ms", 25);

        Map<String, Object> gnn = new LinkedHashMap<>();
        gnn.put("name", "Graph Neural Network");
        gnn.put("version", "1.0-heuristic");
        gnn.put("has_graph", false);
        gnn.put("fraud_nodes", 0);
        gnn.put("nodes", 0);
        gnn.put("edges", 0);
        gnn.put("inference_latency_ms", 80);

        Map<String, Object> sensor = new LinkedHashMap<>();
        sensor.put("name", "Sensor Stress Detector");
        sensor.put("version", "1.0-rule-based");
        sensor.put("description", "Rule-based gyroscope/accelerometer analysis");
        sensor.put("inference_latency_ms", 10);

        Map<String, Object> models = new LinkedHashMap<>();
        models.put("xgboost", xgboost);
        models.put("lstm", lstm);
        models.put("isolation_forest", isolationForest);
        models.put("gnn", gnn);
        models.put("sensor", sensor);

        Map<String, Object> ensemble = new LinkedHashMap<>();
        ensemble.put("total_latency_ms", 195);
        ensemble.put("models_trained", 0);
        ensemble.put("models_total", 5);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("models", models);
        body.put("ensemble", ensemble);
        return ResponseEntity.ok(body);
    }

    // ============ System Health (admin.py: get_system_health) ============

    @GetMapping("/system/health")
    public ResponseEntity<Map<String, Object>> getSystemHealth(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);

        String dbStatus = "healthy";
        try {
            userRepository.count();
        } catch (Exception e) {
            dbStatus = "degraded";
        }

        // No .joblib artifacts on the Spring side (inference lives in the ai-service) —
        // mirrors the Python health check with zero models present.
        int modelsLoaded = 0;

        java.lang.management.OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
        double cpuPercent = 0;
        double memoryPercent = 0;
        double diskPercent = 0;
        try {
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
                double load = sunBean.getProcessCpuLoad();
                cpuPercent = load < 0 ? 0 : load * 100;
                long totalMem = sunBean.getTotalMemorySize();
                long freeMem = sunBean.getFreeMemorySize();
                memoryPercent = totalMem <= 0 ? 0 : (1.0 - (double) freeMem / totalMem) * 100;
            }
            File root = new File(System.getProperty("user.dir")).getAbsoluteFile();
            while (root.getParent() != null) {
                root = root.getParentFile();
            }
            long totalSpace = root.getTotalSpace();
            long usableSpace = root.getUsableSpace();
            diskPercent = totalSpace <= 0 ? 0 : (double) (totalSpace - usableSpace) / totalSpace * 100;
        } catch (Exception e) {
            // Fall through with zeros, like the Python `except Exception` metrics branch.
            cpuPercent = 0;
            memoryPercent = 0;
            diskPercent = 0;
        }

        String nowIso = Instant.now().toString();
        String lastRestart = java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

        List<Map<String, Object>> metrics = new ArrayList<>();
        metrics.add(metric("CPU Usage", round1(cpuPercent), "%", cpuPercent < 80 ? "healthy" : cpuPercent < 95 ? "warning" : "critical", 0));
        metrics.add(metric("Memory Usage", round1(memoryPercent), "%", memoryPercent < 80 ? "healthy" : memoryPercent < 95 ? "warning" : "critical", 0));
        metrics.add(metric("Disk Usage", round1(diskPercent), "%", diskPercent < 80 ? "healthy" : diskPercent < 95 ? "warning" : "critical", 0));
        metrics.add(metric("API Latency", 45, "ms", "healthy", -3));
        metrics.add(metric("ML Models", modelsLoaded, "/4", modelsLoaded >= 3 ? "healthy" : "warning", 0));
        metrics.add(metric("Error Rate", 0.02, "%", "healthy", 0));

        Map<String, Object> fastApiService = new LinkedHashMap<>();
        fastApiService.put("name", "FastAPI Backend");
        fastApiService.put("status", "running");
        fastApiService.put("uptime", "active");
        fastApiService.put("memory", "N/A");
        fastApiService.put("lastRestart", lastRestart);

        Map<String, Object> databaseService = new LinkedHashMap<>();
        databaseService.put("name", "SQLite Database");
        databaseService.put("status", "healthy".equals(dbStatus) ? "running" : "error");
        databaseService.put("uptime", "active");
        databaseService.put("memory", "N/A");
        databaseService.put("lastRestart", "N/A");

        Map<String, Object> mlService = new LinkedHashMap<>();
        mlService.put("name", "ML Inference Service");
        mlService.put("status", modelsLoaded >= 1 ? "running" : "stopped");
        mlService.put("uptime", "active");
        mlService.put("memory", "N/A");
        mlService.put("lastRestart", "N/A");

        List<Map<String, Object>> services = List.of(fastApiService, databaseService, mlService);

        List<Map<String, Object>> logs = List.of(
                healthLog("1", "API", "System health check completed", nowIso),
                healthLog("2", "ML Service", modelsLoaded + "/4 models loaded successfully", nowIso),
                healthLog("3", "Database", "Database status: " + dbStatus, nowIso));

        Map<String, Object> components = new LinkedHashMap<>();
        components.put("api", Map.of("status", "healthy"));
        components.put("database", Map.of("status", dbStatus));
        components.put("ml_models", Map.of("status", modelsLoaded >= 3 ? "healthy" : "degraded", "loaded", modelsLoaded, "total", 4));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "healthy".equals(dbStatus) ? "healthy" : "degraded");
        body.put("metrics", metrics);
        body.put("services", services);
        body.put("logs", logs);
        body.put("components", components);
        body.put("last_check", nowIso);
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> metric(String name, double value, String unit, String status, int trend) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("value", value);
        m.put("unit", unit);
        m.put("status", status);
        m.put("trend", trend);
        return m;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private Map<String, Object> healthLog(String id, String service, String message, String timestamp) {
        Map<String, Object> log = new LinkedHashMap<>();
        log.put("id", id);
        log.put("timestamp", timestamp);
        log.put("level", "info");
        log.put("service", service);
        log.put("message", message);
        return log;
    }

    // ============ ML Models (admin.py: list_ml_models / retrain / status / config) ============

    @GetMapping("/ml/models")
    public ResponseEntity<Map<String, Object>> listMlModels(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);

        // Model catalogue mirrors admin.py model_configs; no .joblib artifacts on the
        // Spring side, so every model renders its untrained fallback metrics.
        String[][] configs = {
                {"xgb", "XGBoost Risk Scorer", "Gradient Boosting", "Ensemble tree model for robust risk scoring", "94.2"},
                {"lstm", "Behavioral Profiler (GBT)", "Gradient Boosted Trees", "Captures behavioral patterns in user transactions", "89.5"},
                {"iso", "Isolation Forest Anomaly", "Anomaly Detection", "Unsupervised model for anomaly isolation", "87.3"},
                {"gnn", "Graph Neural Network", "Deep Learning", "Analyzes transaction networks using graph convolutions", "92.0"},
                {"sensor", "Sensor Stress Detector", "Rule-Based", "Analyzes device sensor data for coercion detection", "82.5"},
        };

        List<Map<String, Object>> models = new ArrayList<>();
        for (String[] cfg : configs) {
            String id = cfg[0];
            double accuracy = Double.parseDouble(cfg[4]);
            double precision = accuracy - 1.4;
            double recall = accuracy - 2.7;
            double f1 = (precision + recall) / 2;
            int latency = switch (id) {
                case "xgb" -> 12;
                case "lstm" -> 35;
                case "iso" -> 8;
                case "gnn" -> 45;
                case "sensor" -> 22;
                default -> 20;
            };

            Map<String, Object> model = new LinkedHashMap<>();
            model.put("id", id);
            model.put("name", cfg[1]);
            model.put("type", cfg[2]);
            model.put("description", cfg[3]);
            model.put("status", "active");
            model.put("accuracy", round1(accuracy));
            model.put("precision", round1(precision));
            model.put("recall", round1(recall));
            model.put("f1_score", round1(f1));
            model.put("latency_ms", latency);
            model.put("predictions_today", 0);
            model.put("last_trained", Instant.now().toString());
            model.put("version", "1.0-heuristic");
            model.put("trend", "stable");
            models.add(model);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("models", models);
        return ResponseEntity.ok(body);
    }

    @PostMapping("/ml/models/{modelId}/retrain")
    public ResponseEntity<Map<String, Object>> retrainModel(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String modelId) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        if (!ML_MODEL_IDS.contains(modelId)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.NOT_FOUND,
                    "Model '" + modelId + "' not found");
        }
        if ("sensor".equals(modelId)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("message", "Sensor model is rule-based and does not require retraining");
            body.put("model_id", modelId);
            body.put("status", "skipped");
            return ResponseEntity.ok(body);
        }
        // No train_models.py on the Spring side — same "queued" branch as the Python
        // reference when the training script is absent.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Retraining started for model '" + modelId + "'");
        body.put("model_id", modelId);
        body.put("status", "queued");
        body.put("estimated_time_minutes", 15);
        return ResponseEntity.ok(body);
    }

    @PutMapping("/ml/models/{modelId}/status")
    public ResponseEntity<Map<String, Object>> updateModelStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String modelId,
            @RequestParam(name = "status") String status) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        if (!"active".equals(status) && !"inactive".equals(status)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Input should be 'active' or 'inactive'");
        }
        if (!ML_MODEL_IDS.contains(modelId)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.NOT_FOUND,
                    "Model '" + modelId + "' not found");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Model '" + modelId + "' set to " + status);
        body.put("model_id", modelId);
        body.put("status", status);
        return ResponseEntity.ok(body);
    }

    @PutMapping("/ml/models/{modelId}/config")
    public ResponseEntity<Map<String, Object>> updateModelConfig(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String modelId,
            @RequestParam(name = "weight") Double weight) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        if (!ML_MODEL_IDS.contains(modelId)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.NOT_FOUND,
                    "Model '" + modelId + "' not found");
        }
        if (weight == null || weight < 0) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Input should be greater than or equal to 0");
        }
        if (weight > 1) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Input should be less than or equal to 1");
        }
        double oldWeight = MODEL_WEIGHTS.getOrDefault(modelId, 0.2);
        MODEL_WEIGHTS.put(modelId, weight);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Model '" + modelId + "' weight updated from " + oldWeight + " to " + weight);
        body.put("model_id", modelId);
        body.put("old_weight", oldWeight);
        body.put("new_weight", weight);
        body.put("all_weights", new LinkedHashMap<>(MODEL_WEIGHTS));
        return ResponseEntity.ok(body);
    }

    @GetMapping("/ml/models/config")
    public ResponseEntity<Map<String, Object>> getModelConfig(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireAdmin(authHeader);
        return ResponseEntity.ok(Map.of("weights", MODEL_WEIGHTS));
    }

    // ============ Activity Logs (admin.py: get_activity_logs) ============

    @GetMapping("/activity-logs")
    public ResponseEntity<Map<String, Object>> getActivityLogs(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(name = "page", defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "50") int pageSize,
            @RequestParam(name = "action", required = false) String action) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        int safePage = Math.max(page, 1);
        int safePageSize = Math.min(Math.max(pageSize, 1), 100);
        Pageable pageable = PageRequest.of(safePage - 1, safePageSize);

        Page<ActivityLog> logs = (action == null || action.isEmpty())
                ? activityLogRepository.findAllByOrderByCreatedAtDesc(pageable)
                : activityLogRepository.findByAction(action, pageable);

        // Resolve admin emails for the page, exactly like the Python lookup.
        Set<UUID> adminIds = new java.util.HashSet<>();
        for (ActivityLog log : logs.getContent()) {
            if (log.getAdminId() != null) {
                adminIds.add(log.getAdminId());
            }
        }
        Map<String, String> adminEmails = new LinkedHashMap<>();
        if (!adminIds.isEmpty()) {
            for (Admin admin : adminRepository.findAllById(adminIds)) {
                adminEmails.put(admin.getId().toString(), admin.getEmail());
            }
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (ActivityLog log : logs.getContent()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", log.getId().toString());
            item.put("admin_id", log.getAdminId() == null ? null : log.getAdminId().toString());
            item.put("admin_email", log.getAdminId() == null
                    ? "system" : adminEmails.getOrDefault(log.getAdminId().toString(), "system"));
            item.put("user_id", log.getUserId() == null ? null : log.getUserId().toString());
            item.put("action", log.getAction());
            item.put("entity_type", log.getEntityType());
            item.put("entity_id", log.getEntityId() == null ? null : log.getEntityId().toString());
            item.put("details", log.getDetails() == null ? "" : log.getDetails());
            item.put("ip_address", log.getIpAddress());
            item.put("timestamp", log.getCreatedAt() == null ? null : log.getCreatedAt().toString());
            item.put("created_at", log.getCreatedAt() == null ? null : log.getCreatedAt().toString());
            items.add(item);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("logs", items);
        body.put("total", logs.getTotalElements());
        body.put("page", safePage);
        body.put("page_size", safePageSize);
        return ResponseEntity.ok(body);
    }

    // ============ Admin Management (admin.py: list_admins, super admin only) ============

    @GetMapping("/admins")
    public ResponseEntity<Map<String, Object>> listAdmins(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        adminAuth.requireRole(authHeader, java.util.Set.of("super_admin"));
        List<Map<String, Object>> admins = new ArrayList<>();
        for (Admin admin : adminRepository.findAllByOrderByCreatedAtDesc()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", admin.getId().toString());
            item.put("email", admin.getEmail());
            item.put("username", admin.getUsername());
            item.put("full_name", admin.getFullName());
            item.put("role", admin.getRole());
            item.put("is_active", admin.getIsActive());
            item.put("last_login", admin.getLastLogin() == null ? null : admin.getLastLogin().toString());
            item.put("created_at", admin.getCreatedAt() == null ? null : admin.getCreatedAt().toString());
            admins.add(item);
        }
        return ResponseEntity.ok(Map.of("admins", admins));
    }

    // ============ Export Endpoints (admin.py: export_users / export_fraud_reports) ============

    @GetMapping("/users/export")
    public ResponseEntity<byte[]> exportUsers(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(name = "format", defaultValue = "csv") String format) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        if (!"csv".equals(format) && !"json".equals(format)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Input should be 'csv' or 'json'");
        }

        List<LinkedHashMap<String, Object>> rows = new ArrayList<>();
        for (User user : userRepository.findAllByOrderByCreatedAtDesc()) {
            LinkedHashMap<String, Object> row = new LinkedHashMap<>();
            row.put("id", user.getId().toString());
            row.put("phone_number", user.getPhoneNumber());
            row.put("full_name", user.getFullName());
            row.put("email", user.getEmail() == null ? "" : user.getEmail());
            row.put("upi_id", user.getUpiId() == null ? "" : user.getUpiId());
            row.put("security_score", user.getSecurityScore());
            row.put("digital_literacy", user.getDigitalLiteracy() == null
                    ? "intermediate" : user.getDigitalLiteracy().name().toLowerCase());
            row.put("guardian_enabled", user.getGuardianEnabled());
            row.put("is_active", user.getIsActive() == null ? Boolean.TRUE : user.getIsActive());
            row.put("created_at", user.getCreatedAt() == null ? null : user.getCreatedAt().toString());
            rows.add(row);
        }
        return exportResponse(rows, "users_export", format);
    }

    @GetMapping("/fraud-reports/export")
    public ResponseEntity<byte[]> exportFraudReports(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(name = "format", defaultValue = "csv") String format,
            @RequestParam(name = "status", required = false) String status) {
        adminAuth.requireRole(authHeader, MANAGER_ROLES);
        if (!"csv".equals(format) && !"json".equals(format)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Input should be 'csv' or 'json'");
        }

        List<FraudReport> reports = fraudReportRepository.findAllByOrderByCreatedAtDesc();
        List<LinkedHashMap<String, Object>> rows = new ArrayList<>();
        for (FraudReport report : reports) {
            if (status != null && !status.isEmpty() && !status.equals(report.getStatus())) {
                continue;
            }
            LinkedHashMap<String, Object> row = new LinkedHashMap<>();
            row.put("id", report.getId().toString());
            row.put("scammer_upi", report.getScammerUpi());
            row.put("scam_type", report.getScamType());
            row.put("amount_lost", report.getAmountLost() == null ? 0 : report.getAmountLost().doubleValue());
            row.put("description", report.getDescription() == null ? "" : report.getDescription());
            row.put("status", report.getStatus());
            row.put("verification_score", report.getVerificationScore() == null ? 0.0 : report.getVerificationScore());
            row.put("created_at", report.getCreatedAt() == null ? null : report.getCreatedAt().toString());
            rows.add(row);
        }
        return exportResponse(rows, "fraud_reports_export", format);
    }

    /**
     * Render export rows as CSV (\r\n lines, QUOTE_MINIMAL like Python's csv module) or
     * pretty-printed JSON, with the same attachment headers as the FastAPI StreamingResponse.
     */
    private ResponseEntity<byte[]> exportResponse(List<LinkedHashMap<String, Object>> rows,
                                                  String baseName, String format) {
        String content;
        MediaType mediaType;
        if ("json".equals(format)) {
            try {
                content = JSON.writerWithDefaultPrettyPrinter().writeValueAsString(rows);
            } catch (Exception e) {
                throw new ApiRequestException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                        "Export serialization failed");
            }
            mediaType = MediaType.APPLICATION_JSON;
        } else {
            StringBuilder sb = new StringBuilder();
            if (!rows.isEmpty()) {
                sb.append(String.join(",", rows.get(0).keySet())).append("\r\n");
                for (LinkedHashMap<String, Object> row : rows) {
                    List<String> cells = new ArrayList<>();
                    for (Object value : row.values()) {
                        cells.add(csvCell(value));
                    }
                    sb.append(String.join(",", cells)).append("\r\n");
                }
            }
            content = sb.toString();
            mediaType = MediaType.parseMediaType("text/csv");
        }
        String filename = baseName + "." + format;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(mediaType)
                .body(content.getBytes(StandardCharsets.UTF_8));
    }

    /** Python csv.QUOTE_MINIMAL equivalent: quote only when needed, double the inner quotes. */
    private static String csvCell(Object value) {
        String cell = value == null ? "" : String.valueOf(value);
        if (cell.contains(",") || cell.contains("\"") || cell.contains("\n") || cell.contains("\r")) {
            return '"' + cell.replace("\"", "\"\"") + '"';
        }
        return cell;
    }

    // ============ System Management (admin.py: get_system_logs / restart_service) ============

    @GetMapping("/system/logs")
    public ResponseEntity<Map<String, Object>> getSystemLogs(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestParam(name = "level", required = false) String level,
            @RequestParam(name = "service", required = false) String service,
            @RequestParam(name = "page", defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "50") int pageSize) {
        adminAuth.requireAdmin(authHeader);
        if (level != null && !level.isEmpty() && !List.of("info", "warning", "error").contains(level)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Input should be 'info', 'warning' or 'error'");
        }
        int safePage = Math.max(page, 1);
        int safePageSize = Math.min(Math.max(pageSize, 1), 200);
        Pageable pageable = PageRequest.of(safePage - 1, safePageSize);

        Page<ActivityLog> logs;
        if ("error".equals(level)) {
            logs = activityLogRepository.findByActionIn(List.of("login_failed", "error", "system_error"), pageable);
        } else if ("warning".equals(level)) {
            logs = activityLogRepository.findByActionIn(
                    List.of("update_user_status", "update_report_status", "retrain_model"), pageable);
        } else {
            logs = activityLogRepository.findAllByOrderByCreatedAtDesc(pageable);
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (ActivityLog log : logs.getContent()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", log.getId().toString());
            item.put("timestamp", log.getCreatedAt() == null ? null : log.getCreatedAt().toString());
            item.put("level", logLevelFor(log.getAction()));
            item.put("service", log.getEntityType() == null ? "API" : log.getEntityType());
            item.put("message", log.getAction() + ": " + (log.getDetails() == null ? "" : log.getDetails()));
            items.add(item);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("logs", items);
        body.put("total", logs.getTotalElements());
        body.put("page", safePage);
        body.put("page_size", safePageSize);
        return ResponseEntity.ok(body);
    }

    private static String logLevelFor(String action) {
        if ("login_failed".equals(action) || "error".equals(action)) {
            return "error";
        }
        if ("update_user_status".equals(action) || "update_report_status".equals(action)) {
            return "warning";
        }
        return "info";
    }

    @PostMapping("/system/services/{serviceName}/restart")
    public ResponseEntity<Map<String, Object>> restartService(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable String serviceName) {
        Admin admin = adminAuth.requireRole(authHeader, java.util.Set.of("super_admin"));
        if (!List.of("ml_inference", "fastapi_backend", "database").contains(serviceName)) {
            throw new ApiRequestException(org.springframework.http.HttpStatus.NOT_FOUND,
                    "Service '" + serviceName + "' not found");
        }

        if ("ml_inference".equals(serviceName)) {
            logServiceRestart(admin.getId(), serviceName, "restarted");
            return ResponseEntity.ok(Map.of(
                    "message", "Service '" + serviceName + "' restarted successfully",
                    "status", "running"));
        }
        if ("database".equals(serviceName)) {
            logServiceRestart(admin.getId(), serviceName, "reconnected");
            return ResponseEntity.ok(Map.of(
                    "message", "Database connections refreshed",
                    "status", "running"));
        }
        // fastapi_backend cannot be restarted via API (same fallthrough as the Python route).
        return ResponseEntity.ok(Map.of(
                "message", "Service '" + serviceName + "' cannot be restarted via API",
                "status", "running"));
    }

    /** Audit entry for restart_service; never allowed to break the request (mirrors log_activity). */
    private void logServiceRestart(UUID adminId, String service, String status) {
        try {
            ActivityLog entry = new ActivityLog();
            entry.setAdminId(adminId);
            entry.setAction("restart_service");
            entry.setEntityType("service");
            entry.setDetails("{\"service\": \"" + service + "\", \"status\": \"" + status + "\"}");
            activityLogRepository.save(entry);
        } catch (Exception ignored) {
            // audit trail must never break the auth flow
        }
    }

    // DTOs
    public static class AdminDashboardResponse {
        private long totalUsers;
        private long totalWallets;
        private long totalTransactions;
        private long totalFraudReports;

        public AdminDashboardResponse(long totalUsers, long totalWallets, long totalTransactions, long totalFraudReports) {
            this.totalUsers = totalUsers;
            this.totalWallets = totalWallets;
            this.totalTransactions = totalTransactions;
            this.totalFraudReports = totalFraudReports;
        }

        public long getTotalUsers() { return totalUsers; }
        public long getTotalWallets() { return totalWallets; }
        public long getTotalTransactions() { return totalTransactions; }
        public long getTotalFraudReports() { return totalFraudReports; }
    }

    public static class UserEditRequest {
        private String fullName;
        private String email;
        private String digitalLiteracy;
        private Double dailyLimit;
        private Double perTransactionLimit;
        private Double guardianThreshold;

        public String getFullName() { return fullName; }
        public void setFullName(String fullName) { this.fullName = fullName; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getDigitalLiteracy() { return digitalLiteracy; }
        public void setDigitalLiteracy(String digitalLiteracy) { this.digitalLiteracy = digitalLiteracy; }
        public Double getDailyLimit() { return dailyLimit; }
        public void setDailyLimit(Double dailyLimit) { this.dailyLimit = dailyLimit; }
        public Double getPerTransactionLimit() { return perTransactionLimit; }
        public void setPerTransactionLimit(Double perTransactionLimit) { this.perTransactionLimit = perTransactionLimit; }
        public Double getGuardianThreshold() { return guardianThreshold; }
        public void setGuardianThreshold(Double guardianThreshold) { this.guardianThreshold = guardianThreshold; }
    }
}