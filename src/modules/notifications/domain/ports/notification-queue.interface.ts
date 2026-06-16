import { NotificationChannel, NotificationPayload } from '../../types.js';

export interface QueueJobData {
    tenantId: string;
    channel: NotificationChannel;
    payload: NotificationPayload;   
}

export interface INotificationQueue {
    enqueue(data: QueueJobData): Promise<void>;
};