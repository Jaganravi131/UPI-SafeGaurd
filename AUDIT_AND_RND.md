# UPI SafeGuard – Full Project Audit & R&D Report

**Audit perspective:** Senior Developer, AI Engineer, Senior Architect  
**Date:** 2025  
**Scope:** Business logic, technical correctness, mock vs real integration, and path to real-time production.

> **⚠️ Post-Audit Update:** Since this audit was written, all 4 ML models (XGBoost, LightGBM Behavioral, Isolation Forest, GNN Graph) have been **trained on the PaySim dataset** using `backend/train_models.py`. Trained `.joblib` artifacts now exist in `backend/app/ml/trained_models/` and are loaded at startup. The model classes auto-detect trained artifacts and use real predictions instead of heuristic fallbacks. References to "not trained" or "heuristic-only" below reflect the state at audit time.

---

## Executive Summary

UPI SafeGuard is a fraud-prevention demo with a clear split: **real** rule-based and heuristic logic vs **mock/simulated** ML, integrations, and UI. The architecture is sound for a hackathon, but several business and technical gaps prevent it from being production-ready or truly “real-time” without targeted R&D and integration work.

---

# PART 1: BUSINESS LOGIC ERRORS

## 1.1 Dual Risk Pipelines (Inconsistent UX & Logic)

- **Issue:** Two separate risk flows exist and are not unified.
  - **Flow A:** `POST /fraud/analyze` – rule-based + NLP scam keywords (`FraudDetectionService`). Used by **PaymentFlow** for “Check Safety.”
  - **Flow B:** `POST /transactions/assess-risk` – full ML ensemble (XGBoost, LSTM, GNN, Isolation Forest, Sensor). Used by transaction creation and admin/test.
- **Impact:** Users in the main payment UI see risk from **Flow A** only. The advertised “5 ML models” are not used for the primary payment safety check; they run only when creating a transaction or when hitting the test endpoint.
- **Fix:** Unify on one pipeline: either route PaymentFlow to `assess-risk` and drop duplicate logic, or make `fraud/analyze` call the same ML pipeline and return unified scores/explanations.

## 1.2 Scammer List Never Loaded from Excel

- **Location:** `FraudDetectionService` keeps an in-memory `scammer_list` and has `load_scammer_list(upi_ids)` but **no caller ever loads from `known_scammers.xlsx`**.
- **Location:** `ExcelDatabase` has `check_scammer(upi_id)` and `get_all_scammers()`; fraud route checks `UPIProfile.report_count` in SQL and adds to the service’s list only when `report_count > 2`. Excel scammers are **never** imported at startup or on schedule.
- **Impact:** All seeded scammer UPI IDs in `known_scammers.xlsx` are ignored by the rule-based analyzer. Only DB-reported UPI IDs (and only after >2 reports) affect the in-memory list.
- **Fix:** On startup (and optionally on a schedule), call `ExcelDatabase.get_all_scammers()` and `fraud_service.load_scammer_list([row['upi_id'] for row in scammers])`. Optionally merge with DB-reported scammers.

## 1.3 Wallet Data Split (Excel vs JSON)

- **Issue:** Two wallet representations:
  - **Excel:** `backend/app/data/demo_wallets.xlsx` – used by `ExcelDatabase.get_wallet()` / `update_wallet_balance()` (phone-keyed).
  - **JSON:** `backend/sandbox_data/wallets.json` – used by `sandbox_bank.py` (user_id-keyed).
- **Impact:** Balance and history can diverge. Payment flow and wallet UI may show different balances depending on which API (wallet vs transaction) is used. No single source of truth.
- **Fix:** Pick one store (e.g. sandbox JSON or SQLite) for demo and route both wallet and transaction flows through it. Deprecate the other or sync explicitly.

## 1.4 Transaction Create vs Wallet Transfer Not Wired

- **Issue:** `POST /transactions/create` writes to SQLite (and optionally updates GNN); it does **not** debit the sandbox wallet. `POST /wallet/transfer/{user_id}` debits JSON wallet and does **not** write to the main `transactions` table or run the full ML flow.
- **Impact:** “Payment” can be recorded in one system without balance change, or balance can change without a canonical transaction record. Reconciliation and audit trail are broken.
- **Fix:** Single payment flow: e.g. assess-risk → (optional) intervention → on confirm: create transaction record **and** call sandbox transfer (or vice versa), with idempotency by `transaction_id`.

## 1.5 Intervention Not Triggered from Main Payment Flow

- **Issue:** `POST /transactions/assess-risk` does not call `POST /intervention/check`. The intervention WebSocket is only useful if the client explicitly calls `/intervention/check` after getting risk. PaymentFlow uses `fraud/analyze` and does not call intervention at all.
- **Impact:** “Real-time AI intervention” never runs in the primary payment journey. Stats and WebSocket are effectively dead for the main flow.
- **Fix:** After `assess-risk`, if risk is above threshold, backend calls intervention service and pushes via WebSocket; or frontend calls `/intervention/check` with the same `transaction_id` and risk result and then shows the modal. Document one canonical flow and implement it end-to-end.

## 1.6 Pagination / History API Mismatch

- **Issue:** Frontend `transactionAPI.getHistory(skip, limit)` calls `GET /transactions/` with `skip` and `limit`. Backend exposes `GET /transactions/history` with `page` and `page_size`.
- **Impact:** Transaction history from the main DB may 404 or use a wrong route; frontend may be calling a non-existent endpoint.
- **Fix:** Align contract: either backend adds `GET /transactions/` supporting `skip`/`limit` or frontend uses `GET /transactions/history?page=&page_size=`.

## 1.7 Transaction Create Endpoint Path Mismatch

- **Issue:** Frontend: `api.post('/transactions/', data)`. Backend: `@router.post("/create", ...)` → `POST /transactions/create`.
- **Impact:** Create transaction from UI may 404 or hit a different handler if one exists for `POST /transactions/`.
- **Fix:** Use same path on both sides, e.g. frontend `api.post('/transactions/create', data)` or backend add `@router.post("/")` that delegates to create.

---

# PART 2: TECHNICAL ERRORS & CRITICAL ISSUES

## 2.1 Database

- **PostgreSQL check:** `_check_postgres_available()` only does `socket.getaddrinfo(host, 5432)`. It does not open a TCP connection or authenticate; unreachable or wrong credentials still lead to fallback after failed `create_all`.
- **SQLite + GUID:** Models use `GUID()` type; SQLite stores UUIDs as CHAR(36). Any code that compares `user_id` (e.g. `Transaction.user_id == user_id`) must ensure string vs UUID consistency (e.g. `user_id` from JWT may be string, DB may store string).
- **Transaction.user_id NULL in demo:** `create_transaction` sets `user_id=user_id if user_id != "demo-user" else None`. So `Transaction.user_id` can be NULL; ensure all queries and FKs allow NULL or use a sentinel demo user ID.

## 2.2 MongoDB

- **Init:** `init_mongodb()` creates indexes on `behavioral_logs`, `fraud_reports`, `ml_features`. If MongoDB is down, the app still prints “MongoDB connection failed” but continues; that’s fine. If URL is wrong, connection can hang; consider a short timeout.
- **ML logging:** `RiskAssessmentService._log_ml_features` passes `features={}`. So ML feature vectors are never persisted; only model scores and explanations are. For R&D and model retraining, this limits usefulness.

## 2.3 Redis

- **No fallback when Redis is missing:** `init_redis()` uses `redis.from_url(settings.REDIS_URL)`. If Redis is not running, this can raise and be caught in lifespan, but any code that calls `get_redis()` and uses it (e.g. rate limit, session) will get `None` or fail if not checked. Code paths using Redis should handle “Redis unavailable” explicitly.

## 2.4 Auth

- **Transaction routes:** `user_id: str = None` with comment “Would come from JWT”. No dependency that extracts user from JWT; `user_id` is never set by auth. So every request uses `user_id or "demo-user"`. All transactions are attributed to demo or to whatever the client sends if it were passed.
- **Wallet routes:** No auth; `user_id` is path parameter. Any client can query or transfer for any `user_id`.

## 2.5 Security

- **JWT secret:** Default in config: `JWT_SECRET_KEY: str = "jwt-secret-key-change-in-production"`. Must be overridden in production.
- **Global exception handler:** Returns `traceback` and full exception to client in debug; ensure `DEBUG` is off in production and never expose stack traces to clients.
- **CORS:** Configured for localhost; add explicit production origins and avoid wildcard in production.

## 2.6 ML / Model Code

- **XGBoost:** Model is not trained (`is_trained = False`); `_heuristic_scoring()` is used. No trained artifact is loaded; README “accuracy 96.5%” refers to intended design, not current behavior.
- **LSTM:** No Keras/Torch model; class is a heuristic “behavioral profiler” (amount/time/recipient/velocity rules). Name suggests LSTM but implementation is rule-based.
- **GNN:** No PyTorch Geometric; it’s a graph (dict/set) with BFS/PageRank. No neural network. Fine for demo; naming is misleading.
- **Isolation Forest:** Uses sklearn and is fitted on **synthetic data** in `_fit_scaler_with_synthetic_data()`. Not fitted on real transaction data; outlier scores are not calibrated to real fraud.
- **Sensor detector:** Rule-based on thresholds; no trained model. Sensible for demo.
- **Risk aggregator:** Weights and aggregation logic are real; inputs are mix of heuristics and synthetic-backed models.

## 2.7 Intervention Stats Hardcoded

- **Location:** `intervention.py` `get_intervention_stats()` returns fixed numbers: `"total_interventions": 127`, `"amount_saved": 425000`, etc.
- **Impact:** Admin dashboard shows fake stats; no real metrics for interventions.

---

# PART 3: MOCK / NON-REAL FEATURES

## 3.1 “5 ML Models” in PaymentFlow UI

- **Behavior:** PaymentFlow “ML analysis” step runs a **local simulation**: `setTimeout` with `Math.random()` to fake per-model scores and a fake “running” animation. It then also calls `fraudAPI.analyzeTransaction()` and uses that result for final risk and safety message.
- **Reality:** The animated “5 models” are not the backend ensemble; the only real backend call is `fraud/analyze` (rule-based + NLP). So the main payment screen is mostly mock visualization plus one real rule-based result.
- **To make real:** Call `transactionAPI.assessRisk()` (or a single unified risk API) and use the returned per-model scores (xgboost_score, lstm_score, etc.) to drive the same UI. Remove client-side random scoring.

## 3.2 Voice Alerts “12 Indian Languages”

- **Behavior:** `ExplanationGenerator.generate_voice_alert()` returns **text** only. No TTS (Web Speech API or server-side synthesis) is wired. README claims “Voice Alerts in 12 Indian languages.”
- **Reality:** Text templates exist; no actual speech. Feature is mock.
- **To make real:** Use browser `SpeechSynthesis` with appropriate `lang` (e.g. `hi-IN`, `ta-IN`) or integrate a TTS API and play audio in the app.

## 3.3 OTP / SMS

- **Behavior:** Config has Twilio placeholders; OTP is shown on screen or fixed for demo. No real SMS sending.
- **Reality:** Documented as hackathon simplification; acceptable for demo.
- **To make real:** Integrate Twilio (or equivalent), enforce rate limit and expiry, and never log OTP in production.

## 3.4 Guardian Notifications

- **Behavior:** `NotificationService.send_guardian_request()` creates an in-memory notification. No push, email, or SMS to the guardian.
- **Reality:** Guardian “notification” exists only in the in-memory store; guardian has no way to see it unless they share the same app and user context.
- **To make real:** Send push (FCM), SMS, or email to guardian’s phone/email with link or in-app action to approve/reject.

## 3.5 Firebase

- **Behavior:** Optional Firebase auth and config placeholders exist. If not configured, auth falls back to phone + OTP (or demo).
- **Reality:** Firebase is optional and not required for current demo flow.
- **To make real:** Configure Firebase, use `verifyFirebaseToken` for authenticated users, and map Firebase UID to internal user id in DB.

## 3.6 Sandbox Bank vs Real Banking

- **Behavior:** All balance and transfer logic is file-based (JSON) or Excel; no bank API.
- **Reality:** Documented as sandbox; correct for demo.
- **To make real:** Integrate with bank/PSP APIs (e.g. UPI intent, account balance) in a regulated way; sandbox remains for testing only.

---

# PART 4: R&D – MAKING IT REAL-TIME AND PRODUCTION-READY

## 4.1 What “Real-Time” Means Here

- **Pre-payment:** Risk assessment and intervention must complete in a few hundred milliseconds so the user gets a go/no-go before confirming UPI.
- **During payment:** No “polling”; use WebSocket or SSE for intervention and guardian approval so the UI updates as soon as the backend decides.
- **Post-payment:** Notifications and logs should be near-instant (async is fine); no requirement for sub-second post-payment real-time.

## 4.2 Current Latency and Blockers

- **Today:** ML pipeline is synchronous in one process; no Redis/Mongo required for the critical path. Latency is dominated by Python + heuristics/sklearn (Isolation Forest). So “real-time” in the sense of &lt;1s is already possible for the current heuristic/synthetic setup.
- **Blockers for true real-time UX:**
  1. **Single pipeline:** PaymentFlow does not use the same risk API as transaction create; intervention is not triggered from that flow.
  2. **No WebSocket in flow:** Even if intervention were triggered, the frontend does not connect to `/intervention/ws/{user_id}` in the main payment flow or show modal from WebSocket push.
  3. **Round-trip:** Every “Check Safety” is one HTTP request; no streaming of model scores. Acceptable for &lt;1s, but for “live” feel you could stream partial results (e.g. SSE).

## 4.3 R&D Recommendations (Prioritized)

### P0 – Unify risk and payment flow (1–2 sprints)

1. **Single risk API**
   - Expose one endpoint, e.g. `POST /api/v1/transactions/assess-risk`, that:
     - Runs full ML ensemble (current `RiskAssessmentService.assess_transaction`).
     - Optionally runs rule-based + NLP (e.g. merge `FraudDetectionService.analyze_transaction` into the same flow or call it first and merge alerts).
   - Return: `ensemble_score`, `risk_level`, per-model scores, `risk_factors`, and a flag `intervention_required` (or level).

2. **Trigger intervention from risk API**
   - Inside the same request (or immediately after in background): if `intervention_required` or risk above threshold, call `intervention_agent.analyze_and_intervene(...)` and push via `ws_manager.send_intervention(user_id, intervention)`.
   - Frontend: in PaymentFlow, after “Check Safety,” call the unified `assess-risk` (or new name). When response says intervention required, either:
     - Rely on WebSocket and show modal when intervention message is received, or
     - Show modal from the same response (intervention payload in body) so it works even without WebSocket.

3. **Wire create + wallet**
   - Single “Confirm payment” action: call `assess-risk` (if not already done) → if allowed → `POST /transactions/create` and `POST /wallet/transfer/{user_id}` (or one backend endpoint that does both). Use same `transaction_id` for idempotency and audit.

4. **Fix API contract**
   - Frontend: `transactionAPI.create` → `POST /transactions/create`; `getHistory` → `GET /transactions/history` with `page` and `page_size`. Backend: ensure these routes exist and return the expected shapes.

### P1 – Data and configuration (1 sprint)

5. **Load scammers from Excel at startup**
   - In `main.py` lifespan (or a dedicated init module), after `init_excel_databases()`, call `ExcelDatabase.get_all_scammers()` and `get_fraud_detection_service().load_scammer_list(upi_ids)`. Optionally refresh on a timer or admin action.

6. **Single wallet store**
   - Choose one: e.g. sandbox JSON for all demo balance and history, and have transaction create update that store; or move wallet to SQLite and use it for both. Remove or clearly deprecate the other store.

7. **Intervention stats from real data**
   - Store interventions in DB (e.g. `intervention_events` table: id, user_id, transaction_id, level, created_at, resolved_at, outcome). Aggregate in `get_intervention_stats()` from DB (and optionally cache in Redis).

### P2 – Real-time UX and scale (2–3 sprints)

8. **WebSocket in PaymentFlow**
   - On “Check Safety” or on entering payment screen, connect to `wss://.../api/v1/intervention/ws/{user_id}`. When message type is `intervention`, show `AIInterventionModal` with the payload. Reconnect with backoff if disconnected.

9. **Optional streaming risk**
   - Add `GET /api/v1/transactions/assess-risk/stream?transaction_id=...` (SSE) or a second WebSocket channel that streams “model X score: 0.23” as each model finishes. Frontend can animate each model in real time with real scores.

10. **Auth and authorization**
    - Add JWT dependency to transaction and wallet routes; resolve `user_id` from token. Restrict wallet/transaction access to the authenticated user (and admin). Rate limit by user and IP.

### P3 – ML and observability (ongoing)

11. **Train and ship real models**
    - Collect labeled data (e.g. from fraud reports and manual labels). Train XGBoost (and optionally LSTM/GNN) on real features; persist artifacts and load in `XGBoostRiskScorer`. Replace Isolation Forest’s synthetic fit with a fit on real transaction features (or remove if not used in production).

12. **Persist ML features**
    - In `_log_ml_features`, pass the actual `features` dict from `feature_engineering.extract_all_features()` so MongoDB (or your analytics DB) has full feature vectors for retraining and drift detection.

13. **MongoDB/Redis timeouts**
    - Use connection timeouts and optional circuit breaker so missing MongoDB/Redis does not hang startup or request. Keep “degrade gracefully” behavior.

---

# PART 5: HOW TO MAKE IT REAL-TIME (CHECKLIST)

| # | Action | Owner | Notes |
|---|--------|--------|--------|
| 1 | Unify risk: one API used by PaymentFlow and transaction create | Backend + Frontend | Use `assess-risk` or new unified endpoint; return per-model + intervention flag |
| 2 | After risk, trigger intervention and push via WebSocket | Backend | In same request or immediate async; `send_intervention(user_id, intervention)` |
| 3 | PaymentFlow: call unified risk API; show intervention from response or WebSocket | Frontend | Connect to `/intervention/ws/{user_id}` when on payment screen; show modal on push or from response |
| 4 | Fix create + wallet: one “confirm” flow updates both transaction and balance | Backend | Single endpoint or orchestration; idempotency by transaction_id |
| 5 | Fix API paths: create → `/transactions/create`, history → `/transactions/history` | Frontend + Backend | Align OpenAPI and client |
| 6 | Load Excel scammers into FraudDetectionService at startup | Backend | init after Excel init |
| 7 | Single wallet store (JSON or DB); remove duplicate Excel wallet usage | Backend | One source of truth for balance |
| 8 | Store intervention events in DB; stats from DB | Backend | Real admin metrics |
| 9 | JWT auth on transaction and wallet routes; user_id from token | Backend | No unauthenticated create/transfer |
| 10 | Optional: SSE or WebSocket for streaming model scores | Backend + Frontend | “Live” model-by-model feedback |

---

# Summary Table

| Category | Count | Examples |
|----------|-------|----------|
| Business logic errors | 7 | Dual risk pipelines, scammer list not loaded, wallet split, create vs transfer not wired, intervention not triggered, API path mismatches |
| Technical / critical | 10+ | Auth not enforced, JWT default secret, Redis/Mongo not guarded, ML models heuristic/synthetic, intervention stats hardcoded |
| Mock / non-real features | 6 | PaymentFlow “5 models” animation fake, voice alerts text-only, guardian no push, OTP on screen, sandbox only |
| R&D for real-time | 13 items | Unify risk, trigger intervention, WebSocket in flow, single wallet, load scammers, persist features, train real models |

This document should be used as the single reference for prioritization and sprint planning to move from demo to production-ready, real-time fraud prevention.
