import { NotificationChannel } from "../../types";

export interface CreateLogDto {
    tenantId: string;
    channel: NotificationChannel,
    recipient: string;
    status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
    errorMessage?: string;
}

export interface INotificationRepository {
    createLog(log: CreateLogDto): Promise<string>
    updateLogStatus(id: string, status: CreateLogDto['status'], errorMessage?: string): Promise<void>;
}