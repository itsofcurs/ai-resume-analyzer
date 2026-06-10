import { createWorker } from '../queues/queueManager';
import { Job } from 'bullmq';
import axios from 'axios';
import { logWithTrace } from '../lib/telemetry';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

export const autonomousAgentWorker = createWorker('autonomous-agent', async (job: Job) => {
  const { candidateId, triggerSource } = job.data;
  logWithTrace('info', `Processing autonomous agent job for candidate ${candidateId}`, { jobId: job.id, triggerSource });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/autonomous/run`, {
      candidate_id: candidateId,
      trigger_source: triggerSource,
    }, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || 'internal-secret' }
    });
    
    logWithTrace('info', `Autonomous agent finished for candidate ${candidateId}`, { status: response.data.status });
    return response.data;
  } catch (error: any) {
    logWithTrace('error', `Autonomous agent failed for candidate ${candidateId}`, { error: error.message });
    throw error;
  }
});
