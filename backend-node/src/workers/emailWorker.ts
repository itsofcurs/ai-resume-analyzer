import { Job } from 'bullmq';
import { createWorker } from '../queues/queueManager';
import { sendEmailViaResend } from '../services/resendService';
import { EmailJobData } from '../queues/emailQueue';
import { prisma } from '../server';
import { 
  emailSuccessTotal, 
  emailFailureTotal, 
  emailRetryTotal, 
  emailProcessingTime,
  logger,
  logWithTrace
} from '../lib/telemetry';

export const emailWorker = createWorker('emailQueue', async (job: Job<EmailJobData>) => {
  const startTime = Date.now();
  const { to, subject, html, type } = job.data;
  
  try {
    logWithTrace('info', `Processing email job ${job.id} for ${to} (type: ${type})`);
    
    // Attempt delivery via Resend
    const response = await sendEmailViaResend({ to, subject, html, type });
    
    // Delivery successful
    emailSuccessTotal.add(1, { type });
    emailProcessingTime.record(Date.now() - startTime, { status: 'success' });

    // Update or create delivery log
    await prisma.emailDeliveryLog.create({
      data: {
        email: to,
        jobId: job.id,
        messageId: response?.id,
        status: 'DELIVERED', // Optimistic status, wait for webhook for truth
        type
      }
    });

    // Write audit log
    const user = await prisma.user.findUnique({ where: { email: to } });
    if (user) {
      let actionName = 'email_delivered';
      if (type === 'SEND_OTP') actionName = 'OTP_DELIVERED';
      
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId || 'system',
          action: actionName,
          resource: 'email',
        }
      });
    }

    return response;
  } catch (error: any) {
    if (job.attemptsMade < (job.opts.attempts || 3)) {
      emailRetryTotal.add(1, { type });
      logger.warn(`Email job ${job.id} failed, retrying... Attempt ${job.attemptsMade + 1}`);
      // Audit log retry
      const user = await prisma.user.findUnique({ where: { email: to } });
      if (user) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId || 'system',
            action: 'EMAIL_RETRY',
            resource: 'email',
          }
        });
      }
      throw error; // Will trigger backoff and retry
    } else {
      // Final failure
      emailFailureTotal.add(1, { type });
      emailProcessingTime.record(Date.now() - startTime, { status: 'failure' });
      logger.error(`Email job ${job.id} completely failed after ${job.attemptsMade} attempts`);
      
      await prisma.emailDeliveryLog.create({
        data: {
          email: to,
          jobId: job.id,
          status: 'FAILED',
          error: error.message || 'Unknown error',
          type
        }
      });

      const user = await prisma.user.findUnique({ where: { email: to } });
      if (user) {
        let actionName = 'email_failed';
        if (type === 'SEND_OTP') actionName = 'OTP_DELIVERY_FAILED';
        
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId || 'system',
            action: actionName,
            resource: 'email',
          }
        });
        
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId || 'system',
            action: 'EMAIL_DLQ',
            resource: 'email',
          }
        });
      }
      
      throw error;
    }
  }
});
