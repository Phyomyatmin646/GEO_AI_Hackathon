import type { TelecomRepository } from './telecom.repository.js';
import type { NotificationProvider } from './providers.js';

export class DeliveryWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly telecomRepo: TelecomRepository,
    private readonly smsProvider: NotificationProvider,
    private readonly emailProvider: NotificationProvider
  ) {}

  start(intervalMs = 5000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.processQueue(), intervalMs);
    console.log(`[Delivery Worker] Started polling every ${intervalMs}ms`);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    console.log('[Delivery Worker] Stopped');
  }

  private async processQueue() {
    if (!this.isRunning) return;
    try {
      const messages = await this.telecomRepo.fetchQueuedMessages(10);
      
      for (const msg of messages) {
        // Mark as sending
        await this.telecomRepo.markMessageSending(msg.id);
        
        let provider: NotificationProvider | null = null;
        if (msg.channel === 'sms') provider = this.smsProvider;
        if (msg.channel === 'email') provider = this.emailProvider;
        
        if (!provider) {
          await this.telecomRepo.updateMessageStatus(msg.id, 'failed', true, 'Unknown channel provider');
          continue;
        }

        try {
          const result = await provider.send(msg.recipient, msg.message_text);
          if (result.success) {
            await this.telecomRepo.updateMessageStatus(msg.id, 'delivered', true);
          } else {
            await this.telecomRepo.updateMessageStatus(msg.id, 'failed', true, result.error);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          await this.telecomRepo.updateMessageStatus(msg.id, 'failed', true, errMsg);
        }
      }
    } catch (err) {
      console.error('[Delivery Worker] Error processing queue:', err);
    }
  }
}
