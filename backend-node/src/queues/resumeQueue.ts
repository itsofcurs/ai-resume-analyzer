import { createQueue } from './queueManager';

export const { queue: resumeQueue, dlq: resumeDlq } = createQueue('resume-processing');

// Helper to push a job with an idempotency key (jobId)
export const enqueueResumeJob = async (resumeId: string, organizationId: string, data: any) => {
  return await resumeQueue.add('process-resume', data, {
    jobId: `resume-${resumeId}`, // Idempotency protection
  });
};
