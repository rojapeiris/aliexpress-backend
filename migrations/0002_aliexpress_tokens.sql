-- Migration number: 0002   AliExpress token and configuration tables
CREATE TABLE IF NOT EXISTS aliexpress_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id TEXT NOT NULL,
    seller_id TEXT,
    account TEXT,
    user_nick TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token_expires_at INTEGER NOT NULL,  -- Unix timestamp ms
    refresh_token_expires_at INTEGER NOT NULL, -- Unix timestamp ms
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aliexpress_tokens_user_id ON aliexpress_tokens(user_id);

CREATE TABLE IF NOT EXISTS aliexpress_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

