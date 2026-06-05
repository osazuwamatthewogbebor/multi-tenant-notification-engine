import { NotificationPayload, ProviderResponse } from '../types.js';

export interface INotificationStrategy {
    send(payload: NotificationPayload): Promise<ProviderResponse>;
}