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
