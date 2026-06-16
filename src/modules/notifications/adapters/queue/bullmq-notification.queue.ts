import { Queue } from 'bullmq';
import { INotificationQueue, QueueJobData } from '../../domain/ports/notification-queue.interface.js';

export class BullMQNotificationQueue implements INotificationQueue {
    private queue: Queue;

    constructor() {
        const redisHost = process.env.REDIS_HOST || '127.0.0.1';
        const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

        // Initialize the BullMQ queue with Redis connection details
        this.queue = new Queue('notifcation-delivery', {
            connection: {
                host: redisHost,
                port: redisPort,
            }, 
            defaultJobOptions: {
                // Production-ready settings: retry up to 5 times with exponential backoff, and remove completed jobs after 24 hours
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 2000, // Initial delay of 2 seconds for retries
                },
                removeOnComplete: true,
                removeOnFail: {age: 24 * 60 * 60}, // Remove failed jobs after 24 hours
            }
        });
    };

    async enqueue(data: QueueJobData): Promise<void> {
        const jobName = `dispatch:${data.channel}:${data.tenantId}:${Date.now()}`;

        try {
            await this.queue.add(jobName, data);
            console.log(`Enqueued job ${jobName} for tenant ${data.tenantId} on channel ${data.channel}`);
        } catch (error) {
            console.error(`Failed to enqueue job for tenant ${data.tenantId} on channel ${data.channel}:`, error instanceof Error ? error.message : error);
            throw new Error('Failed to enqueue notification job');
        }
    }
}
