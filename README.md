# UPI SafeGuard — AI-Powered UPI Fraud Prevention Platform

[![CI](https://github.com/Jaganravi131/UPI-SafeGaurd/actions/workflows/ci.yml/badge.svg)](https://github.com/Jaganravi131/UPI-SafeGaurd/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.12+-blue)
![Java](https://img.shields.io/badge/java-21-orange)
![React](https://img.shields.io/badge/react-18-61dafb)
![License](https://img.shields.io/badge/license-MIT-green)

**UPI SafeGuard** is a full-stack digital-payments safety platform for India's UPI ecosystem. Every transaction is scored in real time by a machine-learning risk engine trained on PaySim-style and behavioral data, and users are protected end-to-end — from pre-payment warnings and mandatory guardian approvals down to post-payment fraud reporting, all delivered in 12 Indian languages by a Groq-powered (LLaMA 3.3 70B) multilingual AI advisor.

> **Payments in SafeGuard are sandbox transactions.** The platform maintains full double-entry ledger semantics (sender debit, recipient credit, batch balances, daily limits) but moves no real money, so the entire product can be demonstrated safely.

---

## Live Deployment

| Tier | URL | Platform |
| --- | --- | --- |
| Frontend (user + admin console) | **https://upi-safe-gaurd.vercel.app** | Vercel |
| REST API (`/api/v1/*`) | https://upi-safeguard-backend.onrender.com | Render (Docker) |

- The Vercel deployment proxies `/api/v1/*` to the Render service through the rewrites in [`frontend/vercel.json`](frontend/vercel.json) — the browser always talks to the same origin, so no CORS and no `VITE_API_BASE_URL` is needed.
- The backend runs on Render's free tier and sleeps after ~15 minutes of inactivity; the first request after sleep can take 30–60 seconds to serve.
- Every push to `main` redeploys both tiers automatically (Vercel detects frontend changes; Render is redeployed manually or via the [`render.yaml`](render.yaml) Blueprint).

---

## Features

### For users
| Area | Highlights |
| --- | --- |
| Payments | Peer-to-peer transfers, request money, bill payments, QR scan/pay, split bills — with per-request risk gating |
| Risk engine | Real-time ML scoring (XGBoost on PaySim-derived features + behavioral LightGBM), plain-language reasons, safety tips, education links |
| OTP + identity | Server-side issued & stored OTPs, phone/email verification, demo-friendly flow with **no Firebase requirement** |
| Wallet | `/wallet` ledger with balance, daily limits, top-ups, and transaction history mirroring bank semantics |
| Guardian mode | Configurable amount thresholds; high-risk payments require guardian approval before release |
| Fraud reporting | One-tap scam reports feeding an admin review workflow and recipient risk lookups |
| AI advisor | "SafeGuard AI" chatbot (Groq LLaMA 3.3 70B) answers fraud questions, uses the user's real transaction context, supports 12 languages |
| Accessibility | Full app translation (12 Indian languages), TTS-ready voice alerts, simplified copy for first-generation users |
| Anti-scam gameplay | Security challenges, leaderboards, badges |

### Admin console (`/admin/login`)
Email/password login with role-based access (`super_admin`, `admin`, `analyst`, `support`):
- **Dashboard** — platform-wide users, transactions, fraud-report and risk metrics
- **Fraud reports** — the full queue of user-submitted reports; filter, review, resolve, export (CSV/Excel)
- **Users** — search, inspect, edit, deactivate, adjust security scores, export
- **Analytics** — risk distribution over time, fraud-type breakdowns
- **ML** — model performance, versions, retrain triggers, ensemble weights
- **System** — health checks, logs, activity audit trail

---

## Architecture

```
                          ┌─────────────────────────────┐
                          │  React 18 + Tailwind SPA    │
                          │  (User app · Admin console) │
                          └──────────┬──────────────────┘
                                     │  same-origin /api/v1
                                     ▼
                 ┌────────────────────────┬─────────────────────────┐
                 │  FastAPI backend       │  Spring Boot core       │
                 │  (port 8000)           │  backend (port 8081)    │
                 │  auth/OTP, wallet,     │  Java 21 · wallet,      │
                 │  admin, AI, fraud      │  profile, payments      │
                 └───────────┬────────────┴───────────┬─────────────┘
                             │ HTTP (USE_REMOTE       │ HTTP
                             │ _RISK_SERVICE)          │
                             ▼                        ▼
                        ┌─────────────────────────────────┐
                        │  ai-service (port 8001)         │
                        │  XGBoost + LightGBM risk models │
                        │  POST /v1/assess · /v1/model-   │
                        │  info                           │
                        └─────────────────────────────────┘
                             │
                       Groq LLaMA 3.3 70B  (translation · advisor · voice)
```

**Two-backend migration.** The Python FastAPI server (`backend/`) is the *transitional* service currently serving production. `core-backend/` (Spring Boot, Java 21) is being built out as the long-term production core — it reproduces the FastAPI contracts exactly (snake_case payloads, `{detail}` error bodies, bearer semantics) while delegating ML scoring to the Python `ai-service` over HTTP. The FastAPI code stays in the repo as the API contract reference.

### Repository layout

```
frontend/          React 18 + TypeScript + Vite + Tailwind + framer-motion
  src/api/         Typed axios client (full API inventory)
  src/pages/       User app + Admin* console pages
  vercel.json      SPA fallback + /api/v1 proxy rewrites (live)

backend/           FastAPI backend (transitional; the API contract reference)
  app/api/routes/  auth, transaction, wallet, fraud, guardian, challenge,
                   admin, admin_auth, ai …
  app/services/    OTP, Groq AI (LLaMA 3.3), sandbox bank, Excel scammer DB
  ai_service/      Standalone FastAPI ML service (risk scoring)
  train_*.py       PaySim (XGBoost) + behavioral (LightGBM) model training
  tests/           Pytest suite (CI)

core-backend/      Spring Boot service — production core (Java 21)
  ai/              Groq client + 8 /ai endpoints (1:1 port of ai.py)
  intervention/    Agentic intervention engine (1:1 port of ai_intervention_service.py)
  challenges/     Gamification endpoints (1:1 port of challenge.py)
  cache/           Redis / in-process drivers: rate limiting + shared state
  events/          Kafka domain events (transactions, fraud, interventions)
  wallet/ payment/ Double-entry wallet commands & payment flow
  web/             Controllers in FastAPI-compatible shapes
  persistence/     JPA entities (H2 locally, PostgreSQL in prod)

docs/              Build plan, full-stack architecture, system design, API guide, model charts
docker-compose.yml Full local topology (7 services: + Redis & KRaft Kafka)
render.yaml        Render Blueprint for the backend
```

---

## Quick Start (Docker — recommended)

```bash
git clone https://github.com/Jaganravi131/UPI-SafeGaurd.git
cd UPI-SafeGaurd
docker compose up --build
```

| Service | URL / port |
| --- | --- |
| Frontend | http://localhost:3000 |
| FastAPI backend | http://localhost:8000 (OpenAPI at `/docs`) |
| ai-service (ML) | http://localhost:8001 (`/docs`) |
| Spring core-backend | http://localhost:8081 (health at `/actuator/health`) |
| PostgreSQL | host port `5433` |

Sign-up issues an OTP; with `EXPOSE_DEMO_OTP=true` (default in the compose file) the code is surfaced in the UI. Databases persist across rebuilds: SQLite in the `sqlite-data` volume for the FastAPI backend and PostgreSQL volume for the core backend.

---

## Local Development (without Docker)

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server, API calls hit same-origin /api/v1 — proxy to backend
npm run build      # type-check (tsc) + production bundle
npm run lint       # strict ESLint, zero warnings allowed
```

### FastAPI backend
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # POSIX: source .venv/bin/activate
pip install -r requirements.txt
python -m pytest                                  # full test suite
uvicorn app.main:app --reload --port 8000
```

### ML ai-service
```bash
cd backend
uvicorn ai_service.main:app --reload --port 8001
# optional: retrain models
python train_paysim.py && python train_behavioral_lgb.py
```

### Spring Boot core-backend
```bash
cd core-backend
./mvnw test          # full JUnit suite (Windows: .\mvnw.cmd test)
./mvnw spring-boot:run
```
Runs on H2 in-memory by default; point `DATABASE_URL` at PostgreSQL for a production-like store (Flyway migrations included).

---

## Configuration

The `.env.example` files document every variable. Key settings:

### FastAPI backend (`backend/.env`)
| Variable | Purpose |
| --- | --- |
| `JWT_SECRET_KEY` | **Required.** HS256 secret for user & admin session tokens |
| `ADMIN_DEFAULT_PASSWORD` | Password assigned to the bootstrap/demo admin account |
| `EXPOSE_DEMO_OTP` | Surfacing demo OTPs in the UI — **never enable in production** |
| `POSTGRES_URL` / `REDIS_URL` / `MONGODB_URL` | Optional persistence upgrades (SQLite fallback keeps demos zero-config) |
| `TWILIO_*` | Optional SMS OTP delivery; otherwise the OTP is logged server-side only |
| `GROQ_API_KEY`, `GROQ_MODEL` | Enables the LLM features (`/ai/*`); absent → deterministic demo replies (with `DEMO_AI_FALLBACK=true`) or 503 |
| `USE_REMOTE_RISK_SERVICE`, `AI_SERVICE_URL` | Route risk scoring to the `ai-service` container |

### Spring Boot core-backend (`application.yml`, env-overridable)
| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | in-memory H2 (PostgreSQL mode) | Production PostgreSQL JDBC URL |
| `AI_SERVICE_URL` | `http://localhost:8001` | ML risk-scoring service |
| `GROQ_API_KEY` / `GROQ_MODEL` / `GROQ_TIMEOUT_MS` | *(empty)* / `llama-3.3-70b-versatile` | AI surface, identical semantics to the Python service |
| `DEMO_AI_FALLBACK` | `false` | `/ai/chat` demo guidance instead of 503 when unkeyed |

### Frontend
Fully config-free in production — the Vercel proxy rewrites handle it. For self-hosted deployments set a reverse proxy that forwards `/api/v1/*` to the backend.

---

## Authentication & Security Model

- **Users** receive JWTs (HS256, 24 h) after phone/email OTP verification. OTP codes are generated, stored, and validated **server-side only** (Redis → SQLite backends; a JPA table in the Spring service) — never returned in plaintext except through the explicitly gated demo flag.
- **Admins** use a separate JWT (`type: "admin"`, 12 h) issued by `/api/v1/admin/auth/login`; every admin route validates the bearer token and the caller's role. First admin can be bootstrapped once via `/api/v1/admin/auth/create-first-admin` when the `admins` table is empty, and a demo login endpoint auto-creates `admin@upisafeguard.com` for local demos.
- **Risk decisions** are enforced server-side: payments above guardian thresholds are held for approval, and blocked/critical-risk transactions never debit the ledger.
- **Rate limiting** (`RATE_LIMIT_PER_MINUTE`) protects OTP endpoints, and every protective flag (`EXPOSE_DEMO_OTP`, `DEMO_AI_FALLBACK`) defaults to the safe value.
- **Sandbox ledger** — all balances are double-entry bookkeeping inside PostgreSQL/SQLite; no real payment processor is ever called.

---

## API Surface (selected)

All endpoints live under `/api/v1`. The authoritative reference is the deployed OpenAPI (`/docs`) and [`docs/PROJECT_ARCHITECTURE_AND_API_GUIDE.md`](docs/PROJECT_ARCHITECTURE_AND_API_GUIDE.md).

| Group | Endpoints |
| --- | --- |
| Auth & OTP | `POST /auth/register`, `POST /auth/otp/request` · `verify`, `POST /auth/login`, `GET /users/me` |
| Wallet | `GET /wallet/balance/{userId}` · `info` · `transactions`, `POST /wallet/transfer/{userId}`, `POST /wallet/topup/{userId}` |
| Payments & risk | `POST /transactions/create`, risk assessment flow, `GET /risk/{transactionId}` |
| AI (Groq LLM) | `GET /ai/languages`, `GET /ai/suggested-prompts`, `POST /ai/translate` · `translate-alerts` · `translate-ui` · `explain-scam` · `chat` · `voice-alert` |
| Fraud | `POST /fraud/reports`, `GET /fraud/recipients/{upi}/check` |
| Guardian | invitations, link, pending approvals, thresholds |
| Admin | `POST /admin/auth/login` · `demo-login`, `GET /admin/dashboard/overview`, `GET/PUT /admin/users`, `GET/PUT /admin/fraud-reports`, `GET /admin/analytics/*`, `GET /admin/ml/performance`, `GET /admin/system/health` |
| ML inference | `POST /v1/assess`, `GET /v1/model-info` (ai-service, port 8001) |

---

## Testing & CI

| Suite | Command | Scope |
| --- | --- | --- |
| Python backend | `cd backend && python -m pytest` | 14 tests (auth, OTP, risk flow, wallet, admin) |
| Spring Boot | `cd core-backend && ./mvnw test` | 53 tests — wallet money service, payment commands, AI service/controller, risk client, profile service |
| Frontend | `cd frontend && npm run build && npm run lint` | TypeScript strict type-check + zero-warning lint |

`.github/workflows/ci.yml` runs the Python suite on every push and pull request to `main`.

---

## Roadmap

- [x] Spring Boot wallet, top-up, profile + user endpoints (FastAPI-identical shapes)
- [x] Spring Boot Groq AI module (all 8 `/ai` endpoints)
- [ ] Spring Boot: intervention, challenges, security-analyze, admin extras & exports
- [ ] Spring Boot admin authentication with role checks
- [ ] Flip Vercel proxy to core-backend and retire the FastAPI cloud tier
- [ ] SMS OTP delivery (Twilio) in production
- [ ] Model retraining pipeline automation

The deeper migration plan lives in [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

---

## Documentation

- [System design (NEW)](docs/system-design.md) — Redis + Kafka architecture, event contracts, failure modes, scaling plan
- [Build plan](docs/BUILD_PLAN.md) — service topology & migration milestones
- [Full-stack architecture](docs/FULL_STACK_ARCHITECTURE.md) — system design deep-dive
- [Architecture, API & design guide](docs/PROJECT_ARCHITECTURE_AND_API_GUIDE.md) — endpoint contracts
- [Core-backend README](core-backend/README.md) — Spring service setup & env vars
- Model training artifacts and charts: [`docs/`](docs/) (`model_architecture.png`, `model_accuracy_comparison.png`, …)

---

## License

Released under the [MIT License](LICENSE).
