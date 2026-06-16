import pg from 'pg';

const { Pool } = pg;

export const dbPool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) :  5432,
    user: process.env.DB_USER || 'notify_admin',
    password: process.env.DB_PASSWORD || 'notify_secure_password123',
    database: process.env.DB_NAME || 'notification_engine',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
}) 