import { NotificationChannel, NotificationPayload, ProviderResponse } from '../types.js';
import { INotificationStrategy } from './notification-strategy.interface.js';
import { TelegramStrategy } from './telegram.strategy.js';
import { SlackStrategy } from './slack.strategy.js';

export class  NotificationContext {
    private strategies: Map<NotificationChannel, INotificationStrategy> = new Map();

    constructor() {
        this.strategies.set(NotificationChannel.TELEGRAM, new TelegramStrategy());
        this.strategies.set(NotificationChannel.SLACK, new SlackStrategy);

        // Set for discord and email and twitter later

    }
    // Execute the target channel strategy dynamically at execution time
    async executeStrategy(channel: NotificationChannel, payload: NotificationPayload): Promise<ProviderResponse> {
        const strategy = this.strategies.get(channel);

        if (!strategy) {
            return {
                success: false,
                errorMessage: `Delivery Strategy for channel "${channel}" has not been implemented or registered.`
            }
        }

        return await strategy.send(payload)
    }
}