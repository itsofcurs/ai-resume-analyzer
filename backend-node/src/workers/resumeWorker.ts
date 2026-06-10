import { createWorker } from '../queues/queueManager';
import { Job } from 'bullmq';
import axios from 'axios';
import { io } from '../server';
import { logger } from '../lib/telemetry';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

export const resumeWorker = createWorker('resume-processing', async (job: Job) => {
  logger.info(`Processing resume job ${job.id}`);
  
  // Notify frontend that processing has started
  io.to(job.data.organizationId).emit('job:started', {
    jobId: job.id,
    type: 'resume-processing',
    status: 'in-progress'
  });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/process`, job.data, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key' }
    });
    
    io.to(job.data.organizationId).emit('job:completed', {
      jobId: job.id,
      type: 'resume-processing',
      status: 'completed',
      result: response.data
    });

    return response.data;
  } catch (error: any) {
    logger.error(`Resume job ${job.id} failed: ${error.message}`);
    
    io.to(job.data.organizationId).emit('job:failed', {
      jobId: job.id,
      type: 'resume-processing',
      status: 'failed',
      error: error.message
    });
    
    throw error;
  }
});
