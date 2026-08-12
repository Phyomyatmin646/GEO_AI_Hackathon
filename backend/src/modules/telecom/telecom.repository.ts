import type { Pool } from 'pg';
import type { OutboundMessage } from './telecom.schema.js';
import { randomUUID } from 'node:crypto';

export class TelecomRepository {
  constructor(private readonly db: Pool) {}

  async queueMessages(messages: Omit<OutboundMessage, 'id' | 'created_at' | 'updated_at'>[]): Promise<OutboundMessage[]> {
    if (messages.length === 0) return [];
    
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const inserted: OutboundMessage[] = [];
      
      for (const msg of messages) {
        const id = randomUUID();
        const result = await client.query(
          `INSERT INTO outbound_messages (
            id, farmer_id, alert_id, channel, recipient, 
            message_type, message_text, status, attempt_count, 
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING *`,
          [id, msg.farmer_id, msg.alert_id || null, msg.channel, msg.recipient, msg.message_type, msg.message_text, msg.status, msg.attempt_count]
        );
        inserted.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return inserted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async fetchQueuedMessages(limit: number = 50): Promise<OutboundMessage[]> {
    const result = await this.db.query(
      `SELECT * FROM outbound_messages 
       WHERE status IN ('queued', 'failed') AND attempt_count < 3 
       ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async markMessageSending(id: string): Promise<void> {
    await this.db.query(
      `UPDATE outbound_messages SET status = 'sending', updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async updateMessageStatus(
    id: string, 
    status: OutboundMessage['status'], 
    incrementAttempt: boolean,
    error_message?: string
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const msgResult = await client.query(`SELECT attempt_count FROM outbound_messages WHERE id = $1`, [id]);
      if (msgResult.rowCount === 0) return;

      const currentAttempt = msgResult.rows[0].attempt_count;
      const newAttemptCount = incrementAttempt ? currentAttempt + 1 : currentAttempt;

      await client.query(
        `UPDATE outbound_messages SET status = $1, attempt_count = $2, updated_at = NOW() WHERE id = $3`,
        [status, newAttemptCount, id]
      );

      if (incrementAttempt) {
        await client.query(
          `INSERT INTO message_attempts (message_id, attempt_number, status, error_message, provider, attempted_at)
           VALUES ($1, $2, $3, $4, 'n8n', NOW())`,
          [id, newAttemptCount, status, error_message || null]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
