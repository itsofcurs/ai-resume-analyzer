import { Worker } from 'bullmq';
import { bullMqConnection, prisma } from '../server';
import { deleteExport } from '../services/exportStorageService';
import { gdprExportsDeletedTotal, gdprExportFailuresTotal } from '../lib/telemetry';

export const startExportCleanupWorker = () => {
  const worker = new Worker('export-cleanup', async (job) => {
    try {
      const expiredExports = await prisma.exportRequest.findMany({
        where: {
          expiresAt: { lt: new Date() },
          status: { in: ['READY', 'EXPIRED'] }
        }
      });

      for (const exp of expiredExports) {
        if (exp.storagePath) {
          try {
            await deleteExport(exp.storagePath);
          } catch (e) {
            console.error(`Failed to delete storage for export ${exp.id}:`, e);
          }
        }

        await prisma.exportRequest.update({
          where: { id: exp.id },
          data: { status: 'DELETED', storagePath: null }
        });

        gdprExportsDeletedTotal.add(1);
        
        await prisma.auditLog.create({
          data: {
            userId: exp.userId,
            organizationId: 'system',
            action: 'GDPR_EXPORT_DELETED',
            resource: 'export',
            severity: 'INFO'
          }
        });
      }
    } catch (error) {
      gdprExportFailuresTotal.add(1);
      console.error('Export cleanup worker failed:', error);
      throw error;
    }
  }, { connection: bullMqConnection as any });

  worker.on('failed', (job, err) => {
    console.error(`Export Cleanup Job failed:`, err);
  });

  return worker;
};
