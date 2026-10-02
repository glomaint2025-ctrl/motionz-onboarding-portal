-- Single-use password reset tokens (only the SHA-256 hash of the emailed token is stored).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens (email);

-- Only the server (service role) may read or write reset tokens.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
