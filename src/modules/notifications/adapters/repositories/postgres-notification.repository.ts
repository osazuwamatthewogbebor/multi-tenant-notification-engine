import { INotificationRepository, CreateLogDto } from '../../domain/ports/notification-repository.interface.js';
import { dbPool } from '../../../../shared/infrastructure/database.js';

export class PostgresNotificationRepository implements INotificationRepository {
    async createLog(log: CreateLogDto): Promise<string> {
        const query = `
            INSERT INTO notification_logs (tenant_id, channel, recipient, status, error_message, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, Now(), Now())
            RETURNING id;
        `;

        const values = [log.tenantId, log.channel, log.recipient, log.status, log.errorMessage || null];
        const result = await dbPool.query<{id: string}>(query, values);

        if (!result.rows[0]) {
            throw new Error('Database failed to insert record trace.');
        }
        return result.rows[0].id;
    }

    async updateLogStatus(id: string, status: CreateLogDto['status'], errorMessage?: string): Promise<void> {
        const query = `
            UPDATE notification_logs
            SET status = $1, error_message = $2, updated_at = Now()
            WHERE id = $3;
        `;

        await dbPool.query(query, [status, errorMessage || null, id])
    }
}