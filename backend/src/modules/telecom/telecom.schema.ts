export interface OutboundMessage {
  id: string;
  farmer_id: string;
  alert_id?: string;
  channel: 'sms' | 'email' | 'ivr';
  recipient: string;
  message_type: string;
  message_text: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed';
  attempt_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface MessageAttempt {
  message_id: string;
  attempt_number: number;
  status: string;
  error_message?: string;
  created_at: Date;
}

export interface DispatchAlertRequest {
  alert_id: string;
  grid_id: string;
  severity: 'high' | 'medium' | 'low';
  message_en: string;
  message_my: string;
}
