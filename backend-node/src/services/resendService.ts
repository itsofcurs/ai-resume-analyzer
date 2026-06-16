import { Resend } from 'resend';
import { logWithTrace, logger } from '../lib/telemetry';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');
const EMAIL_FROM = process.env.EMAIL_FROM || 'TalentAI Security <security@talentai.app>';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  type: string;
}

export const sendEmailViaResend = async ({ to, subject, html, type }: SendEmailParams) => {
  logWithTrace('info', `[RESEND] Attempting to send ${type} email to ${to}`);

  try {
    const data = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (data.error) {
      logger.error(`[RESEND] API returned error: ${data.error.message}`);
      throw new Error(data.error.message);
    }

    logWithTrace('info', `[RESEND] Successfully sent ${type} email`, { messageId: data.data?.id });
    return data.data;
  } catch (error: any) {
    logger.error(`[RESEND] Exception sending ${type} email: ${error.message}`);
    throw error;
  }
};
