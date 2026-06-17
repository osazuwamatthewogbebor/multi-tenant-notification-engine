import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import pkg from 'pg';

const { Pool } = pkg;

const redisClient = new Redis({ 
  host: process.env.REDIS_HOST || 'redis', 
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379 
});

const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'postgres';
const dbHost = process.env.DB_HOST || 'notification_postgres';
const dbPort = process.env.DB_PORT || '5432';
const dbName = process.env.DB_NAME || 'notifications_db';

const connectionString = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

const dbPool = new Pool({ connectionString });

export async function validateTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.headers['x-tenant-id']?.toString();

    if (!tenantId) {
        res.status(401).json({ status: 'failed', message: 'Missing mandatory x-tenant-id authorization header.'})
        return;
    }

    // Fast structural regex validation for a standard UUIDv4 format string before hitting Postgres
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!UUID_REGEX.test(tenantId)) {
    res.status(400).json({ status: 'fail', message: 'Provided Tenant ID format is structurally invalid.' });
    return;
    };

    try {
        // Fast Cache Layer Check (Redis)
        const cacheKey = `tenant:status:${tenantId}`;
        const isCachedTenant = await redisClient.get(cacheKey);

        if (isCachedTenant === 'active') {
            next();
            return;
        }

        // Fallback Database Layer Check
        const query = 'SELECT id FROM tenants WHERE id = $1 LIMIT 1;';
        const result = await dbPool.query(query, [tenantId]);

        if (result.rows.length === 0) {
            res.status(403).json({ status: "failed", message: 'Unauthorised access. Provided Tenant'});
            return;
        }

        // Populate Cache for subsequent requests (TTL: 1 Hour)
        await redisClient.set(cacheKey, 'active', 'EX', 3600);

        next();
    } catch (error) {
        console.error('[Middle Error] Tenant verification failed:', error)
        res.status(500).json({ status: 'error', message: 'Internal tenant security verification fault.'})
    }
}