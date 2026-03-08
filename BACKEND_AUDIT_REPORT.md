# Backend Comprehensive Code Audit Report

**Project:** UPI Fraud Detection (SafeGuard)  
**Audited:** Every `.py` file in `backend/`  
**Total Files Reviewed:** 48 Python files + 1 requirements.txt  
**Risk Rating:** HIGH — multiple critical security issues found  

> **⚠️ Note:** This is a security audit report. All findings remain valid for the codebase's security posture. This is a hackathon demo project; some security simplifications are intentional for demo purposes.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Findings (Must Fix)](#2-critical-findings-must-fix)
3. [File-by-File Audit](#3-file-by-file-audit)
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
5. [Remediation Priority](#5-remediation-priority)

---

## 1. Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Hardcoded Secrets | 3 | 1 | 2 | — |
| Auth Bypass / Missing Auth | 5 | 4 | 3 | — |
| Race Conditions | — | 3 | — | — |
| Input Validation Gaps | — | 2 | 5 | — |
| Error Handling Gaps | — | 3 | 6 | — |
| Business Logic Bugs | — | 3 | 4 | — |
| Data Persistence | — | 2 | 1 | — |
| Information Leakage | — | 2 | 3 | — |

### Architecture Quick Summary

- **Framework:** FastAPI (async) with SQLAlchemy async ORM
- **Databases:** PostgreSQL (primary) / SQLite (fallback), MongoDB (ML logging), Redis (caching, optional)
- **Auth:** JWT (`python-jose`), bcrypt admin passwords, Firebase phone auth, in-memory OTP store
- **ML:** 5-model ensemble (XGBoost, GBT behavioral, Isolation Forest, GNN, Sensor Stress)
- **Storage:** Excel files (pandas) for contacts/scammers, JSON files for sandbox wallets
- **External:** Twilio SMS, Firebase Admin SDK

---

## 2. Critical Findings (Must Fix)

### CRIT-1: Hardcoded JWT Secret Key
**File:** `app/config.py` line 23  
```python
JWT_SECRET_KEY: str = "jwt-secret-key-change-in-production"
```
**Impact:** Anyone who reads the source code can forge arbitrary JWT tokens for any user.  
**Fix:** Load from environment variable with no default, fail on startup if missing.

### CRIT-2: Authentication Completely Bypassed for All Users
**File:** `app/api/deps.py` lines 15-32  
```python
async def get_current_user_id(...):
    ...
    except Exception:
        return "demo-user"  # Fallback for hackathon
```
**Impact:** Every endpoint using `Depends(get_current_user_id)` silently returns `"demo-user"` when no token or an invalid token is supplied. This means **all "authenticated" user endpoints are actually public**.  
**Fix:** Raise `HTTPException(401)` on invalid/missing token. Remove `"demo-user"` fallback entirely.

### CRIT-3: Wallet Endpoints Have Zero Authentication
**File:** `app/api/routes/wallet.py` — ALL endpoints  
The `user_id` is a path parameter (`/wallet/{user_id}/...`). No `Depends(get_current_user_id)`, no token check. Anyone can read any user's balance, transfer their money, and view their transaction history by guessing/knowing their user_id.  
**Endpoints affected:**
| Method | Path | Auth |
|--------|------|------|
| GET | `/wallet/{user_id}/balance` | ❌ NONE |
| GET | `/wallet/{user_id}/info` | ❌ NONE |
| GET | `/wallet/{user_id}/transactions` | ❌ NONE |
| POST | `/wallet/transfer` | ❌ NONE |
| POST | `/wallet/admin/create` | ❌ NONE |
| POST | `/wallet/admin/reset` | ❌ NONE |

### CRIT-4: Admin Endpoints Without Admin Auth
**File:** `app/api/routes/admin.py`  
Several admin endpoints have NO `Depends(get_current_admin)`:
| Method | Path | Auth |
|--------|------|------|
| GET | `/admin/dashboard/overview` | ❌ NONE |
| GET | `/admin/analytics/*` | ❌ NONE |
| GET | `/admin/ml/performance` | ❌ NONE |
| GET | `/admin/reports/pending` | ❌ NONE |
| PUT | `/admin/reports/{id}/verify` | ❌ NONE |
| GET | `/admin/system/health` | ❌ NONE |

### CRIT-5: Demo Admin Login with Hardcoded Credentials
**File:** `app/api/routes/admin_auth.py` lines ~170-210  
```python
@router.post("/demo-login")
async def demo_login():
    # Creates admin with password "admin123"
```
**Impact:** Anyone can call `/admin/auth/demo-login` to get a valid admin JWT. Combined with CRIT-4, this gives full admin access.  
**Fix:** Remove the demo-login endpoint, or gate it behind an environment flag (`DEMO_MODE=true`).

### CRIT-6: OTP Leaked in API Response
**File:** `app/services/sms_service.py` lines ~50-60  
```python
# Fallback: return OTP in response for testing
return {"success": True, "otp": otp, "message": "Demo mode..."}
```
**Impact:** When Twilio is not configured (which is the default), the OTP is returned directly in the HTTP response, allowing anyone to authenticate as any phone number.  
**Fix:** Log OTP server-side only. Never include in HTTP response body.

---

## 3. File-by-File Audit

---

### `app/__init__.py` (5 lines)
Version string only. No issues.

---

### `app/config.py` (~65 lines)

| Item | Details |
|------|---------|
| **Hardcoded Secrets** | `JWT_SECRET_KEY = "jwt-secret-key-change-in-production"` (line ~23) |
| | `MONGODB_URL = "mongodb://localhost:27017"` — default, acceptable for dev |
| | `DATABASE_URL` defaults to local SQLite — acceptable for dev |
| **Missing:** | No `JWT_ALGORITHM` configuration (hardcoded "HS256" in deps.py) |
| **Missing:** | No token expiration configuration |
| **Good:** | Uses `pydantic_settings.BaseSettings` with `.env` file support |

---

### `app/main.py` (~160 lines)

| Item | Details |
|------|---------|
| **CORS** | `allow_origins=["*"]` — allows any origin. Should whitelist in production. |
| **Error Handling** | Global exception handler returns `{"detail": str(exc)}` — leaks internal error messages to clients. |
| **Good** | Includes lifespan with DB init/cleanup, health endpoint, test endpoints. |
| **Endpoints** | `GET /health`, `GET /test/db`, `POST /test/transaction` — test endpoints should be removed in production. |

---

### `app/api/deps.py` (~35 lines)

| Item | Details |
|------|---------|
| **Auth Bypass** | **CRITICAL** — Falls back to `"demo-user"` on any JWT failure (see CRIT-2). |
| **Token Validation** | Uses `jose.jwt.decode` with hardcoded `"HS256"` algorithm. |
| **Missing** | No token expiration check (`options={"verify_exp": False}` effectively). |

---

### `app/api/routes/auth.py` (~310 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| POST | `/auth/request-otp` | ❌ NONE | 200, 500 |
| POST | `/auth/verify-otp` | ❌ NONE | 200, 400 |
| POST | `/auth/register` | ❌ NONE | 200, 400, 500 |
| POST | `/auth/login` | ❌ NONE | 200, 401, 500 |
| POST | `/auth/firebase-verify` | ❌ NONE | 200, 401 |
| GET | `/auth/session/active` | ✅ Token | 200 |
| POST | `/auth/logout` | ✅ Token | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| In-memory OTP store | HIGH | `otp_store = {}` — OTPs lost on restart, not shared across workers. |
| In-memory session store | HIGH | `active_sessions = {}` — same issue. |
| OTP not rate-limited | MEDIUM | No limit on OTP requests per phone number. Can brute-force 6-digit OTP (1M combinations). |
| OTP never expires | MEDIUM | Stored with `expires` timestamp but never checked against it at verification time. |
| OTP not deleted after use | LOW | After successful verify, OTP remains in store (can be re-used). |
| Broad `except Exception` | MEDIUM | Lines ~50, ~120, ~160 — catches everything, may hide bugs. |
| Password handling | LOW | `register` and `login` just store/compare plain `password` field via DB, no hashing visible for user passwords (only admin passwords are hashed). |

---

### `app/api/routes/transaction.py` (~250 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| POST | `/transactions/assess-risk` | ✅ Token* | 200, 500 |
| POST | `/transactions/create` | ✅ Token* | 200, 400, 500 |
| GET | `/transactions/history` | ✅ Token* | 200 |
| POST | `/transactions/check-recipient` | ✅ Token* | 200 |

*\*Auth depends on `get_current_user_id` which falls back to "demo-user" (CRIT-2)*

| Issue | Severity | Details |
|-------|----------|---------|
| No amount validation | MEDIUM | `assess-risk` accepts any amount, including negative numbers. |
| Transaction creation race condition | MEDIUM | Creates transaction and deducts wallet balance in separate async calls — no atomicity. |
| `except Exception as e` | MEDIUM | Line ~80 — returns 500 with error details leaked. |

---

### `app/api/routes/wallet.py` (~130 lines)

**Endpoints:** See CRIT-3 above — ALL endpoints have ZERO authentication.

| Issue | Severity | Details |
|-------|----------|---------|
| No auth on any endpoint | CRITICAL | User ID is a path parameter — IDOR vulnerability. |
| Admin create/reset no auth | CRITICAL | Anyone can create wallets and reset balances. |
| Transfer endpoint | CRITICAL | `POST /wallet/transfer` — anyone can transfer money from any wallet. |

---

### `app/api/routes/fraud.py` (~350 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| POST | `/fraud/analyze` | ✅ Token* | 200, 500 |
| POST | `/fraud/report` | ❌ NONE | 200, 500 |
| GET | `/fraud/reports` | ✅ Token* | 200 |
| GET | `/fraud/trending-scams` | ❌ NONE | 200 |
| GET | `/fraud/community-stats` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| Report submission: no auth | HIGH | `user_id: str = None` default — anyone can submit fraud reports anonymously. |
| Fabricated community stats | HIGH | `total_amount_saved = total_amount * 10`, `users_protected = verified_reports * 15` — these are made-up multipliers, not real data. Misleads users about platform effectiveness. |
| `except Exception` | MEDIUM | Multiple broad catches that swallow errors. |

---

### `app/api/routes/guardian.py` (~220 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| POST | `/guardian/setup` | ✅ Token* | 200, 400, 500 |
| GET | `/guardian/list` | ✅ Token* | 200 |
| POST | `/guardian/{id}/accept` | ✅ Token* | 200, 404 |
| POST | `/guardian/{id}/decline` | ✅ Token* | 200, 404 |
| POST | `/guardian/transaction/{id}/approve` | ✅ Token* | 200, 404 |
| POST | `/guardian/transaction/{id}/reject` | ✅ Token* | 200, 404 |

| Issue | Severity | Details |
|-------|----------|---------|
| No authorization check | HIGH | `accept`/`decline`/`approve`/`reject` — any authenticated user (or "demo-user") can accept/decline any guardian request or approve/reject any transaction. No check that the caller is actually the guardian. |
| `except Exception` | MEDIUM | Multiple broad catches. |

---

### `app/api/routes/challenge.py` (~250 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| GET | `/challenges/list` | ✅ Token* | 200 |
| GET | `/challenges/daily` | ✅ Token* | 200 |
| GET | `/challenges/{id}` | ✅ Token* | 200, 404 |
| POST | `/challenges/{id}/submit` | ✅ Token* | 200, 404 |
| GET | `/challenges/leaderboard` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| Hardcoded challenge data | LOW | Sample challenges with `uuid4()` regenerated on every server restart — IDs are not stable. |
| Fake leaderboard | MEDIUM | Returns completely hardcoded fake user data. |
| No persistent state | LOW | Challenge progress is not persisted — restarts lose all progress. |

---

### `app/api/routes/admin.py` (~981 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| GET | `/admin/dashboard/overview` | ❌ NONE | 200 |
| GET | `/admin/analytics/fraud-trends` | ❌ NONE | 200 |
| GET | `/admin/analytics/risk-distribution` | ❌ NONE | 200 |
| GET | `/admin/analytics/geographic` | ❌ NONE | 200 |
| GET | `/admin/analytics/model-accuracy` | ❌ NONE | 200 |
| GET | `/admin/ml/performance` | ❌ NONE | 200 |
| GET | `/admin/ml/models` | ✅ Admin | 200 |
| POST | `/admin/ml/retrain` | ✅ Admin | 200 |
| PUT | `/admin/ml/config` | ✅ Admin | 200 |
| GET | `/admin/users` | ✅ Admin | 200 |
| GET | `/admin/users/{id}` | ✅ Admin | 200 |
| PUT | `/admin/users/{id}/status` | ✅ Admin | 200 |
| GET | `/admin/reports/pending` | ❌ NONE | 200 |
| PUT | `/admin/reports/{id}/verify` | ❌ NONE | 200 |
| GET | `/admin/activity-log` | ✅ Admin | 200 |
| GET | `/admin/admins` | ✅ Admin | 200 |
| POST | `/admin/admins` | ✅ Admin | 200 |
| DELETE | `/admin/admins/{id}` | ✅ Admin | 200 |
| GET | `/admin/system/health` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| Missing auth on 8 endpoints | CRITICAL | See CRIT-4. Dashboard, analytics, ML performance, pending reports, verify reports, and system health are all public. |
| Report verification: no auth | CRITICAL | `PUT /admin/reports/{id}/verify` can be called by anyone — allows spoofing report verification. |
| Hardcoded analytics data | MEDIUM | Most analytics endpoints return fabricated/random data rather than querying real databases. |
| Large file (981 lines) | LOW | Should be split into sub-routers. |

---

### `app/api/routes/admin_auth.py` (~250 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| POST | `/admin/auth/login` | ❌ NONE | 200, 401 |
| POST | `/admin/auth/logout` | ✅ Admin | 200 |
| GET | `/admin/auth/me` | ✅ Admin | 200 |
| POST | `/admin/auth/create-first-admin` | ❌ NONE | 200, 400 |
| POST | `/admin/auth/demo-login` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| Demo login | CRITICAL | See CRIT-5. Hardcoded password `"admin123"`, creates admin if none exists. |
| `create-first-admin` not gated | HIGH | Can be called anytime, not just during initial setup. Should check if any admins exist first (it does check, but returns 400 — someone could race to be first). |
| Admin JWT secret | MEDIUM | Uses same `JWT_SECRET_KEY` as user tokens — if one is compromised, both are. |

---

### `app/api/routes/contacts.py` (~170 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| GET | `/contacts/search-contacts` | ❌ NONE | 200 |
| GET | `/contacts/search-scammers` | ❌ NONE | 200 |
| GET | `/contacts/check-upi/{upi_id}` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| No authentication | MEDIUM | Contact and scammer data is publicly searchable. |
| UPI ID in path param | LOW | UPI IDs containing `@` may cause routing issues — should be query param. |

---

### `app/api/routes/intervention.py` (~200 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| WS | `/intervention/ws/{user_id}` | ❌ NONE | — |
| GET | `/intervention/check/{transaction_id}` | ❌ NONE | 200 |
| POST | `/intervention/resolve/{transaction_id}` | ❌ NONE | 200 |
| POST | `/intervention/cancel/{transaction_id}` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| No auth on any endpoint | HIGH | Anyone can connect to any user's WebSocket, resolve/cancel any intervention. |
| Bare `except: pass` | HIGH | Lines ~45, ~60 — silently swallows ALL exceptions in WebSocket send methods, including `CancelledError` and `KeyboardInterrupt`. |
| In-memory state | MEDIUM | All intervention state is in-memory — lost on restart. |

---

### `app/api/routes/security.py` (~280 lines)

**Endpoints:**
| Method | Path | Auth | Status Codes |
|--------|------|------|-------------|
| POST | `/security/analyze` | ❌ NONE | 200, 500 |
| GET | `/security/scam-education` | ❌ NONE | 200 |
| GET | `/security/scam-education/{type}` | ❌ NONE | 200 |

| Issue | Severity | Details |
|-------|----------|---------|
| No auth | MEDIUM | Security analysis is public — could be abused for reconnaissance. |
| Error details leaked | HIGH | `except Exception as e: ... detail=str(e)` — leaks internal errors including tracebacks. |
| Missing import guard | LOW | Imports `SecurityShield` which imports ML models — heavy module load on first request. |

---

### `app/db/database.py` (~150 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| SQLite fallback auto-detection | LOW | Falls back to SQLite with `aiosqlite` — acceptable for dev but should be explicit. |
| Auto-migration for missing columns | MEDIUM | `_ensure_columns` runs ALTER TABLE at startup — fragile, may fail on type mismatches. |
| Bare `except Exception` | LOW | Multiple catches during DB init — logs but continues, may leave DB in inconsistent state. |

---

### `app/db/models.py` (~300 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| No password hashing | MEDIUM | `User` model has no `password_hash` field — unclear how user passwords are stored. |
| Custom GUID type | LOW | Custom `GUID` TypeDecorator for cross-DB UUID support — complex but functional. |
| JSON fallback | LOW | `JSONType` stores as `Text` with JSON serialization on non-PostgreSQL — loses JSON query capabilities. |

---

### `app/db/mongodb_models.py` (~190 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Schema docs only | LOW | Contains schema definitions and helper classes — no actual operations that could have vulnerabilities. |
| No index definitions | LOW | Missing MongoDB index definitions for frequently queried fields. |

---

### `app/db/excel_database.py` (~333 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Race condition | HIGH | Concurrent read/write to Excel files via pandas — no file locking. Multiple requests can corrupt data. |
| UPI PIN stored as plaintext | HIGH | Demo wallets have PINs like `"1234"` stored in plain text in Excel. |
| Init at import time | MEDIUM | `init_excel_databases()` runs at module import — creates files and writes data during import, side effects on load. |
| `except Exception` on file I/O | MEDIUM | Catches all errors during Excel read/write, may silently corrupt data. |
| Hardcoded demo data | LOW | Pre-populated contacts and scammer entries — acceptable for demo. |

---

### `app/schemas/user.py` (~50 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Phone validation | GOOD | Validates phone number format with regex. |
| No password constraints | MEDIUM | `UserCreate` accepts any password — no minimum length, complexity, or hashing. |

---

### `app/schemas/transaction.py` (~60 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Amount validation | GOOD | `TransactionCreate` constrains `amount` to 0-500000. |
| No negative check | LOW | Lower bound is 0, not 0.01 — allows zero-amount transactions. |

---

### `app/schemas/ml_response.py` (~40 lines)

No issues — pure data schema.

---

### `app/schemas/fraud_report.py` (~30 lines)

No issues — pure data schema.

---

### `app/schemas/admin.py` (~50 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Password min length | GOOD | `AdminCreate` requires minimum 8 characters for admin passwords. |

---

### `app/services/sandbox_bank.py` (~300 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Race condition | HIGH | JSON file read/write with no file locking — concurrent transfers can cause lost updates or corrupted JSON. |
| No transaction atomicity | HIGH | Debit sender → credit receiver in two separate file writes — if crash occurs between them, money is lost. |
| No UPI PIN validation | MEDIUM | Transfer doesn't require or validate UPI PIN. |
| Negative balance possible | MEDIUM | Insufficient balance check exists, but race conditions could still allow overdraft. |
| File-based storage | MEDIUM | Not suitable for any concurrent usage beyond single-user testing. |

---

### `app/services/fraud_detection_service.py` (~672 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| In-memory user profiles | HIGH | `user_profiles = {}` — all user behavioral profiles lost on restart. |
| NLP scam detection | GOOD | Keyword-based scam detection with severity levels. |
| Sensor analysis integration | GOOD | Uses `SensorStressDetector` for coercion detection. |
| Broad `except` in ML calls | MEDIUM | Falls back to heuristics when ML fails — could mask systematic model failures. |
| Hardcoded thresholds | LOW | Risk thresholds hardcoded throughout — should be configurable. |

---

### `app/services/risk_assessment_service.py` (~120 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Silent MongoDB failure | HIGH | `except Exception: pass` — MongoDB logging failure is silently swallowed. If MongoDB is misconfigured, no ML features are ever logged, with zero indication. |
| No retry logic | MEDIUM | Failed ML model calls are not retried. |
| Timeout handling | LOW | No timeout on ML model inference — a hung model blocks the request indefinitely. |

---

### `app/services/notification_service.py` (~170 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| In-memory store | MEDIUM | All notifications stored in `{}` dict — lost on restart. |
| No pagination | LOW | `get_notifications` returns all notifications — could be large. |
| No auth integration | MEDIUM | Notifications are stored per user_id but never verified against the authenticated user. |

---

### `app/services/ai_intervention_service.py` (~350 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| In-memory state | MEDIUM | All intervention tracking in dicts — lost on restart. |
| No auth on actions | HIGH | Intervention resolve/cancel don't verify the caller is the transaction owner. |
| Question generation | GOOD | Context-aware intervention questions are well-designed. |

---

### `app/services/firebase_service.py` (~100 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Fallback allows bypass | HIGH | If Firebase is not configured, `verify_token` returns `{"uid": "demo-..."}` — effectively bypasses Firebase auth. |
| No error granularity | LOW | All Firebase errors caught and returned as generic failure. |

---

### `app/services/sms_service.py` (~75 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| OTP in response | CRITICAL | See CRIT-6. When Twilio not configured, OTP returned in HTTP response body. |
| Demo phone fallback | MEDIUM | `+1234567890` always succeeds — any OTP request for this number is auto-approved. |
| No rate limiting | MEDIUM | Can request unlimited OTPs for any phone number. |

---

### `app/ml/security_shield.py` (~737 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| MD5 for transaction IDs | LOW | Uses `hashlib.md5(...)` for generating transaction IDs — not a security concern here since it's not used for crypto, but SHA256 would be more appropriate. |
| Scam detection bypass | MEDIUM | Only checks UPI ID for scam keywords, not payer name or transaction description — easy to evade. |
| UPI handle whitelist | LOW | `valid_handles` list may be incomplete — legitimate UPI handles could be flagged. |
| Verification layer simulated | MEDIUM | Layer 4 (UPI verification) is entirely simulated with Excel data — no real UPI API integration. |
| Good design | GOOD | 7-layer sequential architecture is well-structured. Decision layer is rule-based (not AI), preventing AI manipulation. |

---

### `app/ml/pipeline/model_inference.py` (~320 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Model loading at init | MEDIUM | All 5 ML models loaded on first request — ~1-2 second cold start. Should lazy-load or pre-load. |
| Fallback heuristics | LOW | When trained models are unavailable, heuristic fallbacks maintain reasonable accuracy. |
| No model versioning at runtime | LOW | `model_versions` dict is hardcoded — doesn't reflect actual loaded model versions. |
| Good design | GOOD | Async pipeline with parallel model inference, latency tracking, and structured output. |

---

### `app/ml/pipeline/feature_engineering.py` (~240 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| No input validation | MEDIUM | `.get()` with defaults for everything — silently produces features from garbage input. |
| Division by zero guards | GOOD | Uses `max(..., 1)` pattern consistently — no division-by-zero risk. |

---

### `app/ml/pipeline/risk_aggregator.py` (~260 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Configurable thresholds | GOOD | Risk thresholds are configurable at init. |
| Weight adjustment logic | GOOD | Context-based weight adjustment (e.g., sensor weight increases when coercion detected). |
| Hardcoded vulnerability bonus | LOW | `vulnerability_bonus` factors hardcoded for elderly/beginner users — should be configurable. |

---

### `app/ml/pipeline/explanation_generator.py` (~220 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Multi-language support | GOOD | English, Hindi, Tamil, Telugu explanations. |
| Voice alert generation | LOW | Uses `gTTS` — requires internet connectivity for TTS. |
| No issues | — | Well-structured, pure logic. |

---

### `app/ml/models/xgboost_risk_scorer.py` (~200 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Trained model loading | GOOD | Loads from `.joblib` artifact, falls back to heuristic. |
| Heuristic fallback | GOOD | When no trained model, uses reasonable rule-based scoring. |
| No issues | — | Clean implementation. |

---

### `app/ml/models/lstm_behavioral_profiler.py` (~230 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| In-memory user profiles | MEDIUM | Per-user behavioral profiles in `{}` dict — lost on restart. |
| Actually GBT, not LSTM | LOW | Class named "LSTM" but actually uses Gradient Boosted Trees — misleading name. |
| No issues | — | Functional implementation with trained model support. |

---

### `app/ml/models/isolation_forest_anomaly.py` (~170 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Synthetic fallback data | LOW | Default model trains on random synthetic data — produces meaningless scores until real model is loaded. |
| No issues | — | Clean implementation, trained model loading works. |

---

### `app/ml/models/graph_neural_network.py` (~210 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Not a real GNN | LOW | Uses adjacency list + BFS, not a neural network. Name is misleading. |
| Demo graph is tiny | LOW | Fallback has only 5 demo fraudsters + 3 mules — won't detect anything real. |
| BFS is O(V+E) per call | MEDIUM | BFS runs on every request — could be slow on large graphs. Should pre-compute fraud distances. |
| Good design | GOOD | Community detection, fraud distance, mule account detection. |

---

### `app/ml/models/sensor_stress_detector.py` (~325 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| In-memory baselines | MEDIUM | Per-user sensor baselines in `{}` dict — lost on restart. |
| Purely heuristic | LOW | No trained model — entirely threshold-based. |
| Good design | GOOD | Accelerometer, typing, and touch analysis for coercion detection. |

---

### `app/ml/__init__.py` & `app/ml/models/__init__.py` & `app/ml/pipeline/__init__.py`

Package init files with imports. No issues.

---

### `app/services/__init__.py`

Empty init. No issues.

---

### `app/api/__init__.py` & `app/api/routes/__init__.py`

Router registration files. No issues.

---

### `backend/train_models.py` (~450 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Good pipeline | GOOD | Comprehensive training: XGBoost, Isolation Forest, GNN graph, behavioral model. |
| Eval metrics | GOOD | Logs ROC-AUC, PR-AUC, confusion matrix, feature importance. |
| No data validation | LOW | Assumes specific CSV schema without validation. |
| No hyperparameter tuning | LOW | Fixed hyperparameters — no cross-validation or grid search. |

---

### `backend/test_models.py` (~170 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| Good smoke tests | GOOD | Tests individual models and full pipeline with contrasting scenarios. |
| No unit test framework | LOW | Uses `assert` instead of `pytest` fixtures — functional but minimal. |

---

### `backend/requirements.txt`

| Issue | Severity | Details |
|-------|----------|---------|
| Pinned versions | GOOD | All versions pinned. |
| Heavy dependencies | LOW | `tensorflow>=2.16.0` and `torch>=2.1.0` are listed but NOT actually used anywhere. |
| `torch-geometric>=2.4.0` | LOW | Listed but GNN doesn't use PyTorch Geometric — uses plain adjacency lists. |

---

## 4. Cross-Cutting Concerns

### 4.1 SQL Injection

**Risk: LOW.** The codebase uses SQLAlchemy ORM with parameterized queries throughout. No raw SQL strings were found. All database queries use `session.execute(select(...).where(...))` pattern.

### 4.2 In-Memory State (Data Loss Risk)

The following data structures exist only in memory and are **lost on every server restart**:

| Store | File | Impact |
|-------|------|--------|
| `otp_store = {}` | `auth.py` | Active OTPs lost — users must re-request |
| `active_sessions = {}` | `auth.py` | Session tracking lost |
| `user_profiles = {}` | `fraud_detection_service.py` | Behavioral profiles lost — ML accuracy degrades |
| `notifications = {}` | `notification_service.py` | All notifications lost |
| `interventions = {}` | `ai_intervention_service.py` | Active interventions lost |
| `user_baselines = {}` | `sensor_stress_detector.py` | Sensor baselines lost |
| `user_profiles = {}` | `lstm_behavioral_profiler.py` | Behavioral history lost |

### 4.3 Race Conditions

| Location | Mechanism | Impact |
|----------|-----------|--------|
| `sandbox_bank.py` | JSON file read-modify-write without locking | Concurrent transfers can corrupt wallet data or cause double-spending |
| `excel_database.py` | Excel file read-modify-write without locking | Concurrent contact/scammer updates can lose data |
| `auth.py` OTP store | Dict operations are not atomic under async concurrency | Unlikely but possible key collision |

### 4.4 Error Handling Anti-Patterns

| Pattern | Files | Impact |
|---------|-------|--------|
| `except Exception: pass` | `risk_assessment_service.py`, `intervention.py` | Silently swallows errors — impossible to diagnose failures |
| `except: pass` (bare) | `intervention.py` WebSocket | Catches `SystemExit`, `KeyboardInterrupt` — suppresses shutdown signals |
| `except Exception as e: return {"error": str(e)}` | `main.py`, `security.py`, multiple routes | Leaks internal error details to API consumers |
| `except Exception: return "demo-user"` | `deps.py` | Auth bypass on any error |

### 4.5 Authentication Summary Matrix

| Route Group | Auth Mechanism | Coverage |
|-------------|---------------|----------|
| `/auth/*` | None (public) | Expected — login/register endpoints |
| `/transactions/*` | `get_current_user_id` | ⚠️ Falls back to "demo-user" |
| `/wallet/*` | **NONE** | ❌ Completely unprotected |
| `/fraud/*` | Mixed | ⚠️ Report submission has no auth |
| `/guardian/*` | `get_current_user_id` | ⚠️ No authorization checks |
| `/challenges/*` | `get_current_user_id` | ⚠️ Falls back to "demo-user" |
| `/admin/*` | Mixed `get_current_admin` | ❌ 8 endpoints unprotected |
| `/admin/auth/*` | Mixed | ❌ Demo-login endpoint |
| `/contacts/*` | **NONE** | ⚠️ Public data access |
| `/intervention/*` | **NONE** | ❌ Completely unprotected |
| `/security/*` | **NONE** | ⚠️ Public analysis |

### 4.6 Unused Dependencies

These are in `requirements.txt` but never imported anywhere in the backend code:
- `tensorflow>=2.16.0`
- `torch>=2.1.0`
- `torch-geometric>=2.4.0`
- `scipy==1.12.0`
- `aiohttp==3.9.1`
- `gtts==2.5.0` (imported in `explanation_generator.py` but only in an unused method)

---

## 5. Remediation Priority

### P0 — Must Fix Before Any Deployment

| # | Finding | Effort |
|---|---------|--------|
| 1 | Remove `"demo-user"` fallback from `deps.py` — raise 401 instead | 5 min |
| 2 | Move JWT secret to env variable with no default | 5 min |
| 3 | Remove `/admin/auth/demo-login` endpoint (or gate behind env flag) | 5 min |
| 4 | Add `Depends(get_current_user_id)` to ALL wallet endpoints | 15 min |
| 5 | Add `Depends(get_current_admin)` to all admin endpoints | 15 min |
| 6 | Remove OTP from SMS response body | 5 min |
| 7 | Add authorization checks to guardian accept/decline/approve/reject | 15 min |

### P1 — Fix Before Production

| # | Finding | Effort |
|---|---------|--------|
| 8 | Replace bare `except: pass` with specific exception handling | 30 min |
| 9 | Add `except Exception as e: log(e); return 500` without leaking error details | 30 min |
| 10 | Add file locking to `sandbox_bank.py` and `excel_database.py` (or migrate to DB) | 2 hrs |
| 11 | Move in-memory stores (OTP, sessions) to Redis | 2 hrs |
| 12 | Add OTP expiration checking and rate limiting | 1 hr |
| 13 | Hash user passwords (not just admin passwords) | 1 hr |
| 14 | Restrict CORS origins | 15 min |
| 15 | Add auth to intervention WebSocket and endpoints | 30 min |
| 16 | Remove test endpoints from production (`/test/db`, `/test/transaction`) | 5 min |

### P2 — Should Fix

| # | Finding | Effort |
|---|---------|--------|
| 17 | Remove fabricated community stats (×10, ×15 multipliers) | 15 min |
| 18 | Pre-compute GNN fraud distances instead of per-request BFS | 2 hrs |
| 19 | Add request validation for negative amounts | 15 min |
| 20 | Persist behavioral profiles to DB | 2 hrs |
| 21 | Separate admin/user JWT signing keys | 30 min |
| 22 | Remove unused dependencies from requirements.txt | 5 min |
| 23 | Rename misleading class names (LSTM → GBTBehavioralProfiler, GNN → GraphAnalyzer) | 15 min |
| 24 | Add MongoDB indexes for query performance | 30 min |

---

*Report generated by comprehensive manual code audit of all 48 backend Python files.*
