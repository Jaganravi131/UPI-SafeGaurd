# UPI SafeGuard Core Backend

This is the first Spring Boot slice of the future core backend.

## Current responsibility

Implemented now:

- Spring Boot application startup
- Health/Actuator endpoint
- Risk proxy endpoint
- HTTP client for the Python AI service
- Explicit `503` responses when the AI service is unavailable
- Single-use assessment tokens bound to user, recipient, and amount
- Payment command service that debits only a permitted, idempotent command
- Persistence entities and repositories for wallets, payment transactions, and
  assessment tokens

Not implemented yet:

- User authentication
- Wallet persistence
- Transaction persistence
- Guardian workflows
- Admin APIs

Assessment tokens are currently held in process memory as a development
primitive. They must move to durable storage with an atomic consume operation
before this service handles deployed payments.

The persistence model is now defined, but the in-memory command service is not
yet wired to these repositories. The next persistence step must add
transactional repository-backed token consumption and wallet updates, with
optimistic locking and database-backed idempotency.

The default H2 datasource is for local development only. Deployed environments
must provide a PostgreSQL JDBC URL and use migrations rather than relying on
`ddl-auto=update`.

The payment command service is also currently an internal application service,
not a public HTTP endpoint. It verifies the assessment token, preserves
idempotency, rejects blocked/guardian-pending decisions, and prevents negative
balances. A public payment endpoint will be added only after authentication and
durable wallet persistence are implemented.

Those modules must be added only after the API contract and payment tests are ported from the FastAPI backend.

## Run

Use the bundled Maven Wrapper, then run:

```powershell
.\mvnw.cmd spring-boot:run
```

The service listens on port `8080` and calls the Python AI service at `http://localhost:8001` by default.

The wrapper is Maven 3.9.16 and is shared from the checked-in Paysense
toolchain. Java 25 is still required by the project; the wrapper does not
replace the JDK.

## Endpoint

```text
POST /api/v1/risk/assess
```

The endpoint forwards the versioned request contract to the Python service. It does not debit a wallet or write a transaction.

```text
GET /api/v1/risk/model-info
```

Returns the active AI model metadata through the core backend. The frontend
should use the core backend as its only application API.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| DATABASE_URL | jdbc:h2:mem:upi_safeguard | PostgreSQL JDBC URL in production |
| AI_SERVICE_URL | http://localhost:8001 | Python ML risk-scoring service base URL |
| GROQ_API_KEY | *(empty)* | Enables the AI endpoints (/api/v1/ai/*) — empty disables them with a 503 {detail} error |
| GROQ_MODEL | llama-3.3-70b-versatile | Groq chat-completions model |
| GROQ_BASE_URL | https://api.groq.com/openai/v1 | Groq OpenAI-compatible endpoint |
| GROQ_TIMEOUT_MS | 20000 | Groq HTTP timeout |
| DEMO_AI_FALLBACK | alse | When 	rue, /ai/chat answers with deterministic demo guidance instead of 503 while no API key is set |
