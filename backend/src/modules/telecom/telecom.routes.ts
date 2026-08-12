import type { FastifyPluginAsync } from 'fastify';
import type { DispatchAlertRequest } from './telecom.schema.js';
import type { TelecomRouter } from './telecom.router.js';
import type { TelecomRepository } from './telecom.repository.js';
import type { Pool } from 'pg';
import { sendOfficerEmail } from './reports.js';

const telecomRoutes: FastifyPluginAsync<{ pool: Pool; router: TelecomRouter; repo: TelecomRepository }> = async (
  fastify,
  opts,
) => {
  const { router, repo } = opts;

  // Endpoint to manually dispatch an alert (for demo)
  fastify.post('/alert/dispatch', async (request, reply) => {
    const payload = request.body as DispatchAlertRequest;
    const result = await router.dispatchAlert(payload);
    return reply.send(result);
  });

  // Dashboard API: Get recent messages
  fastify.get('/messages', async (request, reply) => {
    const result = await opts.pool.query(
      `SELECT * FROM outbound_messages ORDER BY created_at DESC LIMIT 100`
    );
    return reply.send(result.rows);
  });

  // Dashboard API: Stats
  fastify.get('/stats', async (request, reply) => {
    const [sent, failed, queued] = await Promise.all([
      opts.pool.query(`SELECT count(*) as count FROM outbound_messages WHERE status = 'delivered'`),
      opts.pool.query(`SELECT count(*) as count FROM outbound_messages WHERE status = 'failed'`),
      opts.pool.query(`SELECT count(*) as count FROM outbound_messages WHERE status = 'queued'`),
    ]);
    return reply.send({
      total_sent: Number(sent.rows[0]?.count || 0),
      total_failed: Number(failed.rows[0]?.count || 0),
      total_queued: Number(queued.rows[0]?.count || 0)
    });
  });

  // USSD Webhook
  fastify.post('/ussd', async (request, reply) => {
    const body = request.body as { phone_number: string; text: string; session_id: string };
    
    // Simple USSD Menu flow
    let responseText = "Welcome to Hcitepyoe Matesway.\n1. Check alerts\n2. Report issue\n3. Exit";
    
    if (body.text === "1") {
      responseText = "No severe alerts in your area.";
    } else if (body.text === "2") {
      responseText = "Please describe the issue (e.g. flood, drought):";
    } else if (body.text.toLowerCase().includes("flood") || body.text.toLowerCase().includes("drought")) {
      // Create a farmer report
      await opts.pool.query(
        `INSERT INTO farmer_reports (farmer_id, channel, report_type, message_text, verification_status)
         VALUES ((SELECT id FROM farmers WHERE phone_number = $1 LIMIT 1), 'ussd', $2, $3, 'pending')`,
        [body.phone_number, 'issue_report', body.text]
      );
      responseText = "Thank you. Your report has been submitted.";
    } else if (body.text === "3") {
      responseText = "Goodbye.";
    }
    
    return reply.send({ response: responseText });
  });

  // SMS Inbound Webhook (Farmer reporting via SMS)
  fastify.post('/sms/inbound', async (request, reply) => {
    const body = request.body as { from: string; text: string };
    
    await opts.pool.query(
      `INSERT INTO farmer_reports (farmer_id, channel, report_type, message_text, verification_status)
       VALUES ((SELECT id FROM farmers WHERE phone_number = $1 LIMIT 1), 'sms', 'issue_report', $2, 'pending')`,
      [body.from, body.text]
    );
    
    return reply.send({ success: true });
  });

  // Dashboard API: Get reports
  fastify.get('/reports', async (request, reply) => {
    const result = await opts.pool.query(
      `SELECT r.*, f.username, f.region, f.phone_number 
       FROM farmer_reports r 
       LEFT JOIN farmers f ON r.farmer_id = f.id 
       ORDER BY r.id DESC LIMIT 50`
    );
    return reply.send(result.rows);
  });

  // Dashboard API: Submit a report from Pilot Review
  fastify.post('/reports', async (request, reply) => {
    const body = request.body as { grid_id: string; message_text: string; username?: string; phone_number?: string };
    
    const result = await opts.pool.query(
      `INSERT INTO farmer_reports (grid_id, channel, report_type, message_text, verification_status)
       VALUES ($1, 'web_dashboard', 'pilot_review', $2, 'pending') RETURNING *`,
      [body.grid_id, body.message_text]
    );
    
    // Trigger email to officer
    await sendOfficerEmail({ ...result.rows[0], username: body.username, phone_number: body.phone_number });
    
    return reply.send({ success: true, report: result.rows[0] });
  });

  // API to trigger weather/disaster alert to farmers
  fastify.post('/alert/weather', async (request, reply) => {
    const body = request.body as { grid_id: string; alert_type: string; message: string };
    
    const result = await opts.router.dispatchAlert({
      grid_id: body.grid_id,
      alert_id: body.alert_type || 'weather_alert',
      severity: 'high',
      message_en: body.message,
      message_my: body.message
    });

    return reply.send({ success: true, queued_messages: result.queuedCount });
  });
};

export default telecomRoutes;
