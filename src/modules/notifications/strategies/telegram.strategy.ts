import { INotificationStrategy } from './notification-strategy.interface.js';
import { NotificationPayload, ProviderResponse } from '../types.js';


export class TelegramStrategy implements INotificationStrategy {
    private botToken: string;

    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    }

    async send(payload: NotificationPayload): Promise<ProviderResponse> {
        if (!this.botToken) {
            return {
                success: false,
                errorMessage: 'Telegram bot token is not configured in your server.',
            };
        }

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: payload.recipient,
                    text: payload.content,
                    parse_mode: 'MarkdownV2',
                }),
            });

            const data = await response.json() as { ok: boolean; description?: string; result?: {message_id: number}};

            if (!response.ok || !data.ok) {
                return {
                    success: false,
                    errorMessage: data.description || `Telegram API error with status ${response.status}`,
                    rawResponse: data,
                };
            }

            return {
                success: true,
                messageId: data.result?.message_id.toString(),
                rawResponse: data,
            };
        } catch (error) {
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown network error occurred while sending Telegram message.',
            }
        }
    }
}