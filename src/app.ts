import express from 'express';
import dotenv from 'dotenv';
import { BullMQNotificationQueue } from './modules/notifications/adapters/queue/bullmq-notification.queue.js';
import { BullMQNotificationWorker } from './modules/notifications/adapters/queue/bullmq-notification.worker.js';
import { NotificationController } from './modules/notifications/adapters/controllers/notification.controller.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;


// 1. Instantiate Adapters (DI)
const notificationQueue = new BullMQNotificationQueue();
const notificationController = new NotificationController(notificationQueue);

// Boot up the background worker thread cluster to consume queued jobs
new BullMQNotificationWorker();
console.log('[System] Background BullMQ worker initialized successfully.');


// 2. Define Routing Infrastructure
app.post('/api/v1/notifications/send', (req, res) => notificationController.handleSend(req, res));

// Health check
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Start server
app.listen(PORT, () => {
    console.log(`[System] Multi-Tenant Notification Core running on port ${PORT}`);
})