import { INotificationStrategy } from './notification-strategy.interface.js';
import {NotificationPayload, ProviderResponse} from '../types.js';

export class SlackStrategy implements INotificationStrategy {
    async send(payload: NotificationPayload): Promise<ProviderResponse> {
        const webhookUrl = payload.recipient;

        if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
            return {
                success: false, errorMessage: 'Provided recipient is not a valid Slack webhook URL.',
            }
        }

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    text: payload.content,
                })
            });
            if (!response.ok) {
                const textError = await response.text();
                return {
                    success: false,
                    errorMessage: `Slack API error with status ${response.status}: ${textError}`,
                    rawResponse: textError,
                }
            }

            return {
                success: true,
                messageId: `slack_${Date.now()}`,
            }
        } catch (error) {
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown network error occurred while sending Slack message.',
            }
        }
    }
}