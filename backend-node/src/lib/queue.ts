import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { logWithTrace } from './telemetry';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// Queues
export const resumeProcessingQueue = new Queue('resume-processing', { connection: connection as any });
export const autonomousAgentQueue = new Queue('autonomous-agent', { connection: connection as any });
export const forecastGenerationQueue = new Queue('forecast-generation', { connection: connection as any });
export const outreachSequenceQueue = new Queue('outreach-sequence', { connection: connection as any });

// Optional: Queue Events for tracking
const autonomousAgentEvents = new QueueEvents('autonomous-agent', { connection: connection as any });

autonomousAgentEvents.on('completed', ({ jobId }) => {
  logWithTrace('info', `Autonomous Agent Job ${jobId} completed`);
});

autonomousAgentEvents.on('failed', ({ jobId, failedReason }) => {
  logWithTrace('error', `Autonomous Agent Job ${jobId} failed: ${failedReason}`);
});
