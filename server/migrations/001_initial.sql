-- À exécuter exclusivement dans la base restaurant_app.
-- Aucun CREATE DATABASE ni CREATE ROLE dans cette migration.

CREATE TABLE IF NOT EXISTS restaurant_admin (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_sessions (
    id UUID PRIMARY KEY,
    admin_id SMALLINT NOT NULL
        REFERENCES restaurant_admin(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS restaurant_sessions_expires_idx
    ON restaurant_sessions(expires_at);

CREATE TABLE IF NOT EXISTS restaurant_backups (
    id UUID PRIMARY KEY,
    format_version INTEGER NOT NULL CHECK (format_version > 0),
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
