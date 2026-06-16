import { z } from 'zod';
import { NotificationChannel } from '../../types.js';


export const SendNotificationSchema = z.object({
  body: z.object({
    channel: z.enum([
        NotificationChannel.EMAIL as string,
        NotificationChannel.TELEGRAM as string,
        NotificationChannel.SLACK as string,
        NotificationChannel.DISCORD as string,
        NotificationChannel.TWITTER as string
    ], {
      message: "Invalid channel. Allowed values: EMAIL, TELEGRAM, SLACK, DISCORD, TWITTER"
    }),
    recipient: z.string().min(1, { message: "Recipient cannot be empty" }),
    subject: z.string().optional(),
    content: z.string().min(1, { message: "Content cannot be empty" })
  })
});

// Create a structural type inferred directly from our Zod schema
export type SendNotificationInput = z.infer<typeof SendNotificationSchema>['body'];