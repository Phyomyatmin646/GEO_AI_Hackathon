import type { DispatchAlertRequest, OutboundMessage } from './telecom.schema.js';
import type { TelecomRepository } from './telecom.repository.js';
import type { FarmerRepository } from './farmer.repository.js';

export class TelecomRouter {
  constructor(
    private readonly telecomRepo: TelecomRepository,
    private readonly farmerRepo: FarmerRepository
  ) {}

  async dispatchAlert(request: DispatchAlertRequest): Promise<{ queuedCount: number }> {
    // 1. Find farmers in the affected grid
    const farmers = await this.farmerRepo.getFarmers({ grid_id: request.grid_id });
    
    if (farmers.length === 0) {
      return { queuedCount: 0 };
    }

    const messagesToQueue: Omit<OutboundMessage, 'id' | 'created_at' | 'updated_at'>[] = [];

    // 2. Apply Communication Rule
    // Emergency -> SMS primary
    for (const farmer of farmers) {
      // getFarmers joins with preferences? Wait, getFarmers just selects f.* from farmers.
      // We need to fetch preferences if they aren't included!
      const prefsRes = await this.telecomRepo['db'].query(
        'SELECT * FROM farmer_communication_preferences WHERE farmer_id = $1', [farmer.id]
      );
      const prefs = prefsRes.rows[0];
      const messageText = farmer.preferred_language === 'en' ? request.message_en : request.message_my;

      if (prefs?.sms_enabled && farmer.phone_number) {
        messagesToQueue.push({
          farmer_id: farmer.id,
          alert_id: request.alert_id,
          channel: 'sms',
          recipient: farmer.phone_number,
          message_type: request.severity === 'high' ? 'emergency_alert' : 'advisory',
          message_text: messageText,
          status: 'queued',
          attempt_count: 0
        });
      }

      if (prefs?.email_enabled && farmer.email) {
        messagesToQueue.push({
          farmer_id: farmer.id,
          alert_id: request.alert_id,
          channel: 'email',
          recipient: farmer.email,
          message_type: request.severity === 'high' ? 'emergency_alert' : 'advisory',
          message_text: messageText,
          status: 'queued',
          attempt_count: 0
        });
      }
    }

    // 3. Queue messages in DB
    const queued = await this.telecomRepo.queueMessages(messagesToQueue);

    return { queuedCount: queued.length };
  }
}
