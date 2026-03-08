# UPI SafeGuard — Full Project Audit Report

**Audited by:** Senior Developer / AI Engineer / System Architect  
**Date:** 2025  
**Scope:** Complete codebase — Backend (FastAPI), Frontend (React+TS), ML Pipeline, Infrastructure  
**Reference Docs:** README.md, CREDENTIALS_GUIDE.md

> **⚠️ Post-Audit Update:** Since this audit, all 4 ML models have been **trained on PaySim data** via `backend/train_models.py`. Trained `.joblib` artifacts exist in `backend/app/ml/trained_models/`. The PaymentFlowV2 now calls the backend ML ensemble and displays per-model scores. References to "0 trained models" or "mock ML" below reflect the state at audit time.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [README vs Reality — Claims Audit](#2-readme-vs-reality--claims-audit)
3. [Critical Security Vulnerabilities](#3-critical-security-vulnerabilities)
4. [Business Logic Errors](#4-business-logic-errors)
5. [Technical Errors](#5-technical-errors)
6. [Mock vs Real — Feature Classification](#6-mock-vs-real--feature-classification)
7. [ML Pipeline Deep Dive — The Biggest Problem](#7-ml-pipeline-deep-dive--the-biggest-problem)
8. [Frontend Audit](#8-frontend-audit)
9. [Database & Schema Issues](#9-database--schema-issues)
10. [Detailed R&D — Making It Real-Time & Production Ready](#10-detailed-rd--making-it-real-time--production-ready)
11. [Priority Action Plan](#11-priority-action-plan)
12. [File-Level Severity Matrix](#12-file-level-severity-matrix)

---

## 1. Executive Summary

### The Good
- **Excellent UI/UX** — Premium animations (Framer Motion), responsive design, professional-grade frontend
- **Solid architecture** — Clean separation: FastAPI backend, React frontend, ML pipeline pattern
- **Real API integrations** — Twilio SMS, JWT auth, SQLAlchemy ORM work correctly
- **Good schema design** — Pydantic v2 schemas, SQLAlchemy models with cross-dialect support
- **Scam keyword NLP** — 40+ scam keywords across 7 categories actually work well

### The Bad
- **ZERO trained ML models** — All 5 "AI models" are either rule-based heuristics or trained on random synthetic data
- **6 of 16 frontend pages are 100% mock** — No API calls, all hardcoded data
- **Zero authentication on user routes** — All transaction/guardian/challenge endpoints are fully public
- **In-memory stores** — OTPs, sessions, notifications, behavioral profiles all lost on server restart
- **README makes false claims** — Claims "94.2% accuracy", "5 AI/ML models", specific F1 scores that don't exist

### The Ugly
- **OTP returned in plaintext** to frontend on Twilio failure
- **`correct_answer_index` sent to client** in AI intervention questions
- **IDOR vulnerabilities** — wallet API lets any user query/transfer from any other user
- **`isDemo` is always `true`** due to code bug (`|| true` instead of `?? false`)
- **`Float` used for money** — Floating-point precision will corrupt financial calculations

---

## 2. README vs Reality — Claims Audit

### README.md Claims vs Actual Implementation

| README Claim | Reality | Severity |
|---|---|---|
| "5 AI/ML models working together" | **0 trained models.** All are rule-based heuristics or random-data-trained. XGBoost instantiated but never trained. LSTM doesn't exist (no neural network code). GNN is BFS/PageRank algorithms. | **CRITICAL** |
| "XGBoost 96.5% accuracy, 95.2% precision" | Model is never trained. Falls back to `_heuristic_scoring()` which is a hand-coded rules engine. These numbers are fabricated. | **CRITICAL** |
| "GNN 94.2% accuracy" | No GNN exists. File contains graph traversal algorithms (BFS, connected components). No PyTorch Geometric, no learned embeddings. | **CRITICAL** |
| "LSTM Behavioral Profiler 89.7% accuracy" | No LSTM exists. No TensorFlow/PyTorch import. `self.model = None` is never populated. It's a statistical deviation detector. | **CRITICAL** |
| "Isolation Forest 87.3% accuracy" | Semi-real — sklearn IsolationForest is instantiated but trained on `np.random.seed(42)` synthetic data. Anomaly boundaries are meaningless. | **HIGH** |
| "Sensor Stress Detector 82.5% accuracy" | No ML model. Threshold-based analysis with hardcoded deviation multipliers. | **HIGH** |
| "50+ features extracted" | Feature engineering exists but `is_late_night: 1.0 if hour > 23` is always False (hour is 0-23). Some features duplicate across files. | **MEDIUM** |
| Port `8000` for backend | Backend actually runs on port `8001` | **LOW** |
| Port `5173` for frontend | Frontend runs on port `3000` or `3001` | **LOW** |
| OTP is `123456` | System generates random 6-digit OTPs. `123456` is not a valid OTP. | **MEDIUM** |
| "Real-time WebSocket push" | WebSocket endpoint exists in routes but frontend doesn't use `useInterventionWebSocket` hook in the payment flow. | **HIGH** |
| "Voice alerts in 12 Indian languages" | Explanation generator supports 4 languages (EN, HI, TA, TE). No TTS integration. | **HIGH** |
| Docker deployment available | No Dockerfile or docker-compose.yml exists in the project. | **MEDIUM** |
| "Activity logging for audit trail" | Admin activity logging exists in DB but is sparse and inconsistent. | **MEDIUM** |
| "CORS configured for frontend origin only" | CORS allows `localhost:3000`, `localhost:5173`, `localhost:3001` — not restrictive. All methods/headers allowed. | **LOW** |

### CREDENTIALS_GUIDE.md Issues

| Claim | Reality |
|---|---|
| Port `8000` and `5173` | Actually `8001` and `3000/3001` |
| OTP `123456` for demo | System generates random OTPs; demo phones get random OTP displayed in UI |
| "SQLite fallback auto-creates `upi_safeguard.db`" | Actually creates `demo_database.db` in CWD |
| "Mock services for MongoDB/Redis" | No explicit mock services — code just crashes or skips silently |

---

## 3. Critical Security Vulnerabilities

### P0 — Must Fix Immediately

| # | Vulnerability | Location | Impact |
|---|---|---|---|
| 1 | **OTP returned in plaintext** on Twilio failure | `sms_service.py` L42, L57 | Attacker can intercept OTP via network sniffing |
| 2 | **`correct_answer_index` sent to client** in AI intervention | `fraud.py` `AIInterventionQuestion` model | Client can see which answer bypasses fraud detection |
| 3 | **No auth on ANY user route** | `transaction.py`, `guardian.py`, `challenge.py` | All data publicly accessible, all actions performable without login |
| 4 | **IDOR — wallet access via userId in URL** | `client.ts` L155-162, wallet API | Any user can query/transfer from any other user's wallet |
| 5 | **Demo backdoor** — hardcoded `demo-token-123` | `Login.tsx` L142 | If server accepts this token, it's a permanent backdoor |
| 6 | **JWT secret hardcoded** | `config.py` `JWT_SECRET_KEY = "jwt-secret-key-change-in-production"` | All tokens can be forged by anyone who reads the source |
| 7 | **SQLite fallback in production** | `database.py` L73 | If Postgres is unreachable, app silently falls back to unencrypted local file |

### P1 — Fix Before Any Public Deployment

| # | Vulnerability | Location | Impact |
|---|---|---|---|
| 8 | **Token in localStorage** — XSS-vulnerable | `store/index.ts` L33, L131 | Any XSS attack can steal auth tokens |
| 9 | **`safe_word` stored in plaintext** | `models.py` L126 | Should be hashed like passwords |
| 10 | **No rate limiting** on any endpoint | All routes | OTP brute-force, account enumeration, DoS possible |
| 11 | **Global exception handler exposes tracebacks** | `main.py` global exception handler | Stack traces leak internal paths and code structure |
| 12 | **`/active-sessions` debug endpoint** exposed without auth | `auth.py` | Leaks all active session data |
| 13 | **`ip_address` and `device_id` accepted from client** | `schemas/transaction.py` L26-27 | Clients can spoof these values |
| 14 | **Device ID generated with `Math.random()`** | `client.ts` L6 | Predictable, not cryptographically random |
| 15 | **No CSRF protection** on state-changing endpoints | All POST/PUT/DELETE routes | Cross-site request forgery possible |

---

## 4. Business Logic Errors

### Critical Business Logic Failures

| # | File | Bug | Impact |
|---|---|---|---|
| 1 | `transaction.py` L93 | `user_id = user_id or "demo-user"` — ALL transactions run as same fake user | Per-user risk profiling, history, and guardian logic completely broken |
| 2 | `transaction.py` L100-103 | When demo-user, DB filter becomes `WHERE True`, scanning ALL transactions | Performance bomb + data leakage |
| 3 | `transaction.py` L47 | New user with zero history gets hardcoded avg/max of `1000` | Artificially lowers risk scores for new users sending large amounts |
| 4 | `transaction.py` L170 | Sets `user_id=None` on Transaction record | Violates `nullable=False` FK constraint — will crash on PostgreSQL |
| 5 | `guardian.py` L36 | Schema field `relationship` vs model column `relation_type` — name mismatch | Guardian relationship value silently dropped |
| 6 | `guardian.py` L149 | `guardian_approval_required` never set by transaction creation | Pending approvals always empty — guardian flow is broken |
| 7 | `guardian.py` L173 | `approve_transaction` changes status but doesn't process payment | Money never actually moves on approval |
| 8 | `challenge.py` L140 | "Daily" challenge uses `random.choice()` on every API call | Changes every request, not daily |
| 9 | `challenge.py` L20-95 | Challenge IDs regenerate on every server restart | Saved challenge_id in frontend/DB becomes invalid |
| 10 | `Login.tsx` L80 | `isDemo = response.data.is_demo \|\| true` — always `true` | ALL users treated as demo users due to `\|\| true` bug |
| 11 | `feature_engineering.py` L110 | `is_late_night: 1.0 if hour > 23` — hour is 0-23 | Feature is ALWAYS False — dead code |
| 12 | `risk_aggregator.py` L78 | `weighted_score / total_weight` double-counts confidence | Math error in the core risk calculation — all risk scores are wrong |
| 13 | `model_inference.py` L116 | `self.risk_aggregator.weights = adjusted_weights` mutates shared singleton | Race condition — concurrent requests interfere with each other |
| 14 | `Dashboard.tsx` L43 | Balance fetch falls back to `10000` on error | Users see fake balance of ₹10,000 |
| 15 | `Dashboard.tsx` L83 | `security_score \|\| 75` — users with score 0 see 75 | Falsy value `0` treated as missing |

### Data Integrity Issues

| # | Issue | Impact |
|---|---|---|
| 1 | `Float` used for monetary amounts (`models.py` L166) | Floating-point precision errors: `0.1 + 0.2 = 0.30000000000000004` |
| 2 | In-memory OTP store (`auth.py`) | All OTPs lost on server restart — users locked out |
| 3 | In-memory session store (`auth.py`) | All sessions lost on restart — everyone logged out |
| 4 | In-memory notification store (`notification_service.py`) | All notifications lost on restart |
| 5 | In-memory behavioral profiles (`fraud_detection_service.py`) | All learned user behavior lost on restart |
| 6 | Notification ID = `str(datetime.now().timestamp())` | Two notifications at same timestamp get same ID — collision |
| 7 | `datetime.utcnow()` used throughout (deprecated in Python 3.12+) | Should use `datetime.now(timezone.utc)` |

---

## 5. Technical Errors

### Backend Technical Errors

| # | File | Error | Severity |
|---|---|---|---|
| 1 | `transaction.py` L216-217 | `len(result.scalars().all())` loads ALL rows to count them. Should use `func.count()` | **HIGH** — OOM on large datasets |
| 2 | `transaction.py` L214 | Pagination count ignores filters — `total` is always ALL transactions | **MEDIUM** |
| 3 | `transaction.py` L120 | Mixes `datetime.now().hour` (local) with `datetime.utcnow()` (UTC) used elsewhere | **MEDIUM** |
| 4 | `admin.py` L273-286 | N+1 query: For each user in list, 2 additional DB queries. 100 users = 200 extra queries | **HIGH** |
| 5 | `model_inference.py` L58 | Comment says "simulated parallel execution" — models run sequentially. Should use `asyncio.gather()` | **MEDIUM** |
| 6 | `graph_neural_network.py` L136 | BFS traverses reverse edges inside same loop iteration — O(V·E) instead of O(V+E) | **MEDIUM** |
| 7 | `xgboost_risk_scorer.py` L73 | Scaler fit on `np.random.rand(1000, 25)` — produces garbage if real model loaded | **HIGH** |
| 8 | `lstm_behavioral_profiler.py` L135 | `update_profile()` appends to `typical_hours` without removing — eventually all 24 hours become "typical" | **MEDIUM** |
| 9 | `isolation_forest_anomaly.py` L63 | `contamination=0.1` assumes 10% fraud rate. Real UPI fraud rate is <0.1% | **HIGH** |
| 10 | `database.py` L30-38 | `_check_postgres_available` only checks DNS, not TCP connectivity | **MEDIUM** |
| 11 | `database.py` L85-96 | MongoDB/Redis init have NO error handling — crash app on startup if unavailable | **HIGH** |
| 12 | `explanation_generator.py` L107 | `template.format(**context)` throws `KeyError` if context missing a key | **MEDIUM** |
| 13 | `feature_engineering.py` L134 | `amount_velocity_ratio` divides by `max(amount_last_hour, 1)` — if 0, ratio is just raw amount | **LOW** |
| 14 | `risk_assessment_service.py` L82 | `except Exception: pass` swallows ALL errors including programming bugs | **HIGH** |

### Frontend Technical Errors

| # | File | Error | Severity |
|---|---|---|---|
| 1 | `PaymentFlow.tsx` L150, L178 | Uses raw `fetch()` instead of configured Axios client — bypasses auth headers | **HIGH** |
| 2 | `PaymentFlow.tsx` L228-268 | ML scores animation uses `Math.random()` — may contradict real API results | **HIGH** |
| 3 | `client.ts` L55-60 | 401 interceptor does `window.location.href` redirect — breaks SPA, loses all state | **MEDIUM** |
| 4 | `client.ts` L121 | `encodeURIComponent` + Axios auto-encoding = double-encoded `%40 → %2540` | **MEDIUM** |
| 5 | `App.tsx` L41-53 | No auth guard on user routes — unauthenticated users can access `/dashboard`, `/pay`, etc. | **CRITICAL** |
| 6 | `App.tsx` L8,L45 | `PaymentFlow.tsx` imported but never rendered — `PaymentFlowV2` used instead. Dead code. | **LOW** |
| 7 | `CommunityStats.tsx` L178-183 | Uses `<a href>` instead of React Router `<Link>` — full page reload | **LOW** |
| 8 | `store/index.ts` L33 | Token double-write to localStorage (explicit + Zustand persist) — can desync | **MEDIUM** |

---

## 6. Mock vs Real — Feature Classification

### Backend Feature Status

| Feature | File(s) | Status | Details |
|---|---|---|---|
| User OTP Auth | `auth.py`, `sms_service.py` | **REAL** ✅ | Twilio integration works. Demo fallback for test numbers. |
| JWT Token Auth | `auth.py`, `config.py` | **REAL** ✅ | Works but secret is hardcoded. |
| Fraud Detection (NLP) | `fraud_detection_service.py` | **REAL** ✅ | 40+ scam keywords, 7 categories. Works well. |
| AI Intervention Questions | `fraud.py` | **PARTIAL** ⚠️ | Questions are hardcoded templates, not AI-generated. `correct_answer_index` sent to client. |
| Risk Assessment Pipeline | `risk_assessment_service.py` | **PARTIAL** ⚠️ | Orchestration works but all underlying models are fake. |
| XGBoost Risk Scorer | `xgboost_risk_scorer.py` | **MOCK** ❌ | XGBoost imported but never trained. Uses `_heuristic_scoring()`. |
| LSTM Behavioral Profiler | `lstm_behavioral_profiler.py` | **MOCK** ❌ | No neural network anywhere. Pure statistical deviation detector. |
| Graph Neural Network | `graph_neural_network.py` | **MOCK** ❌ | No GNN. Just BFS + PageRank algorithms on an adjacency list. |
| Isolation Forest | `isolation_forest_anomaly.py` | **SEMI-MOCK** ⚠️ | sklearn IsolationForest exists but trained on synthetic random data. |
| Sensor Stress Detector | `sensor_stress_detector.py` | **MOCK** ❌ | Threshold-based heuristic. No ML model. |
| Feature Engineering | `feature_engineering.py` | **REAL** ✅ | Solid feature extraction, but has dead features (`is_late_night`). |
| Risk Aggregator | `risk_aggregator.py` | **REAL** ✅ | Works but has math error (double confidence weighting). |
| Explanation Generator | `explanation_generator.py` | **REAL** ✅ | Template-based multilingual explanations. 4 languages, not 12. |
| Transaction CRUD | `transaction.py` | **PARTIAL** ⚠️ | DB operations work but no auth, no limit enforcement, demo-user hardcoded. |
| Guardian Mode | `guardian.py` | **PARTIAL** ⚠️ | CRUD works but approval workflow broken (never triggered). |
| Challenges/Education | `challenge.py` | **MOCK** ❌ | All in-memory, IDs regenerate on restart, leaderboard/badges hardcoded. |
| Admin Dashboard | `admin.py` | **PARTIAL** ⚠️ | User/report management real. ML metrics and system health hardcoded. |
| Notifications | `notification_service.py` | **MOCK** ❌ | In-memory only. No push notifications. Lost on restart. |
| WebSocket Intervention | _(referenced but not audited)_ | **UNKNOWN** | Frontend hook exists but unused in payment flow. |

### Frontend Feature Status

| Page | Status | Details |
|---|---|---|
| Login/Registration | **REAL** ✅ | API calls work. Bank detection is simulated. `isDemo` always-true bug. |
| Dashboard | **MIXED** ⚠️ | Balance from API (with ₹10K fake fallback). Alerts and stats hardcoded. |
| PaymentFlow | **MIXED** ⚠️ | Fraud API is real. ML animation simulated with `Math.random()`. Any 4-digit PIN accepted. |
| Transaction History | **MIXED** ⚠️ | API call real. Falls back to 8 hardcoded demo transactions on error/empty. |
| Fraud Report | **REAL** ✅ | Calls `fraudAPI.submitReport()`. File upload non-functional. |
| Risk Assessment | **MIXED** ⚠️ | Uses pending transaction data. Model scores hardcoded. Features analyzed hardcoded. |
| Guardian Mode | **MOCK** ❌ | Zero API calls. All data hardcoded. Setup uses `setTimeout`. |
| Challenges | **MOCK** ❌ | Zero API calls. Hardcoded challenges, XP, badges. |
| Community Stats | **MOCK** ❌ | Zero API calls. Misleadingly labeled "Live Data". |
| Profile | **MOCK** ❌ | All stats/achievements/activity hardcoded. XP hardcoded. |
| Settings | **MOSTLY MOCK** ❌ | Language saved locally. Notifications non-functional. No i18n. |
| Landing | **STATIC** 📄 | Marketing page with fabricated statistics. |

### Overall Metrics

| Category | Count |
|---|---|
| Fully Real Features | 5 / 18 (28%) |
| Partially Real | 8 / 18 (44%) |
| Fully Mocked | 5 / 18 (28%) |
| **Frontend pages that are 100% mock** | **6 of 16 (38%)** |
| **ML models with actual training** | **0 of 5 (0%)** |

---

## 7. ML Pipeline Deep Dive — The Biggest Problem

### Current State: "Sophisticated Rule Engine Disguised as ML Pipeline"

```
What README Claims:           What Actually Exists:
┌──────────────────────┐      ┌──────────────────────┐
│ XGBoost (96.5% acc)  │      │ if amount > avg*3:   │
│ Trained on data      │  →   │   score += 0.3       │
│ Feature importance   │      │ if unusual_hour:     │
│ SHAP explanations    │      │   score += 0.1       │
└──────────────────────┘      └──────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│ LSTM (89.7% acc)     │      │ self.model = None    │
│ Sequence modeling    │  →   │ if amt > mean + 2*std│
│ Behavioral patterns  │      │   anomaly += 0.35    │
│ Temporal features    │      │ # No neural network  │
└──────────────────────┘      └──────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│ GNN (94.2% acc)      │      │ # BFS traversal      │
│ Graph convolutions   │  →   │ for neighbor in adj: │
│ Message passing      │      │   if is_flagged:     │
│ Fraud ring detection │      │     risk += 0.15     │
└──────────────────────┘      └──────────────────────┘
```

### Per-Model Analysis

#### 1. XGBoost Risk Scorer — **MOCK**
- `self.is_trained = False` — always falls back to `_heuristic_scoring()`
- Scaler fit on `np.random.rand(1000, 25)` — meaningless normalization
- Feature importance weights hardcoded, not from model
- Heuristic checks `amount > avg*3` but contribution analysis checks `ratio > 2` — contradictory

#### 2. LSTM Behavioral Profiler — **MOCK (Misleading Name)**
- Zero neural network code. No TensorFlow. No PyTorch. `self.model = None`.
- `extract_sequence_features()` builds sequences but **nothing calls it**
- `update_profile()` appends hours without bounds → eventually all hours are "typical"
- Should be renamed `StatisticalBehavioralProfiler`

#### 3. Graph Neural Network — **MOCK (Misleading Name)**
- No PyTorch Geometric. No learned embeddings. No message passing.
- Just adjacency list + BFS + custom PageRank implementation
- BFS algorithm is O(V·E) instead of correct O(V+E) due to reverse-edge traversal bug
- Demo graph uses unseeded `random.randint` — changes every restart

#### 4. Isolation Forest — **SEMI-REAL**
- sklearn IsolationForest IS instantiated and trained
- BUT trained on `np.random.seed(42)` synthetic data — anomaly boundaries are random
- `contamination=0.1` assumes 10% fraud rate (real: <0.1%)
- Feature outlier explanations use hardcoded thresholds independent of actual model boundaries

#### 5. Sensor Stress Detector — **MOCK**
- Pure threshold-based analysis
- Returns 0.3 baseline for all transactions with missing sensor data → unnecessary medium alerts
- Hardcoded baseline values (5.0 WPM typing, 0.5 pressure) have no empirical basis
- `SensorData` dataclass defined but never used

### Pipeline Issues

| Component | Issue |
|---|---|
| `model_inference.py` | Models run sequentially despite "parallel execution" comment. Race condition on shared weight mutation. |
| `risk_aggregator.py` | Math error: `weighted_score / total_weight` where `total_weight = sum(weight * confidence)` double-counts confidence |
| `feature_engineering.py` | `is_late_night` always False. Feature order sorted alphabetically (breaks any model expecting fixed order). Duplicate features across files. |
| `explanation_generator.py` | `format(**context)` throws KeyError on missing keys. Passes risk_score as confidence (wrong value). |

---

## 8. Frontend Audit

### Architecture Issues
1. **No route protection** — `App.tsx` has `<AdminRoute>` for admin, but ZERO auth guards for user routes
2. **Dead code** — `PaymentFlow.tsx` imported but `PaymentFlowV2` actually renders at `/pay`
3. **No 404 route** — Navigating to nonexistent path shows blank page
4. **No `<Suspense>` boundaries** for future lazy loading

### State Management Issues
1. Token stored in BOTH explicit `localStorage.setItem` AND Zustand persist — can desync
2. `useTransactionStore` not persisted — transactions lost on refresh
3. Logout clears store but doesn't call `authAPI.logout()` — server session stays active
4. `isDemo || true` bug means all users are always treated as demo

### API Client Issues
1. `Math.random()` for device ID — not cryptographically secure
2. 401 interceptor does hard `window.location.href` redirect — breaks SPA
3. Admin token detection is URL-prefix-based — fragile
4. No retry logic, no timeout, no refresh-token mechanism
5. `encodeURIComponent` on UPI IDs + Axios auto-encoding = double-encoding bug

### Mock Pages That Need Real Integration

| Page | What It Shows | What API Exists | Work Needed |
|---|---|---|---|
| GuardianMode | Hardcoded guardians & approvals | `guardianAPI.setup/list/approve/reject` | Wire up all API calls |
| Challenges | Hardcoded challenges & XP | `challengeAPI.getChallenges/submit/getBadges` | Wire up all API calls |
| CommunityStats | Static data labeled "Live Data" | `fraudAPI.getCommunityStats/getTrendingScams` | Wire up all API calls |
| Profile | Hardcoded stats & achievements | User API + computed stats | Build stats aggregation API |
| Settings | Dead toggles & buttons | Partial (language only) | Build notification preferences API |
| RiskAssessment | Hardcoded model scores | ML pipeline response data | Pass real model outputs from payment flow |

---

## 9. Database & Schema Issues

### SQLAlchemy Models

| Issue | Location | Severity |
|---|---|---|
| `Float` for monetary columns | `models.py` L166 (Transaction.amount), User limits, FraudReport.amount_lost | **CRITICAL** — Use `Numeric(10, 2)` |
| `nullable=False` FK violated | Transaction.user_id, Guardian.user_id — set to None for demo-user | **HIGH** — Crashes on PostgreSQL |
| `relation_type` vs `relationship` mismatch | Guardian model vs GuardianCreate schema | **HIGH** — Data silently dropped |
| No indexes on FK columns | Transaction.user_id, Guardian.user_id, FraudReport.reporter_id | **HIGH** — Full table scans |
| `date_of_birth` is DateTime not Date | User model L118 | **LOW** |
| `pin_hash` stored but no PIN verification logic | User model L124 | **MEDIUM** |
| `safe_word` stored in plaintext | User model L126 | **HIGH** — Should be hashed |
| `datetime.utcnow` deprecated | Throughout models | **LOW** — Use `timezone.utc` |
| `default=list` mutable default | Transaction.risk_factors L174 | **LOW** — Works but unconventional |

### Pydantic Schemas

| Issue | Location | Severity |
|---|---|---|
| Phone number format inconsistent | UserCreate allows `+91`, GuardianCreate requires 10 digits only | **MEDIUM** |
| `TransactionRequest.amount` has no `gt=0` validation | `schemas/transaction.py` L20 | **HIGH** — Negative amounts accepted |
| OTP field allows non-digits | `schemas/user.py` L54 — no `pattern` for digits-only | **MEDIUM** |
| `scam_type` not validated against SCAM_TYPES enum | `schemas/fraud_report.py` L13 | **MEDIUM** |
| `evidence_urls` not URL-validated | `schemas/fraud_report.py` L18 | **LOW** |
| `is_ongoing` field not stored in model | `schemas/fraud_report.py` L19 | **LOW** |
| `ml_response.py` schemas never used as `response_model` | All routes return raw dicts instead | **MEDIUM** |
| `risk_level` is unconstrained `str` | `ml_response.py` L44 — should be Literal/Enum | **LOW** |

---

## 10. Detailed R&D — Making It Real-Time & Production Ready

### Phase 1: Fix Critical Bugs (Week 1)

#### 1.1 Security Fixes
```
Priority: IMMEDIATE

□ Remove `correct_answer_index` from AI intervention API response
□ Stop returning OTP in plaintext on SMS failure
□ Add JWT auth dependency to ALL user routes (transaction, guardian, challenge)
□ Remove `demo-user` hardcoded fallback — require real auth
□ Generate cryptographically random JWT secret on first run
□ Remove `/active-sessions` debug endpoint
□ Add rate limiting (10 OTP requests/hour, 100 API calls/minute)
□ Fix `isDemo = response.data.is_demo || true` → `?? false`
□ Set `ip_address`/`device_id` server-side, not from client
□ Generate device ID with `crypto.randomUUID()` instead of `Math.random()`
```

#### 1.2 Data Integrity Fixes
```
Priority: HIGH

□ Change `Float` → `Numeric(10, 2)` for ALL monetary columns
□ Fix `relation_type` vs `relationship` mismatch
□ Add indexes on Transaction.user_id, Guardian.user_id, FraudReport.reporter_id
□ Fix pagination count query to use `func.count()` with filters
□ Fix N+1 queries in admin user list with SQL joins
□ Hash `safe_word` like passwords
□ Normalize phone numbers to E.164 format everywhere
```

#### 1.3 Business Logic Fixes
```
Priority: HIGH

□ Fix `is_late_night` feature: `hour >= 23 or hour <= 4`
□ Fix risk_aggregator double confidence weighting math
□ Fix model_inference race condition — pass weights to aggregate() call
□ Set `guardian_approval_required=True` in transaction creation when guardians exist
□ Fix challenge daily selection with date-based seeding
□ Enforce `daily_limit` and `per_transaction_limit` before creating transactions
□ Add idempotency keys to prevent duplicate transactions
```

### Phase 2: Real ML Models (Weeks 2-4)

#### 2.1 Data Collection Strategy
```
You need labeled UPI fraud data. Options:

1. Synthetic Data Generation (Fastest):
   - Use `sdv` (Synthetic Data Vault) to generate realistic transaction patterns
   - Create fraud scenarios: account takeover, social engineering, mule accounts
   - Target: 100K normal + 1K fraudulent transactions

2. Public Datasets (Adapt to UPI):
   - IEEE-CIS Fraud Detection dataset (Kaggle) — adapt features to UPI context
   - PaySim mobile money simulator — closest to UPI transaction patterns
   - Credit Card Fraud Detection (Kaggle) — for anomaly detection baselines

3. Real Data Partnerships:
   - NPCI sandbox API for realistic transaction flows
   - Partner with a bank's innovation lab for anonymized data
```

#### 2.2 Train Real XGBoost Model
```python
# What needs to happen:
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

# 1. Load labeled dataset
X, y = load_upi_fraud_dataset()  # You need this

# 2. Feature engineering (already have feature_engineering.py)
features = extract_features(X)

# 3. Train-test split with stratification (fraud is rare)
X_train, X_test, y_train, y_test = train_test_split(
    features, y, test_size=0.2, stratify=y
)

# 4. Train with class imbalance handling
model = xgb.XGBClassifier(
    scale_pos_weight=len(y_train[y_train==0]) / len(y_train[y_train==1]),
    max_depth=6, learning_rate=0.1, n_estimators=300,
    eval_metric='aucpr'
)
model.fit(X_train, y_train)

# 5. Save model + fitted scaler
model.save_model('ml_models/xgboost_risk_model.json')
joblib.dump(scaler, 'ml_models/xgboost_scaler.pkl')

# 6. Get REAL accuracy metrics
print(classification_report(y_test, model.predict(X_test)))
```

#### 2.3 Implement Real LSTM/Transformer
```python
# Option A: LSTM with PyTorch
import torch
import torch.nn as nn

class TransactionLSTM(nn.Module):
    def __init__(self, input_size=25, hidden_size=128, num_layers=2):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        # x shape: (batch, seq_len, features)
        lstm_out, _ = self.lstm(x)
        return self.classifier(lstm_out[:, -1, :])

# Option B: Transformer (Better for long sequences)
# Use a pre-built transformer encoder with positional encoding
# Train on sequences of 10-50 past transactions per user
```

#### 2.4 Implement Real GNN
```python
# Use PyTorch Geometric
import torch_geometric
from torch_geometric.nn import SAGEConv

class FraudGNN(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, hidden_channels)
        self.classifier = torch.nn.Linear(hidden_channels, 1)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = self.conv2(x, edge_index).relu()
        return torch.sigmoid(self.classifier(x))

# Graph construction:
# - Nodes = UPI IDs
# - Edges = transactions between them
# - Node features = user behavioral profile
# - Train to classify: fraud_node vs legitimate_node
```

#### 2.5 Fix Isolation Forest
```
□ Set contamination=0.001 (realistic fraud rate)
□ Train on actual transactions, not synthetic random data
□ Use SHAP TreeExplainer for outlier feature identification
□ Implement periodic retraining (weekly) as patterns evolve
```

### Phase 3: Real-Time Infrastructure (Weeks 3-5)

#### 3.1 Replace In-Memory Stores with Redis
```
Current State → Target:

OTP Store:       dict{} → Redis with 5-minute TTL
Sessions:        dict{} → Redis with JWT blacklist
Notifications:   list[] → Redis Pub/Sub + PostgreSQL for persistence
User Profiles:   dict{} → Redis cache + PostgreSQL for persistence
Rate Limiting:   None   → Redis sliding window counter
```

```python
# Redis implementation for OTP
import redis.asyncio as redis

class OTPService:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def store_otp(self, phone: str, otp: str):
        key = f"otp:{phone}"
        await self.redis.setex(key, 300, otp)  # 5-min expiry
        # Rate limiting
        rate_key = f"otp_rate:{phone}"
        count = await self.redis.incr(rate_key)
        if count == 1:
            await self.redis.expire(rate_key, 3600)  # 1 hour window
        if count > 5:
            raise TooManyRequestsError("Max 5 OTPs per hour")

    async def verify_otp(self, phone: str, otp: str) -> bool:
        stored = await self.redis.get(f"otp:{phone}")
        if stored and stored.decode() == otp:
            await self.redis.delete(f"otp:{phone}")
            return True
        return False
```

#### 3.2 WebSocket Real-Time Push
```
The WebSocket infrastructure already exists in the codebase but
is NOT connected to the frontend payment flow.

Steps:
1. Connect useInterventionWebSocket hook to PaymentFlow.tsx
2. Backend: Emit fraud alerts via WebSocket when risk > threshold
3. Implement reconnection logic with exponential backoff
4. Add WebSocket authentication (pass JWT as query param)
5. Use Redis Pub/Sub as WebSocket message broker for multi-instance support
```

```python
# Backend: WebSocket with Redis Pub/Sub
from fastapi import WebSocket
import redis.asyncio as redis

@app.websocket("/ws/intervention/{user_id}")
async def intervention_ws(websocket: WebSocket, user_id: str, token: str):
    # Verify JWT from query param
    user = verify_token(token)
    if not user:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"intervention:{user_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_json(json.loads(message["data"]))
    finally:
        await pubsub.unsubscribe(f"intervention:{user_id}")
```

#### 3.3 Real-Time Event Streaming Architecture

```
Current Flow (Request-Response):
  User → API → ML Pipeline → Response → User
  (Total: 200-500ms, all synchronous)

Target Flow (Event-Driven Real-Time):

  ┌─────────┐    ┌───────────┐    ┌──────────────┐
  │ Frontend │───→│  FastAPI   │───→│ Redis Stream │
  │ (React)  │    │  Gateway   │    │  / Kafka     │
  └────▲─────┘    └───────────┘    └──────┬───────┘
       │                                  │
       │    ┌─────────────────────────────┤
       │    │                             │
       │    ▼                             ▼
  ┌────┴────────┐    ┌──────────┐   ┌──────────┐
  │  WebSocket  │    │ ML Worker│   │ ML Worker│
  │  Server     │    │ (XGBoost)│   │ (LSTM)   │
  └─────────────┘    └────┬─────┘   └────┬─────┘
                          │              │
                          ▼              ▼
                    ┌──────────────────────┐
                    │  Risk Aggregator     │
                    │  (Reads all scores)  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Decision Engine     │
                    │  → WebSocket push    │
                    │  → Guardian notify   │
                    │  → Block/Allow       │
                    └──────────────────────┘
```

#### 3.4 Database Architecture Upgrade
```
Current: SQLite file → PostgreSQL (never connected)
Target:

PostgreSQL (Primary)
  ├── Users, Transactions, Guardians, FraudReports
  ├── With proper indexes
  ├── Connection pooling (asyncpg + SQLAlchemy)
  └── Read replicas for analytics queries

Redis (Cache + Realtime)
  ├── OTP storage with TTL
  ├── Session management
  ├── Rate limiting counters
  ├── WebSocket pub/sub
  └── ML model result caching (30s TTL)

MongoDB (ML Data Lake)
  ├── Behavioral logs (per-user transaction sequences)
  ├── ML feature snapshots
  ├── Model performance metrics
  └── Audit logs with TTL indexes

Neo4j (Graph Database) — Optional for GNN
  ├── UPI ID → UPI ID transaction graph
  ├── Real-time fraud ring detection
  └── Community detection algorithms
```

### Phase 4: Wire Up Frontend Mock Pages (Week 2-3)

```
Priority order (effort → impact):

1. Guardian Mode (1-2 days)
   - Replace hardcoded guardians with guardianAPI.list()
   - Replace setTimeout setup with guardianAPI.setup()
   - Wire approve/reject to guardianAPI.approve/reject()
   - Add real-time WebSocket for guardian notifications

2. Challenges/Education (1-2 days)
   - Replace hardcoded challenges with challengeAPI.getChallenges()
   - Wire submit to challengeAPI.submit()
   - Show real XP from user.education_score
   - Persist progress in ChallengeProgress table

3. Community Stats (1 day)
   - Replace hardcoded data with fraudAPI.getCommunityStats()
   - Replace "Live Data" with actual refresh mechanism
   - Use React Router <Link> instead of <a href>

4. Profile (1 day)
   - Compute stats from actual transaction data
   - Show real education_score for XP
   - Wire RiskGauge to actual security_score
   - Add profile edit functionality

5. Settings (1-2 days)
   - Build notification preferences API endpoint
   - Wire notification toggles to API
   - Implement real i18n (react-i18next)
   - Add PIN change, transaction limit change flows

6. Risk Assessment (0.5 days)
   - Pass real model outputs from PaymentFlow to RiskAssessment
   - Show actual feature importances from ML pipeline
   - Remove hardcoded model scores
```

### Phase 5: Production Hardening (Week 4-6)

#### 5.1 Authentication & Authorization
```
□ Add FastAPI Depends(get_current_user) to ALL user routes
□ Add Depends(get_current_admin) to ALL admin routes
□ Implement refresh token rotation
□ Add bcrypt password hashing for UPI PINs
□ Implement account lockout after 5 failed OTP attempts
□ Add RBAC (Role-Based Access Control) for admin roles
□ Implement CSRF tokens for all state-changing operations
□ Move tokens to httpOnly secure cookies instead of localStorage
```

#### 5.2 Monitoring & Observability
```
□ Add structured logging (structlog) replacing print statements
□ Integrate Prometheus metrics endpoint
  - Request latency histograms
  - ML model inference times
  - Error rates per endpoint
  - Active WebSocket connections
□ Add distributed tracing (OpenTelemetry)
□ Set up Grafana dashboards for real-time monitoring
□ Add Sentry for error tracking
□ Health check endpoint that actually checks all services
```

#### 5.3 Performance Optimization
```
□ Implement ML model caching (Redis, 30s TTL for same transaction)
□ Use asyncio.gather() for parallel model inference
□ Add connection pooling for PostgreSQL (pool_size=20, max_overflow=30)
□ Implement API response compression (gzip)
□ Add CDN for static frontend assets
□ Implement database query result caching for admin analytics
□ Add pagination with cursor-based pagination for large datasets
```

#### 5.4 Testing
```
Current: ZERO tests exist

Required:
□ Unit tests for all ML models (pytest, >90% coverage)
□ Integration tests for API routes (pytest + httpx.AsyncClient)
□ Schema validation tests
□ Security tests (OWASP ZAP scan)
□ Load tests (Locust) — target: 1000 concurrent users
□ Frontend component tests (Vitest + React Testing Library)
□ E2E tests (Playwright)
□ ML model regression tests (compare metric baselines)
```

---

## 11. Priority Action Plan

### Sprint 1 (Week 1): "Stop the Bleeding"
1. ✦ Fix all P0 security vulnerabilities (Section 3)
2. ✦ Add auth middleware to ALL routes
3. ✦ Fix `isDemo || true` bug
4. ✦ Fix `Float` → `Numeric` for money
5. ✦ Fix risk_aggregator math error
6. ✦ Add route guards to frontend

### Sprint 2 (Week 2): "Make It Real"
7. Wire up Guardian Mode frontend → backend
8. Wire up Challenges frontend → backend
9. Wire up Community Stats frontend → backend
10. Wire up Profile with computed data
11. Fix all business logic errors (Section 4)
12. Implement Redis for OTP + sessions

### Sprint 3 (Weeks 3-4): "Train the Brain"
13. Collect/generate labeled fraud dataset
14. Train real XGBoost model with proper metrics
15. Implement real LSTM on user transaction sequences
16. Fix Isolation Forest contamination rate + real data training
17. Connect WebSocket intervention to payment flow
18. Replace hardcoded admin ML metrics with real model introspection

### Sprint 4 (Weeks 5-6): "Production Ready"
19. Implement GNN with PyTorch Geometric (or simplify to graph algorithms with honest naming)
20. Add comprehensive test suite
21. Set up monitoring (Prometheus + Grafana)
22. Production deployment (Docker + CI/CD)
23. Update README with honest, accurate metrics
24. Security audit and penetration testing

---

## 12. File-Level Severity Matrix

### Backend Files

| File | Lines | Type | Bugs | Security | Severity |
|------|-------|------|------|----------|----------|
| `config.py` | ~50 | Real | 2 | 1 (JWT secret) | **HIGH** |
| `main.py` | 203 | Real | 3 | 1 (traceback) | **MEDIUM** |
| `auth.py` | 460 | Real | 5 | 3 | **HIGH** |
| `transaction.py` | 253 | Partial | 7 | 5 | **CRITICAL** |
| `guardian.py` | 213 | Partial | 7 | 3 | **HIGH** |
| `challenge.py` | 228 | Mock | 7 | 2 | **MEDIUM** |
| `admin.py` | 626 | Mixed | 8 | 2 | **HIGH** |
| `fraud.py` | 370 | Mixed | 3 | 1 (answer leak) | **HIGH** |
| `database.py` | 118 | Real | 4 | 3 | **HIGH** |
| `models.py` | 288 | Real | 7 | 3 | **CRITICAL** |
| `sms_service.py` | ~80 | Real | 2 | 2 (OTP leak) | **CRITICAL** |
| `notification_service.py` | ~60 | Mock | 3 | 0 | **LOW** |
| `fraud_detection_service.py` | 530 | Real | 2 | 0 | **MEDIUM** |
| `risk_assessment_service.py` | ~80 | Real | 3 | 0 | **MEDIUM** |
| `xgboost_risk_scorer.py` | ~150 | Mock | 4 | 0 | **HIGH** |
| `lstm_behavioral_profiler.py` | ~180 | Mock | 4 | 0 | **HIGH** |
| `graph_neural_network.py` | ~200 | Mock | 5 | 0 | **HIGH** |
| `isolation_forest_anomaly.py` | ~140 | Semi-real | 4 | 0 | **MEDIUM** |
| `sensor_stress_detector.py` | ~120 | Mock | 3 | 0 | **MEDIUM** |
| `model_inference.py` | ~130 | Real | 4 | 0 | **HIGH** (race) |
| `risk_aggregator.py` | ~100 | Real | 3 | 0 | **HIGH** (math) |
| `feature_engineering.py` | ~150 | Real | 4 | 0 | **MEDIUM** |
| `explanation_generator.py` | ~130 | Real | 3 | 0 | **LOW** |

### Frontend Files

| File | Lines | Type | Bugs | Security | Severity |
|------|-------|------|------|----------|----------|
| `store/index.ts` | 148 | Real | 2 | 3 (XSS) | **HIGH** |
| `api/client.ts` | 217 | Real | 3 | 3 (IDOR) | **HIGH** |
| `Login.tsx` | 714 | Mixed | 5 | 2 (backdoor) | **HIGH** |
| `PaymentFlow.tsx` | 1396 | Mixed | 7 | 3 | **CRITICAL** |
| `Dashboard.tsx` | 400 | Mixed | 5 | 0 | **MEDIUM** |
| `TransactionHistory.tsx` | 539 | Mixed | 4 | 0 | **MEDIUM** |
| `GuardianMode.tsx` | 314 | Mock | 5 | 0 | **MEDIUM** |
| `Challenges.tsx` | 224 | Mock | 6 | 0 | **LOW** |
| `CommunityStats.tsx` | 188 | Mock | 3 | 0 | **LOW** |
| `FraudReport.tsx` | 214 | Real | 4 | 0 | **MEDIUM** |
| `RiskAssessment.tsx` | 207 | Mixed | 4 | 0 | **MEDIUM** |
| `Settings.tsx` | 204 | Mock | 4 | 0 | **LOW** |
| `Profile.tsx` | 153 | Mock | 4 | 0 | **LOW** |
| `Landing.tsx` | 257 | Static | 3 | 0 | **LOW** |
| `App.tsx` | 81 | Real | 3 | 1 (no auth) | **HIGH** |
| `Layout.tsx` | 134 | Real | 4 | 1 | **MEDIUM** |

### Summary Statistics

| Metric | Value |
|---|---|
| Total files audited | **39** |
| Total bugs found | **~160** |
| Critical security vulnerabilities | **7** |
| High-severity security issues | **8** |
| ML models with real training | **0 / 5** |
| Frontend pages 100% mocked | **6 / 16** |
| Backend routes without authentication | **15 / ~25** |
| Tests in the entire project | **0** |
| Lines of dead/unused code | **~500+** |

---

*This audit was conducted by reading every file in the project. All line numbers reference the actual codebase as of the audit date.*
