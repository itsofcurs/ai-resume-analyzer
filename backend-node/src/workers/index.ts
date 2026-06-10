import { autonomousAgentWorker } from './autonomousAgent';
import { logWithTrace } from '../lib/telemetry';

export const startWorkers = () => {
  logWithTrace('info', 'Starting background workers...');
  
  autonomousAgentWorker.on('ready', () => {
    logWithTrace('info', 'Autonomous Agent Worker is ready and listening to queue');
  });

  autonomousAgentWorker.on('error', (err) => {
    logWithTrace('error', `Autonomous Agent Worker error: ${err.message}`);
  });
};
