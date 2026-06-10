import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import {
  queueWaitTime,
  queueProcessingTime,
  queueFailureTotal,
  logger,
  logWithTrace
} from '../lib/telemetry';

// Central Redis connection for BullMQ
export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const DLQ_SUFFIX = '-dlq';

/**
 * Helper to create a Queue with standard enterprise settings
 */
export const createQueue = (queueName: string) => {
  const queue = new Queue(queueName, { 
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: 1000,
      removeOnFail: false, // Keep failed jobs so we can move them to DLQ
    }
  });

  const dlq = new Queue(`${queueName}${DLQ_SUFFIX}`, { connection });

  // Queue Events for Telemetry
  const queueEvents = new QueueEvents(queueName, { connection });

  queueEvents.on('completed', ({ jobId, returnvalue, prev }) => {
    // We can't directly measure processing time here without the job instance's processedOn
    // But we will handle metric increments in the worker lifecycle below
    logger.info(`Job ${jobId} completed in ${queueName}`);
  });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    logger.error(`Job ${jobId} failed in ${queueName}: ${failedReason}`);
    queueFailureTotal.add(1, { queue: queueName });

    try {
      const job = await queue.getJob(jobId);
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        logger.warn(`Moving job ${jobId} to DLQ for ${queueName}`);
        await dlq.add(job.name, job.data, {
          jobId: job.id, // Idempotency
        });
      }
    } catch (e) {
      logger.error(`Failed to move job ${jobId} to DLQ: ${e}`);
    }
  });

  return { queue, dlq };
};

/**
 * Helper to wrap Worker logic with Opentelemetry timers
 */
export const createWorker = (
  queueName: string, 
  processor: (job: Job) => Promise<any>
) => {
  const worker = new Worker(queueName, async (job: Job) => {
    const waitTime = Date.now() - job.timestamp;
    queueWaitTime.record(waitTime, { queue: queueName });

    const startTime = Date.now();
    try {
      const result = await processor(job);
      return result;
    } finally {
      const processingTime = Date.now() - startTime;
      queueProcessingTime.record(processingTime, { queue: queueName });
    }
  }, { connection });

  worker.on('error', err => {
    logger.error(`Worker error on ${queueName}: ${err}`);
  });

  return worker;
};
