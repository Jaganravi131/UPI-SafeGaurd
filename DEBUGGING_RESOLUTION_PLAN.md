# UPI SafeGuard – Debugging & Resolution Plan

**Purpose:** Step-by-step plan to resolve all issues identified in `AUDIT_AND_RND.md`.  
**Use:** Follow phases in order; each task includes files, steps, and how to verify.

---

## Overview

| Phase | Focus | Est. effort | Blocks |
|-------|--------|-------------|--------|
| **Phase 1** | API contract & quick wins | 1–2 days | Nothing |
| **Phase 2** | Data & business logic | 2–3 days | Phase 1 for API paths |
| **Phase 3** | Unify risk pipeline & intervention | 2–3 days | Phase 1 |
| **Phase 4** | Security & robustness | 1–2 days | None |
| **Phase 5** | Frontend real integration | 1–2 days | Phase 3 |
| **Phase 6** | Observability & optional ML | Ongoing | None |

---

# Phase 1: API Contract & Quick Wins

*Goal: Fix broken HTTP contracts so frontend and backend agree. No business logic change yet.*

---

## Task 1.1 – Transaction create endpoint path

**Issue (Audit 1.7):** Frontend calls `POST /transactions/`, backend has `POST /transactions/create`.

**Option A – Change frontend (recommended):**

| Step | Action |
|------|--------|
| 1 | Open `frontend/src/api/client.ts`. |
| 2 | Find `transactionAPI.create`. Change `api.post('/transactions/', data)` to `api.post('/transactions/create', data)`. |
| 3 | Save. |

**Option B – Add backend route:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/transaction.py`. |
| 2 | Add `@router.post("/", response_model=TransactionResponse)` that accepts the same body as `create` and calls the same logic (or delegate to a shared function). |
| 3 | Keep existing `@router.post("/create", ...)`. |

**Verification:**

- From frontend or Postman: `POST /api/v1/transactions/create` with `{ "recipient_upi": "test@paytm", "amount": 100 }` → 200 and transaction in response.
- If you use Option A, run payment flow in UI and confirm “Pay” creates a transaction (no 404).

---

## Task 1.2 – Transaction history endpoint and params

**Issue (Audit 1.6):** Frontend uses `GET /transactions/` with `skip`/`limit`; backend has `GET /transactions/history` with `page`/`page_size`.

**Option A – Backend supports both (recommended for compatibility):**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/transaction.py`. |
| 2 | Add `@router.get("/", response_model=TransactionHistory)` with query params `skip: int = 0`, `limit: int = 20`. |
| 3 | Inside handler: compute `page = (skip // limit) + 1` and `page_size = limit`, then reuse existing history query logic (or call a shared function that takes offset/limit). Return same `TransactionHistory` shape. |
| 4 | Keep `GET /transactions/history` for backward compatibility. |

**Option B – Frontend only:**

| Step | Action |
|------|--------|
| 1 | Open `frontend/src/api/client.ts`. |
| 2 | Change `getHistory: (skip?, limit?) => api.get('/transactions/', { params: { skip, limit } })` to `getHistory: (page = 1, pageSize = 20) => api.get('/transactions/history', { params: { page, page_size: pageSize } })`. |
| 3 | Find all call sites of `transactionAPI.getHistory(skip, limit)` and change to page-based (e.g. `getHistory(page, pageSize)`). |

**Verification:**

- `GET /api/v1/transactions/history?page=1&page_size=10` → 200 and list of transactions.
- If Option A: `GET /api/v1/transactions/?skip=0&limit=10` → 200 and same shape.
- UI Transaction History page loads without error.

---

## Task 1.3 – Production error response (no stack trace)

**Issue (Audit 2.5):** Global exception handler may expose traceback to client when `DEBUG` is true.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/main.py`. |
| 2 | Find `@app.exception_handler(Exception)` and the `JSONResponse` that returns error details. |
| 3 | In the response body, include `traceback` (or detailed `type`/`error`) only when `settings.DEBUG is True`. When `DEBUG` is False, return only `{"detail": "Internal server error"}` (or a generic message) and log the full exception server-side. |
| 4 | Ensure production env sets `DEBUG=false` (or `DEBUG=0`). |

**Verification:**

- With `DEBUG=true`: trigger a 500 (e.g. raise in a route) → response can include detail for dev.
- With `DEBUG=false`: same request → response has no stack trace; full error only in server logs.

---

# Phase 2: Data & Business Logic

*Goal: Single source of truth for scammers and wallet; fix create+transfer wiring.*

---

## Task 2.1 – Load scammer list from Excel at startup

**Issue (Audit 1.2):** `known_scammers.xlsx` is never loaded into `FraudDetectionService.scammer_list`.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/main.py`, inside `lifespan` after `init_excel_databases()`. |
| 2 | Import: `from app.db.excel_database import ExcelDatabase` and `from app.services.fraud_detection_service import get_fraud_detection_service`. |
| 3 | After Excel init, add: `scammers = ExcelDatabase.get_all_scammers()` then `if scammers: get_fraud_detection_service().load_scammer_list([s.get('upi_id') for s in scammers if s.get('upi_id')])`. |
| 4 | (Optional) Also load UPI IDs from DB with `report_count > 0` (e.g. query `UPIProfile` or `FraudReport`) and add to the same list so DB-reported scammers are included. |

**Verification:**

- Start backend; logs should show Excel ready then no error.
- Call `POST /api/v1/fraud/analyze` with `recipient_upi` set to one of the UPI IDs in `known_scammers.xlsx` (e.g. `lottery.winner@scam`) → response should show high risk / known scammer alert.

---

## Task 2.2 – Single wallet store (sandbox JSON as source of truth)

**Issue (Audit 1.3, 1.4):** Excel wallets and sandbox JSON both exist; transaction create does not update wallet.

**Decision:** Use **sandbox JSON** (`sandbox_data/wallets.json`) as the single source for balance and wallet history. Excel wallet usage for “balance” should be removed or deprecated.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Identify every place that calls `ExcelDatabase.get_wallet` or `ExcelDatabase.update_wallet_balance`. (Likely in fraud or contacts or legacy code; wallet route already uses `sandbox_bank`.) |
| 2 | Replace with `sandbox_bank.get_wallet(user_id)` / `sandbox_bank.update_balance(...)` where appropriate. If current Excel API is phone-keyed, introduce a mapping phone → user_id or change callers to use user_id. |
| 3 | Ensure `backend/app/api/routes/wallet.py` uses only `get_wallet`, `get_balance`, `transfer_money` from `sandbox_bank`. No Excel. |
| 4 | (Optional) Add a short comment in `excel_database.py` that `WALLETS_FILE` / wallet methods are deprecated for balance; sandbox is source of truth. |

**Verification:**

- Create a user/wallet via wallet API; check `sandbox_data/wallets.json` for that user. Balance shown in UI matches.
- Do not use Excel for any balance display or debit in the main flow.

---

## Task 2.3 – Wire transaction create to sandbox transfer

**Issue (Audit 1.4):** `POST /transactions/create` does not debit wallet; wallet transfer does not create transaction record.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/transaction.py`, function `create_transaction`. |
| 2 | After you have determined that the transaction is allowed (not blocked, and guardian approved if required), and **before** or **after** `db.add(transaction)` and `db.commit()`: call sandbox transfer. Use `from app.services.sandbox_bank import transfer_money, get_wallet`. Get sender UPI from `get_wallet(user_id)` (e.g. `phone_number + "@upisafeguard"`). Call `await transfer_money(sender_user_id=user_id, sender_upi=..., recipient_upi=request.recipient_upi, amount=request.amount, note=request.purpose or "", risk_score=risk_result.get("ensemble_score", 0))`. |
| 3 | If `transfer_money` raises (e.g. insufficient balance), roll back the DB transaction and return 400 with a clear message. |
| 4 | Only perform transfer when status will be `COMPLETED` (not when blocked or guardian_pending). For blocked/pending, do not debit wallet. |

**Verification:**

- Create transaction for a user that has a sandbox wallet; status COMPLETED. Check wallet balance decreased and `sandbox_data/transactions.json` has the debit. DB `transactions` table has the same transaction.
- Create transaction that is blocked by risk → wallet balance unchanged.

---

## Task 2.4 – Transaction history total count fix

**Issue:** In `get_transaction_history`, total count is computed by loading all transactions into memory (`len(count_result.scalars().all())`), which is inefficient and can be wrong if query is filtered.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/transaction.py`, `get_transaction_history`. |
| 2 | Build the same filter (user_id, status_filter) and run a count query (e.g. `select(func.count(Transaction.id))`) with that filter, instead of selecting all rows. Use result for `total_count`. |
| 3 | Keep pagination (offset/limit) for the list query. |

**Verification:**

- `GET /transactions/history?page=1&page_size=5` returns 5 items and `total_count` equal to actual total for that user/filter.

---

# Phase 3: Unify Risk Pipeline & Intervention

*Goal: One risk API for payment flow; trigger intervention when risk is high; backend pushes via WebSocket.*

---

## Task 3.1 – Make assess-risk the single risk API and add intervention trigger

**Issue (Audit 1.1, 1.5):** PaymentFlow uses `fraud/analyze`; intervention is never triggered from assess-risk.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/transaction.py`, `assess_transaction_risk`. |
| 2 | After `risk_service.assess_transaction(...)` and before sending notifications, check if `result["risk_level"]` is in `("high", "critical")` or if `result["ensemble_score"] >= 0.5` (or use the same threshold as intervention agent). |
| 3 | If so, call the intervention agent: `from app.services.ai_intervention_service import intervention_agent` and `intervention = await intervention_agent.analyze_and_intervene(transaction_id=result["transaction_id"], user_id=user_id, risk_score=result["ensemble_score"], risk_factors={"risk_factors": result.get("risk_factors", [])}, transaction_data={"recipient_upi": request.recipient_upi, "amount": request.amount, "is_new_recipient": transaction_data.get("is_new_recipient", True), "call_active": request.call_active})`. Then `from app.api.routes.intervention import ws_manager` and `await ws_manager.send_intervention(user_id, intervention)`. |
| 4 | Optionally add to response a flag `intervention_required: true` and include `intervention_id` / summary when intervention was created, so the frontend can show the modal even without WebSocket. |

**Verification:**

- Call `POST /transactions/assess-risk` with high-risk payload (e.g. known scammer UPI, or large amount + new recipient). Response includes high risk and, if WebSocket client is connected, client receives an intervention message.

---

## Task 3.2 – Fraud analyze reuses ML pipeline (optional but recommended)

**Issue (Audit 1.1):** Two pipelines; PaymentFlow currently calls `fraud/analyze`.

**Option A – Route PaymentFlow to assess-risk (recommended):**  
Do not change `fraud/analyze`; in Phase 5 change the frontend to call `transactionAPI.assessRisk()` in the payment flow and use that response for risk + intervention. Then both “Check Safety” and “Create transaction” use the same pipeline.

**Option B – Make fraud/analyze call ML pipeline:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/fraud.py`, `analyze_transaction`. |
| 2 | Build `transaction_data`, `user_profile`, `recipient_profile` in the same shape as in `transaction.py` (use or reuse helpers from transaction route). |
| 3 | Call `get_risk_assessment_service().assess_transaction(transaction_data, user_profile, recipient_profile, request.sensor_data)`. |
| 4 | Map the result to `TransactionAnalysisResponse`: risk_score from `ensemble_score`, risk_level, explanations from `risk_factors`, and set `requires_ai_intervention` from recommended_action or threshold. Keep existing rule-based + NLP from FraudDetectionService as an extra check or merge alerts into explanations. |

**Verification:**

- `POST /fraud/analyze` returns ensemble risk and per-model-style factors; behavior consistent with `assess-risk`.

---

## Task 3.3 – Intervention stats from real data (or DB stub)

**Issue (Audit 2.7):** `get_intervention_stats()` returns hardcoded numbers.

**Steps (minimal – remove fake numbers):**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/api/routes/intervention.py`, `get_intervention_stats`. |
| 2 | Replace hardcoded `today` and `outcomes` with: `active_count = len(intervention_agent.active_interventions)`, and for today/outcomes use `{"total_interventions": 0, "advisory": 0, "warning": 0, "blocking": 0, "critical": 0}` and `{"transactions_blocked": 0, "user_proceeded": 0, "user_cancelled": 0, "frauds_prevented": 0, "amount_saved": 0}` until you have a DB. |
| 3 | (Optional) Add a table `intervention_events` (id, user_id, transaction_id, level, created_at, resolved_at, outcome, amount) and persist when an intervention is created/resolved; then aggregate here. |

**Verification:**

- `GET /api/v1/intervention/stats` returns `active_interventions` = current count and zeros for the rest (or real aggregates if DB added).

---

# Phase 4: Security & Robustness

*Goal: Safe defaults and graceful degradation for Redis/Mongo.*

---

## Task 4.1 – JWT secret and DEBUG from env

**Issue (Audit 2.5):** Default JWT secret and DEBUG in code.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/config.py`. Ensure `JWT_SECRET_KEY` and `DEBUG` are read from environment (they likely already are via pydantic-settings). |
| 2 | In `backend/.env.example`, add clear comments: `# REQUIRED in production: set JWT_SECRET_KEY to a long random value` and `DEBUG=false`. |
| 3 | In deployment docs or README, state that production must set `JWT_SECRET_KEY` and `DEBUG=false`. |

**Verification:**

- With `JWT_SECRET_KEY=another-secret` and `DEBUG=false` in `.env`, app starts and does not expose internals on 500.

---

## Task 4.2 – Redis unavailable: set client to None and guard usages

**Issue (Audit 2.3):** If Redis fails, `redis_client` may be undefined or raise; code using `get_redis()` may not check for None.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/db/database.py`. In `init_redis()`, wrap in try/except: on failure set `redis_client = None` and log. |
| 2 | In `close_connections`, only close `redis_client` if it is not None. |
| 3 | Search the codebase for `get_redis()` or `redis_client`. In each usage, if Redis is optional (e.g. rate limit, cache), check `if redis_client:` before using; otherwise skip or use in-memory fallback. |

**Verification:**

- Start app with Redis stopped; app should start and run. Any feature that needs Redis should degrade (e.g. no rate limit or no cache) without crashing.

---

## Task 4.3 – MongoDB connection timeout and optional features

**Issue (Audit 2.2):** MongoDB connection can hang; ML logging fails silently.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/db/database.py`. When creating `AsyncIOMotorClient(settings.MONGODB_URL)`, add `serverSelectionTimeoutMS=5000` (or similar) so init fails fast if Mongo is down. |
| 2 | In `init_mongodb()`, on exception set `mongo_db = None` and log. In `get_mongodb()`, return that (possibly None) value. |
| 3 | In `RiskAssessmentService._log_ml_features`, the code already has try/except; ensure it checks `if mongo_db is None: return` at the start so no code path assumes Mongo exists. |

**Verification:**

- Start with wrong Mongo URL or Mongo down; app starts; ML assessment still works; no crash when logging features.

---

## Task 4.4 – Persist real ML features in _log_ml_features

**Issue (Audit 2.2):** `features={}` is always passed; no real feature vector stored.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `backend/app/services/risk_assessment_service.py`, `assess_transaction`. The method already gets `result` from `model_inference.assess_risk(...)`. The inference layer has access to the engineered features from `feature_engineering.extract_all_features(...)` (called inside `model_inference.assess_risk`). |
| 2 | Either (a) return the extracted `features` dict from `model_inference.assess_risk` in the result, or (b) in `risk_assessment_service.assess_transaction` call feature_engineering again with the same inputs to get the features dict. |
| 3 | Pass that `features` dict into `_log_ml_features(..., features=result.get("features") or {})` and in `_log_ml_features` pass it to `MLFeaturesDocument.create(..., features=features, ...)`. |
| 4 | Ensure `MLFeaturesDocument.create` in `mongodb_models.py` accepts and stores `features` (it already has a `features` field). |

**Verification:**

- After a transaction assess-risk, if Mongo is up, a document in `ml_features` has non-empty `features` (or the keys you expect).

---

# Phase 5: Frontend – Real Integration

*Goal: PaymentFlow uses real risk API and shows real intervention; no fake “5 models” animation from random numbers.*

---

## Task 5.1 – PaymentFlow: call assess-risk and use real scores

**Issue (Audit 3.1):** PaymentFlow simulates ML with `Math.random()` and only calls `fraud/analyze`.

**Steps:**

| Step | Action |
|------|--------|
| 1 | Open `frontend/src/pages/PaymentFlow.tsx`. Locate the “Check Safety” / “Verify” flow and the `useEffect` that runs when `step === 'ml_analysis'` and animates per-model scores with `Math.random()`. |
| 2 | Change flow: On “Check Safety”, call `transactionAPI.assessRisk({ recipient_upi: upiId, amount: parseFloat(amount), purpose: note, call_active: isOnCall })` instead of (or in addition to) `fraudAPI.analyzeTransaction`. Use the response as the source of truth for risk. |
| 3 | Map response to UI: `xgboost_score`, `lstm_score`, `isolation_forest_score`, `gnn_score`, `sensor_score` (or equivalent) to the 5 model tiles. Use these values for the “score” and derive verdict (safe/warning/danger) from thresholds (e.g. score &gt; 70 → danger). |
| 4 | Remove or disable the `setTimeout` + `Math.random()` per-model simulation; either show a loading state until the API returns, or stream/display backend scores as you receive them. |
| 5 | Set `finalRiskScore` and safety result from `response.data.ensemble_score` and `response.data.risk_level` / `response.data.risk_factors`. |

**Verification:**

- Click “Check Safety” on payment page; one request to `POST /transactions/assess-risk`; UI shows five model scores that match the response; final risk and message match backend.

---

## Task 5.2 – PaymentFlow: show intervention from response or WebSocket

**Issue (Audit 1.5):** Intervention never shown in main flow.

**Steps:**

| Step | Action |
|------|--------|
| 1 | In the same `assessRisk` response handling, if backend returns `intervention_required: true` and an `intervention` object (from Task 3.1), open `AIInterventionModal` with that payload. |
| 2 | (Optional) Connect to `wss://.../api/v1/intervention/ws/{user_id}` when the user is on the payment screen (e.g. when step is 'input' or 'review'). On message type `intervention`, open the modal with `message.data`. |
| 3 | Ensure “Proceed” / “Cancel” in the modal call `POST /intervention/resolve` or `DELETE /intervention/cancel/{id}` as per existing API, and then continue or abort the payment. |

**Verification:**

- Trigger a high-risk assess-risk; modal appears with backend-generated intervention (or WebSocket message). Resolve/cancel updates state and payment flow accordingly.

---

## Task 5.3 – Transaction history page uses correct API

**Steps:**

| Step | Action |
|------|--------|
| 1 | Find the page that shows transaction history (e.g. TransactionHistory.tsx or Dashboard). Ensure it uses `transactionAPI.getHistory(page, pageSize)` (or `getHistory(skip, limit)` if you kept Option A in Task 1.2). |
| 2 | Ensure the backend route used returns the same shape the frontend expects (list of transactions, total count, pagination fields). |

**Verification:**

- Transaction history page loads and paginates without 404 or empty list when data exists.

---

# Phase 6: Observability & Optional ML (Ongoing)

- **Intervention events in DB:** Add `intervention_events` table and persist create/resolve; use for Task 3.3 stats.
- **User ID from JWT:** Add a dependency that parses JWT and sets `user_id` for transaction and wallet routes; use it in all relevant endpoints.
- **Wallet auth:** Require JWT for wallet routes; restrict to own `user_id` (or admin).
- **Training pipeline:** Add a script that loads Kaggle (or other) transaction/fraud CSV, maps columns to your feature schema, builds labels, and calls `XGBoostRiskScorer.train()` / `IsolationForestAnomaly.fit()`; save artifacts and load in app (see AUDIT and R&D doc).

---

# Dependency Summary

```
Phase 1 (API + quick wins) ──┬──► Phase 2 (data, wallet, create+transfer)
                             └──► Phase 3 (risk + intervention)
                                          │
Phase 4 (security, Redis/Mongo, ML log)   │
                                          ▼
                             Phase 5 (frontend real API + intervention UI)
                                          │
                             Phase 6 (auth, DB stats, training) – optional
```

---

# Verification Checklist (E2E)

After completing Phases 1–5, run through:

- [ ] Login (or demo login) and open Payment flow.
- [ ] Enter UPI ID (e.g. from contacts or a known scammer from Excel). Enter amount and note.
- [ ] Click “Check Safety”. One request to `POST /transactions/assess-risk`; UI shows 5 model scores from response; risk level and message match.
- [ ] For a high-risk payload, intervention modal appears (from response or WebSocket); resolve or cancel works.
- [ ] Click “Pay” / “Confirm”; request goes to `POST /transactions/create`; transaction appears in history; sandbox wallet balance decreases.
- [ ] Transaction history page loads and shows the new transaction with correct pagination.
- [ ] Backend starts with Redis and Mongo down; no crash; risk and payment still work (with degraded logging/cache if applicable).

Use this plan together with `AUDIT_AND_RND.md` for prioritization and context.
