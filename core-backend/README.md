# UPI SafeGuard Core Backend (Spring Boot)

The production-target backend of UPI SafeGuard: a GPay-class UPI app with
AI-assisted fraud protection. Java 21 / Spring Boot 3 / JPA (PostgreSQL,
H2 in-memory for local). Every HTTP contract mirrors the reference FastAPI
backend in `backend/` (snake_case responses, `{detail}` error bodies), so the
React frontend works against either backend unchanged.

**System design:** [`docs/system-design.md`](../docs/system-design.md) —
architecture, Redis keyspace, Kafka event contracts, failure modes, deployment
topologies.

## Current responsibility

Fully implemented (101 tests green):

- **Wallet & payments** — balance, info, transfer/top-up (idempotency,
  assessment-token-gated risk path for payments, owner-only authz), history,
  admin search / all-transactions endpoints.
- **Auth** — server-side OTP persistence (`otp_records`, 5 min TTL, 3 attempts,
  single-use), JWT issue/validate/logout, register flow. Demo OTP exposure is
  config-gated (`APP_EXPOSE_DEMO_OTP`).
- **AI features** (`/api/v1/ai/*`) — 8 endpoints over the Groq API
  (OpenAI-compatible): chat, translate-ui, fraud speech, voice alerts,
  scholarship explain, risk explanation, language registry. Temperature 0.3,
  deterministic fallbacks, 503 `{detail}` when no key is configured.
  `DEMO_AI_FALLBACK` gates the canned-reply fallback.
- **AI intervention engine** — 1:1 port of the agentic intervention service
  (`/api/v1/intervention/*`): 5 risk levels with exact thresholds, reason
  identification, contextual warnings, verification challenges (incl.
  call-active wait periods and guardian approval on critical), resolve/cancel
  with points.
- **Challenges & gamification** — list / daily / detail / submit (with
  real `education_score` updates, capped at 100), categories, demo leaderboard
  and badges.
- **Notifications** — FastAPI-shaped `{notifications, count}` listing with
  decoded `data` objects, real mark-read / read-all.
- **Fraud reports** — analyze (mock scorer), submit, trending, stats.
- **Contacts · guardians · users profile · transactions · assessment tokens**
  (risk proxy to the Python `ai-service`).
- **Infrastructure plane (this wave)** — see below.

## Infrastructure plane

State is split by role (durable → PostgreSQL; coordination → cache; async
fanout → Kafka). All three are **optional at runtime**:

| Plane | Component | When on | What it gives |
|---|---|---|---|
| PostgreSQL | JPA + Flyway-ready migrations | always | users, wallets, transactions, fraud reports, notifications, OTP records |
| Redis | `cache.CacheService` driver `redis` | `APP_CACHE_DRIVER=redis` | cluster-wide fixed-window **rate limiting** + shared **active-intervention registry** (Redis hash, single-use consume) |
| In-process | `cache.CacheService` driver `memory` | default | identical semantics for single-replica deployments, tests, CI (no infra) |
| Kafka | `events.DomainEventPublisher` + `NotificationEventConsumer` | `APP_KAFKA_ENABLED=true` | `upi.transactions.completed`, `upi.fraud.flagged`, `upi.interventions.raised` → async notification fanout; a dead broker never fails a payment |

Rate limiting (per 60 s fixed window, configurable via
`app.rate-limit.*` / `RATE_LIMIT_*` envs): OTP requests 5/min per identifier,
OTP verifies 10/min, transfers+top-ups 60/min per user, fraud reports 10/min —
violations return FastAPI-style `429 {"detail": …}`.

## Run

```powershell
.\mvnw.cmd spring-boot:run    # listens on :8080, H2 in-memory profile
.\mvnw.cmd test               # 101 tests, hermetic (no Redis/Kafka needed)
```

Full local stack (Spring + Postgres + Redis + KRaft Kafka + ai-service):

```powershell
docker compose up core-backend postgres redis kafka ai-service
```

The service calls the Python AI service at `http://localhost:8001` by default
(`AI_SERVICE_URL`).

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `jdbc:h2:mem:upi_safeguard;MODE=PostgreSQL` | PostgreSQL JDBC URL in production |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | `sa` / — | DB credentials |
| `JPA_DDL_AUTO` | `update` | schema mode; production should use migrations |
| `AI_SERVICE_URL` | `http://localhost:8001` | Python ML risk-scoring service base URL |
| `GROQ_API_KEY` | *(empty)* | Enables `/ai/*`; empty ⇒ `503 {"detail": …}` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq chat-completions model |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | Groq OpenAI-compatible endpoint |
| `GROQ_TIMEOUT_MS` | `20000` | Groq HTTP timeout |
| `DEMO_AI_FALLBACK` | `false` | `true` ⇒ `/ai/chat` answers with deterministic demo guidance instead of 503 |
| `APP_EXPOSE_DEMO_OTP` | `true` | Return generated OTP in `/auth/request-otp` response; **set false in production** |
| `APP_CACHE_DRIVER` | `memory` | `memory` \| `redis` — see system-design §5 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / — | Redis connection |
| `APP_RATE_LIMIT_ENABLED` | `true` | global limiter switch |
| `RATE_LIMIT_OTP_PER_MINUTE` | `5` | OTP requests, per identifier |
| `RATE_LIMIT_OTP_VERIFY_PER_MINUTE` | `10` | OTP verifications, per identifier |
| `RATE_LIMIT_TRANSFERS_PER_MINUTE` | `60` | transfers + top-ups, per user |
| `RATE_LIMIT_FRAUD_PER_MINUTE` | `10` | fraud reports, per user |
| `APP_KAFKA_ENABLED` | `false` | domain events + consumer fanout |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | broker list (compose: `kafka:9092`) |
| `KAFKA_CONSUMER_GROUP` | `upi-safeguard-core` | consumer group id |

## Known gaps / next steps

- Admin console auth is now live (`/admin/auth/*` + role guards on `/admin/*`
  and `/wallet/admin/*`, roles `super_admin`/`admin`/`analyst`/`support`,
  bcrypt-shared with the Python backend). Remaining: `/admin/activity-logs`
  listing, exports, and model-config endpoints from the Python surface.
- Migration discipline: `ddl-auto=update` locally; production should move to
  versioned Flyway migrations.
- Redis fail-open circuit breaker and transactional Kafka outbox (roadmap in
  `docs/system-design.md` §10).
