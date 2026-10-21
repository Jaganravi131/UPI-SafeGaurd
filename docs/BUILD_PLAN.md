# UPI SafeGuard Build Plan

## 1. Purpose and target outcome

UPI SafeGuard will be built as a simulated UPI fraud-prevention platform with a
clear separation of responsibilities:

- **React + TypeScript** provides the user and admin experiences.
- **Spring Boot** is the authoritative core backend for identity, wallets,
  transactions, fraud reports, guardians, persistence, and final payment
  decisions.
- **Python** is an AI risk service. It calculates a risk assessment and
  explains the result, but it never debits a wallet, creates a payment
  transaction, or makes an irreversible business decision.

The goal is a credible, testable portfolio system, not a claim that it connects
to NPCI, banks, or real customer funds.

## 2. Confirmed current state

The repository currently contains:

- A working FastAPI application with authentication, wallet, transaction,
  guardian, fraud-report, intervention, and admin routes.
- A React/TypeScript frontend with payment, risk, dashboard, history,
  guardian, education, fraud-report, and admin screens.
- A Python AI-service boundary with a versioned assessment endpoint.
- A Spring Boot core-backend skeleton with a Python risk-service client.
- A risk engine that currently combines deterministic rules, Isolation Forest
  behavior, and a graph-shaped heuristic model.
- Training scripts for XGBoost and LightGBM using the PaySim dataset.

The existing code is a prototype baseline. Its model names and response fields
must not be treated as evidence that a production-quality model has already
been trained or validated.

## 3. Target architecture

```text
React/TypeScript
       |
       v
Spring Boot core backend
  - auth and authorization
  - users and guardians
  - wallets and transactions
  - fraud reports and audit records
  - final payment decision
       |
       +----> Python AI risk service
       |        - feature construction
       |        - primary XGBoost inference
       |        - explanation metadata
       |        - model/version/health endpoints
       |
       +----> PostgreSQL in deployed environments
       +----> SQLite for local demo/test profiles
```

The frontend must only call the core backend. It must not call the Python
service directly and must not calculate risk or decide whether money can move.

## 4. AI decision strategy

### 4.1 Primary decision model

Use **XGBoost as the primary supervised fraud-risk model** for the first
production-shaped implementation.

Reasons:

- The repository already contains an XGBoost training path and domain-relevant
  engineered features.
- It performs well on tabular fraud data and handles nonlinear interactions.
- It is easier to validate, explain, serialize, and operate than a live graph
  neural network.
- It gives a single model score instead of an opaque weighted ensemble.

The model must output a calibrated probability or a documented risk score.
Thresholds for `proceed`, `delay`, and `block` must be chosen from validation
results and business cost assumptions, not copied from arbitrary constants.

### 4.2 Deterministic safety layer

Rules remain authoritative guardrails around the model:

- Known blocked recipient or confirmed fraud report.
- Invalid or unsafe request data.
- Impossible amount or balance conditions.
- Guardian-required conditions.
- Explicit active-call/coercion signals when the product has reliable evidence.

Rules can raise a decision to a safer outcome, such as `block` or `delay`.
The model cannot override a hard safety rule. The model also cannot directly
authorize a wallet debit.

### 4.3 Removed or deferred model behavior

The following behavior is not part of the target runtime:

- **No live GNN inference.** The current graph-shaped heuristic is not a
  validated GNN and should not be presented as one.
- **No fake ensemble score.** Do not return `ensemble_score` as if several
  trained models were combined.
- **No placeholder LSTM, sensor, or stress model claims.** These may be added
  later only with data, training, evaluation, and an explicit contract.
- **No fabricated confidence.** Confidence must either come from a defined
  calibration method or be removed from the API.

Recipient reputation and community reports remain useful as explicit,
auditable features or hard-rule inputs. They do not require a graph neural
network.

### 4.4 Model-selection gate

XGBoost is the default implementation choice, not an excuse to skip evaluation.
Before locking the artifact:

1. Establish a deterministic train/validation/test split.
2. Prevent leakage from future transactions and same-entity information.
3. Compare XGBoost with a simple baseline such as logistic regression.
4. Optionally compare LightGBM as a challenger, not as an automatic ensemble
   member.
5. Select using PR-AUC, recall at an acceptable false-positive rate,
   precision at the block threshold, calibration, and inference latency.
6. Save the selected model, feature schema, training data version, metrics,
   and threshold configuration together.

PaySim is synthetic. Results must be labelled as benchmark results and must
not be described as real UPI fraud performance.

## 5. Service contracts

### Python AI service

Implement and freeze a versioned contract such as:

- `GET /health`
- `GET /v1/model-info`
- `POST /v1/assess`

`/v1/assess` should return:

- request/transaction identifier
- `risk_score`
- `risk_level`
- model recommendation: `proceed`, `delay`, or `block`
- ordered risk factors/explanations
- model version and feature schema version
- rule outcomes and reasons
- evaluation metadata needed by the core backend

It must not return wallet mutations, authorization tokens, or a final payment
authorization.

### Spring Boot core backend

Spring Boot owns the stable public API used by the frontend:

- Authentication and session/token lifecycle.
- User profile and guardian settings.
- Risk assessment orchestration.
- One-time risk assessment token or server-side assessment record.
- Wallet balance and transaction persistence.
- Transaction state machine and idempotency.
- Fraud reports, audit events, and admin operations.

The core backend must re-check authorization, balance, token freshness, and
hard rules during payment creation. A frontend response or Python response is
never sufficient evidence for a debit.

### Frontend

The frontend will use typed API clients and query/mutation hooks for the
Spring Boot contract. It will:

- Present risk explanations and safety actions.
- Show loading, timeout, unavailable-AI, and retry states.
- Require explicit confirmation for delayed or high-risk flows.
- Never infer permission to pay from a score alone.
- Keep accessibility, responsive layouts, and consistent error messaging.

## 6. Delivery phases

### Phase 0 - Baseline and decisions

- Freeze the current FastAPI behavior as the reference during migration.
- Inventory all frontend calls and backend routes.
- Define canonical transaction, risk, wallet, guardian, and fraud-report
  contracts.
- Decide the supported local and deployed profiles.
- Add a model decision record documenting XGBoost, rules, and deferred GNN.

**Exit criteria:** contracts are written, current behavior has tests, and no
new feature is implemented against an ambiguous response shape.

### Phase 1 - Rebuild the Python AI service

- Extract feature engineering into a deterministic, versioned pipeline.
- Remove live GNN calls from the risk path.
- Implement XGBoost training, evaluation, serialization, and loading.
- Add a rules/guardrail evaluator separate from model inference.
- Replace ensemble-shaped fields with the canonical risk response.
- Add model-info and health diagnostics.
- Add unit and contract tests for normal, anomalous, blocked, malformed, and
  unavailable-model cases.

**Exit criteria:** the service can run independently and produces repeatable
  assessments from a pinned feature schema and model artifact.

### Phase 2 - Build the Spring Boot core

- Verify the Spring Boot version and Java 25 compatibility before relying on
  the Java 25 runtime.
- Add configuration profiles for local SQLite/demo and deployed PostgreSQL.
- Implement domain entities/repositories for users, wallets, transactions,
  guardians, fraud reports, and audit records.
- Implement authentication and authorization.
- Implement the Python AI client with timeouts, explicit error mapping, and
  correlation IDs.
- Implement risk assessment persistence/token lifecycle.
- Implement an idempotent transaction state machine.
- Ensure blocked/delayed transactions cannot debit a wallet.
- Port behavior from FastAPI incrementally; do not duplicate ownership.

**Exit criteria:** Spring Boot can complete the login -> assess -> confirm ->
payment/history flow while preserving wallet and transaction invariants.

### Phase 3 - Frontend fine-tuning

- Make Spring Boot the only configured application API.
- Replace response-specific assumptions with generated or shared TypeScript
  types where practical.
- Refine the payment flow around assessment, delay, confirmation, and failure.
- Improve risk explanation hierarchy: decision, reason, evidence, next action.
- Add proper empty/loading/error/offline states.
- Remove UI claims that imply live GNN, ensemble, or guaranteed AI certainty.
- Fine-tune responsive layout, accessibility, visual hierarchy, and admin
  model-status screens.
- Keep educational content and safety guidance clearly separate from payment
  authorization.

**Exit criteria:** the main user flows work against Spring Boot without direct
FastAPI or Python-service calls and remain usable on mobile and desktop.

### Phase 4 - Migration and compatibility

- Run FastAPI and Spring Boot in parallel only as a controlled migration
  reference, not as two competing payment authorities.
- Replay contract tests against both implementations.
- Compare risk response semantics and payment invariants.
- Switch frontend traffic to Spring Boot.
- Keep FastAPI only for explicitly documented fallback/reference use.
- Remove obsolete routes, adapters, GNN code, and ensemble fields after the
  replacement is proven.

**Exit criteria:** all required frontend flows use Spring Boot, and the old
  business path no longer owns a production payment decision.

### Phase 5 - Verification and deployment

- Run Python unit/contract tests.
- Run Spring Boot unit/integration tests.
- Run frontend type-check, lint, and build.
- Run end-to-end payment scenarios.
- Build and run all Docker services.
- Verify health checks, startup, timeouts, and graceful AI failure.
- Externalize secrets and remove demo credentials from deployed configuration.
- Document local startup, test commands, model training, and deployment.

**Exit criteria:** a clean checkout can be built and started using documented
commands, and the critical acceptance scenarios pass.

## 7. Critical acceptance scenarios

1. A normal payment is assessed and can proceed after confirmation.
2. A known blocked recipient is blocked and does not change the wallet balance.
3. A high-risk assessment requires the configured delay/verification flow.
4. An expired or reused assessment token cannot create a payment.
5. An insufficient-balance payment is rejected without a transaction debit.
6. A repeated payment request with the same idempotency key does not double
   debit the wallet.
7. Python AI timeout or failure produces an explicit safe fallback, not a
   success-shaped response.
8. A fraud report is persisted and affects later auditable risk inputs.
9. The frontend never calls the Python service directly.
10. Model version and decision reasons are visible in appropriate admin/audit
    views without exposing secrets.

## 8. Explicit non-goals for the first complete version

- Real bank or NPCI integration.
- Real-money transfers.
- A live graph neural network.
- Continuous online learning in production.
- A claim of production fraud-detection accuracy from PaySim alone.
- Autonomous AI authorization of payments.
- Replacing deterministic security controls with a model.

## 9. Documentation that must stay current

- This build plan and its decision records.
- API contract documentation for Spring Boot and Python.
- Model card containing data source, features, metrics, thresholds, limits,
  and known bias/leakage risks.
- Local development and deployment instructions.
- Migration notes documenting which FastAPI routes have moved and which remain.
- Frontend flow documentation for assessment and payment confirmation.

## 10. First implementation batch

The first coding batch should be deliberately narrow:

1. Define the canonical `/v1/assess` request/response schemas.
2. Replace the Python runtime's GNN/ensemble output with XGBoost-plus-rules
   semantics.
3. Add deterministic model loading and model-info reporting.
4. Add contract tests for the Python service.
5. Update the Spring Boot client and response types to the canonical contract.
6. Run the existing Python and Java tests before moving wallet ownership.

No frontend redesign or database migration should begin until this contract
batch is green.
