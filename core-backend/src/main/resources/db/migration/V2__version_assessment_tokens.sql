ALTER TABLE assessment_tokens
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
