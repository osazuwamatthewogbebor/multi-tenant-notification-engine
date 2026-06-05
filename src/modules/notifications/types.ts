export enum NotificationChannel {
    EMAIL = 'EMAIL',
    TELEGRAM = 'TELEGRAM',
    SLACK = 'SLACK',
    DISCORD = 'DISCORD',
    TWITTER = 'TWITTER',
}

export interface NotificationPayload {
    recipient: string;
    subject?: string;
    content: string;
}

export interface ProviderResponse {
    success: boolean;
    messageId?: string;
    errorMessage?: string;
    rawResponse?: unknown;
}