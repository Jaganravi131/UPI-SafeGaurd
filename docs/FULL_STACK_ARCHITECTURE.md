# UPI SafeGuard Full-Stack Architecture

## Service ownership

The repository has one Spring Boot application only:

```text
core-backend/
```

The `paysense/` directory is not another UPI SafeGuard backend. It is a
temporary scaffold/toolchain source that supplied the Maven Wrapper. The
canonical Spring source is `core-backend/`.

During migration, the repository has two Python services with different
responsibilities:

| Service | Runtime | Current role | Target role |
|---|---|---|---|
| `backend/` | FastAPI | Existing compatibility/reference API | Retire business routes after Spring parity |
| `backend/ai_service/` | FastAPI | Versioned risk inference API | Remain as the Python AI service |
| `core-backend/` | Spring Boot | Risk boundary and payment foundation | Own all core business and payment decisions |
| `frontend/` | React/Vite/Nginx | User and admin UI | Call Spring Boot after route parity |
| `postgres` | PostgreSQL | Durable database for Spring profile | Core backend persistence |

There must not be two Spring Boot applications in the final topology.

## Local Docker topology

`docker-compose.yml` currently provides:

```text
frontend:3000
   |
   +--> backend:8000             (legacy compatibility routes)
   |
core-backend:8081
   |
   +--> ai-service:8001
   |
   +--> postgres:5432
```

The frontend still proxies `/api` to the FastAPI compatibility backend because
the complete Spring route surface has not yet been migrated. This is
intentional and temporary. The migration target is:

```text
frontend --> core-backend --> ai-service
                         \--> postgres
```

The frontend must not call `ai-service` directly.

## Build behavior

### Python backend

The backend image installs Python dependencies and starts FastAPI. It no longer
executes `train_paysim.py` during image construction because that script no
longer creates a fake trained model. A real artifact must be produced by
`train_models.py` from an explicitly supplied dataset and mounted or packaged
as a deployment artifact.

### Python AI service

The AI service uses the same backend image and starts:

```text
uvicorn ai_service.main:app --host 0.0.0.0 --port 8001
```

It loads `app/ml/trained_models/risk_model.joblib` when available and otherwise
uses the documented deterministic fallback.

### Spring Boot

The core backend Docker build uses the checked-in Maven Wrapper and Java 25:

```text
core-backend/mvnw
core-backend/mvnw.cmd
core-backend/.mvn/wrapper/maven-wrapper.properties
```

The runtime image is Eclipse Temurin 25 JRE.

## Main workflow

### Risk assessment

```text
User opens payment screen
  -> frontend calls core-backend risk endpoint after migration
  -> Spring sends transaction/profile data to ai-service
  -> Python returns XGBoost score + rules + explanation
  -> Spring issues a single-use assessment token
  -> frontend displays the decision and next action
```

### Payment

```text
Frontend submits token + payment + idempotency key
  -> Spring authenticates the user
  -> Spring atomically consumes the assessment token
  -> Spring checks action, guardian state, balance, and idempotency
  -> Spring debits the wallet in a database transaction
  -> Spring records the payment and audit event
  -> frontend receives the final payment status
```

Python never debits a wallet. The frontend never decides whether money can
move.

## Design patterns

### Ports and adapter boundary

`RiskServiceClient` is the outbound adapter from Spring to the Python AI
contract. The rest of the core backend should depend on the stable response
contract rather than Python implementation details.

### Application service

`PaymentCommandService` is the application-service boundary for payment
invariants. Its current test constructor uses in-memory balances; the
production path is being migrated to repository-backed wallet and transaction
state before payment endpoints are exposed.

### Repository pattern

JPA repositories isolate persistence access for wallets, payment transactions,
and assessment tokens. Assessment tokens are now issued and consumed through
the repository-backed PostgreSQL path with a pessimistic row lock and
optimistic version column. Wallet and payment repositories remain the seam for
the next transactional payment implementation.

### State machine

Payments use explicit statuses such as `COMPLETED`, `BLOCKED`,
`GUARDIAN_PENDING`, and `REJECTED`. New states must be added deliberately and
mapped to frontend actions.

### Idempotency

The payment command includes a user-scoped idempotency key. The database
unique constraint is the final protection against duplicate debits.

### Defense in depth

Rules can elevate a model result to a safer decision. Spring independently
enforces token ownership, expiry, balance, authorization, and transaction
state. No single model or UI decision is trusted alone.

## Migration gates

The frontend proxy must move from `backend:8000` to `core-backend:8080` only
after Spring implements the required route and authentication contracts.

The legacy `backend/` service may be removed only after:

1. Frontend calls no legacy route.
2. Spring integration tests cover the required flows.
3. Wallet and transaction invariants pass end-to-end.
4. Docker Compose runs without the legacy service.
5. Documentation and deployment manifests use the single canonical path.
