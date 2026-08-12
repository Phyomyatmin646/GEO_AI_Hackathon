export interface NotificationProvider {
  send(recipient: string, text: string): Promise<{ success: boolean; error?: string }>;
}

export class MockSmsProvider implements NotificationProvider {
  async send(recipient: string, text: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[MOCK SMS] Sending to ${recipient}...`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simulate 10% failure rate for demo retries
    if (Math.random() < 0.1) {
      console.log(`[MOCK SMS] Failed to send to ${recipient}`);
      return { success: false, error: 'Network timeout' };
    }
    
    console.log(`[MOCK SMS] Successfully sent to ${recipient}: "${text}"`);
    return { success: true };
  }
}

export class MockEmailProvider implements NotificationProvider {
  async send(recipient: string, text: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[MOCK EMAIL] Sending to ${recipient}...`);
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(`[MOCK EMAIL] Successfully sent to ${recipient}: "${text}"`);
    return { success: true };
  }
}

export class MockIvrProvider implements NotificationProvider {
  async send(recipient: string, text: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[MOCK IVR] Calling ${recipient} to play voice alert...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`[MOCK IVR] Call finished with ${recipient}`);
    return { success: true };
  }
}

import nodemailer from 'nodemailer';

export class SmtpEmailProvider implements NotificationProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(recipient: string, text: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[SMTP EMAIL] Sending to ${recipient}...`);
      await this.transporter.sendMail({
        from: `"Myanmar Agri Geo" <${process.env.SMTP_USER}>`,
        to: recipient,
        subject: 'Weekly Crop Prediction Alert',
        text: text,
      });
      console.log(`[SMTP EMAIL] Successfully sent to ${recipient}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[SMTP EMAIL] Failed to send to ${recipient}:`, error);
      return { success: false, error: error.message || 'SMTP failed' };
    }
  }
}

export class N8nNotificationProvider implements NotificationProvider {
  constructor(private readonly webhookUrl: string, private readonly channel: 'sms' | 'email') {}

  async send(recipient: string, text: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[N8N ${this.channel.toUpperCase()}] Sending to ${recipient}...`);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient,
          message: text,
          channel: this.channel
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[N8N ${this.channel.toUpperCase()}] Failed:`, errText);
        return { success: false, error: `n8n HTTP ${response.status}: ${errText}` };
      }

      console.log(`[N8N ${this.channel.toUpperCase()}] Successfully sent to ${recipient}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[N8N ${this.channel.toUpperCase()}] Network error:`, error);
      return { success: false, error: error.message || 'Network error connecting to n8n' };
    }
  }
}
