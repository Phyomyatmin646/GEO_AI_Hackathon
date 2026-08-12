import nodemailer from 'nodemailer';
import type { Pool } from 'pg';

export async function sendOfficerEmail(reportDetails: any) {
  const officerEmail = process.env.OFFICER_EMAIL;
  if (!officerEmail) {
    console.log('[OFFICER REPORT] No OFFICER_EMAIL configured, skipping email.');
    return;
  }
  
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const text = `
New Agriculture Report Received:

Report Type: ${reportDetails.report_type}
Channel: ${reportDetails.channel}
Grid ID: ${reportDetails.grid_id || 'N/A'}
Farmer Phone: ${reportDetails.phone_number || 'N/A'}
Farmer Name: ${reportDetails.username || 'N/A'}

Message/Review Notes:
${reportDetails.message_text}

Submitted at: ${new Date().toISOString()}
    `;

    await transporter.sendMail({
      from: `"Myanmar Agri Geo" <${process.env.SMTP_USER}>`,
      to: officerEmail,
      subject: `[Agri Alert] New Report from ${reportDetails.username || reportDetails.grid_id || 'Farmer'}`,
      text,
    });
    console.log(`[OFFICER REPORT] Successfully sent report email to ${officerEmail}`);
  } catch (error) {
    console.error(`[OFFICER REPORT] Failed to send email to ${officerEmail}:`, error);
  }
}
