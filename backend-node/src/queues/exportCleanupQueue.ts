import { Queue } from 'bullmq';
import { bullMqConnection } from '../server';

export const exportCleanupQueue = new Queue('export-cleanup', {
  connection: bullMqConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100
  }
});

export const scheduleExportCleanup = async () => {
  await exportCleanupQueue.add('cleanup-expired-exports', {}, {
    repeat: {
      pattern: '0 * * * *' // Every hour
    }
  });
};
