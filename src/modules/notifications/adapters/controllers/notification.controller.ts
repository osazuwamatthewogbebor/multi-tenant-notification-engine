import { Request, Response } from 'express';
import { INotificationQueue } from '../../domain/ports/notification-queue.interface.js'
import { SendNotificationSchema } from './notification.validator.js';
import { ZodError } from 'zod';
import { NotificationChannel } from '../../types.js';


export class NotificationController {
    constructor (private notificationQueue: INotificationQueue) {}

    async handleSend(req: Request, res: Response): Promise<void> {
        try {
            const parsedRequest = await SendNotificationSchema.parseAsync({ body: req.body });
            const {channel, recipient, subject, content} = parsedRequest.body;

            const tenantId = req.headers['x-tenant-id']?.toString() || `tenant_enterprise_01`;

            await this.notificationQueue.enqueue({
                tenantId,
                channel: channel as NotificationChannel,
                payload: {recipient, subject, content}
            });

            res.status(202).json({
                status: 'success',
                message: 'Notification request accepted and queued for delivery.',
                meta: { channel, tenantId}
            })
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    status: 'failed',
                    errors: error.issues.map(issue => ({field: issue.path.join('.'), message: issue.message }))
                });
                return
            }

            console.error('[Controller Error] Unexpected fault:', error);
            res.status(500).json({status: 'error', message: 'Internal server processing error'})
        }
    }
}