import { Worker, Queue } from 'bullmq';
import { redisClient, prisma } from '../server';

export const auditRetentionQueue = new Queue('audit-retention', {
  connection: redisClient as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100
  }
});

export const scheduleAuditRetention = async () => {
  await auditRetentionQueue.add('prune-audit-logs', {}, {
    repeat: {
      pattern: '0 0 * * *' // Every day at midnight
    }
  });
};

export const startAuditRetentionWorker = () => {
  const worker = new Worker('audit-retention', async (job) => {
    try {
      // Retention Policies:
      // CRITICAL: 365 days
      // HIGH: 180 days
      // Others: 90 days
      
      const now = new Date();
      
      const criticalCutoff = new Date(now);
      criticalCutoff.setDate(criticalCutoff.getDate() - 365);
      
      const highCutoff = new Date(now);
      highCutoff.setDate(highCutoff.getDate() - 180);
      
      const standardCutoff = new Date(now);
      standardCutoff.setDate(standardCutoff.getDate() - 90);

      // Delete standard logs
      const r1 = await prisma.auditLog.deleteMany({
        where: { severity: { notIn: ['CRITICAL', 'HIGH'] }, timestamp: { lt: standardCutoff } }
      });

      // Delete high logs
      const r2 = await prisma.auditLog.deleteMany({
        where: { severity: 'HIGH', timestamp: { lt: highCutoff } }
      });

      // Delete critical logs
      const r3 = await prisma.auditLog.deleteMany({
        where: { severity: 'CRITICAL', timestamp: { lt: criticalCutoff } }
      });

      console.log(`Pruned ${r1.count} standard, ${r2.count} high, ${r3.count} critical audit logs.`);
    } catch (error) {
      console.error('Audit retention worker failed:', error);
      throw error;
    }
  }, { connection: redisClient as any });

  worker.on('failed', (job, err) => {
    console.error(`Audit Retention Job failed:`, err);
  });

  return worker;
};
