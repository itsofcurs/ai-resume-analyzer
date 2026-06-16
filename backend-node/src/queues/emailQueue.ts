import { createQueue } from './queueManager';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  type: string; // SEND_OTP, SEND_PASSWORD_RESET, SEND_INVITATION, etc.
}

const { queue: emailQueue, dlq: emailDlq } = createQueue('emailQueue');

export { emailQueue, emailDlq };
