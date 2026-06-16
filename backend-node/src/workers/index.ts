import { autonomousAgentWorker } from './autonomousAgent';
import { resumeWorker } from './resumeWorker';
import { copilotWorker } from './copilotWorker';
import { learningWorker } from './learningWorker';
import { emailWorker } from './emailWorker';
import { startExportCleanupWorker } from './exportCleanupWorker';
import { scheduleExportCleanup } from '../queues/exportCleanupQueue';
import { startAuditRetentionWorker, scheduleAuditRetention } from './auditRetentionWorker';
import { logWithTrace } from '../lib/telemetry';

export const startWorkers = () => {
  logWithTrace('info', 'Starting background BullMQ workers...');
  
  const workers = [
    { name: 'Autonomous Agent', instance: autonomousAgentWorker },
    { name: 'Resume Processing', instance: resumeWorker },
    { name: 'Copilot', instance: copilotWorker },
    { name: 'Learning Pipeline', instance: learningWorker },
    { name: 'Email Delivery', instance: emailWorker },
    { name: 'Export Cleanup', instance: startExportCleanupWorker() },
    { name: 'Audit Retention', instance: startAuditRetentionWorker() }
  ];

  scheduleExportCleanup().catch(e => console.error('Failed to schedule export cleanup:', e));
  scheduleAuditRetention().catch(e => console.error('Failed to schedule audit retention:', e));

  workers.forEach(({ name, instance }) => {
    instance.on('ready', () => {
      logWithTrace('info', `${name} Worker is ready and listening to queue`);
    });

    instance.on('error', (err) => {
      logWithTrace('error', `${name} Worker error: ${err.message}`);
    });
  });
};
