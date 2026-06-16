import { Worker, Job } from 'bullmq';
import { QueueJobData } from '../../domain/ports/notification-queue.interface.js';
import { NotificationContext } from '../../strategies/notification.context.js';
import { PostgresNotificationRepository } from '../repositories/postgres-notification.repository.js';


export class BullMQNotificationWorker {
    private worker: Worker;
    private notificationContext: NotificationContext;
    private repository: PostgresNotificationRepository;


    constructor() {
        const redisHost = process.env.REDIS_HOST || '127.0.0.1';
        const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

        this.notificationContext = new NotificationContext();
        this.repository = new PostgresNotificationRepository();

        this.worker = new Worker(
            `notification-delivery`,
            async (job: Job<QueueJobData>) => {
                const { channel, payload, tenantId } = job.data;
                
                const logId = await this.repository.createLog({
                    tenantId,
                    channel,
                    recipient: payload.recipient,
                    status: 'PROCESSING'
                })
                console.log(`[Worker] Processing job ${job.id} for Tenant: ${tenantId} via ${channel}`);


                const result = await this.notificationContext.executeStrategy(channel, payload)

                if (!result.success) {
                    await this.repository.updateLogStatus(logId, 'FAILED', result.errorMessage);
                    throw new Error(`Delivery failed: ${result.errorMessage}`);
                }

                await this.repository.updateLogStatus(logId, 'DELIVERED');
                console.log(`[Worker] Job ${job.id} successfully dispatched. Message ID: ${result.messageId}`);
            }, 
            {
                connection: {
                    host: redisHost,
                    port: redisPort,
                },
                concurrency: 10,
            }
        );

        this.setupListeners();
    }

    private setupListeners(): void {
        this.worker.on('failed', (job, err) => {
            console.error(`[Worker Error] Job ${job?.id} permanently failed or stalled" ${err.message}`);
            
        })
    }
}