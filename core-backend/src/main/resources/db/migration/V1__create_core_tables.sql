CREATE TABLE wallets (
    id UUID PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    balance NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL
);

CREATE TABLE assessment_tokens (
    token VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    recipient_upi VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    recommended_action VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    recipient_upi VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_payment_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_assessment_tokens_user_id ON assessment_tokens (user_id);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions (user_id);
