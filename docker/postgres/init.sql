-- CREATE unique UUID generation extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create a baseline Tenants storage track
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'BRONZE',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed a default enterprise mock tenant matching our controller fallbacks
INSERT INTO tenants (id, name, tier)
VALUES ('00000000-0000-0000-0000-000000000001', 'Enterprise Mock Client', 'GOLD')
ON CONFLICT DO NOTHING;

-- 2. Create our core immutable Notification Logs trace vault
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    recipient TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_At TIMESTAMP NOT NULL DEFAULT NOw()
);

CREATE INDEX IF NOT EXISTS idx_logs_tenant_Status ON notification_logs(tenant_id, channel, status);