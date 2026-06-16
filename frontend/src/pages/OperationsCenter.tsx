import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface SystemMetrics {
  queues: {
    resumeQueue: number;
    copilotQueue: number;
    autonomousQueue: number;
    learningQueue: number;
    emailQueue: number;
    failures: {
      resumeQueue: number;
      copilotQueue: number;
      autonomousQueue: number;
      learningQueue: number;
      emailQueue: number;
    };
  };
  telemetry: {
    activeUsers: number;
    tokenUsage: number;
    totalCost: number;
  };
  health: {
    status: string;
    uptime: number;
  };
}

export const OperationsCenter: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    queues: { 
      resumeQueue: 0, copilotQueue: 0, autonomousQueue: 0, learningQueue: 0, emailQueue: 0,
      failures: { resumeQueue: 0, copilotQueue: 0, autonomousQueue: 0, learningQueue: 0, emailQueue: 0 }
    },
    telemetry: { activeUsers: 0, tokenUsage: 0, totalCost: 0 },
    health: { status: 'Unknown', uptime: 0 }
  });

  const [lastEvent, setLastEvent] = useState<{type: string, timestamp: Date} | null>(null);

  useEffect(() => {
    // 1. Fetch initial state
    const fetchMetrics = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/certification/summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Map the summary endpoint data back to the format OperationsCenter expects
        setMetrics(prev => ({
          ...prev,
          queues: {
            ...prev.queues,
            resumeQueue: res.data.queues?.resumeQueue || 0,
            copilotQueue: res.data.queues?.copilotQueue || 0,
            emailQueue: res.data.queues?.emailQueue || 0,
            failures: {
              ...prev.queues.failures,
              resumeQueue: res.data.queues?.failures?.resumeQueue || 0,
              copilotQueue: res.data.queues?.failures?.copilotQueue || 0,
              emailQueue: res.data.queues?.failures?.emailQueue || 0,
            }
          },
          health: {
            status: res.data.apiAvailability > 99 ? 'Operational' : 'Degraded',
            uptime: prev.health.uptime + 10 // just incrementing mock for now since we drop uptime
          }
        }));
      } catch (err) {
        console.error("Failed to fetch operations metrics", err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000); // Polling as backup

    // 2. Connect Socket for live updates
    const token = localStorage.getItem('token');
    const socket: Socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
      auth: { token }
    });

    const handleJobEvent = (type: string) => {
      setLastEvent({ type, timestamp: new Date() });
      // We could increment/decrement specific queues here, but for simplicity we'll trigger a re-fetch
      fetchMetrics();
    };

    socket.on('job:started', () => handleJobEvent('job:started'));
    socket.on('job:progress', () => handleJobEvent('job:progress'));
    socket.on('job:completed', () => handleJobEvent('job:completed'));
    socket.on('job:failed', () => handleJobEvent('job:failed'));

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Enterprise Operations Center</h1>
          <p className="text-gray-500">Real-time system telemetry and queue observability.</p>
        </div>
        <div className="text-right">
          <p className={`font-semibold ${metrics.health.status === 'Operational' ? 'text-green-500' : 'text-yellow-500'}`}>
            {metrics.health.status}
          </p>
          <p className="text-xs text-gray-400">Uptime: {(metrics.health.uptime / 3600).toFixed(2)}h</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Resume Processing Queue Depth</h3>
          <p className="text-4xl font-bold text-blue-600 mt-2">{metrics.queues.resumeQueue}</p>
          <p className="text-xs text-red-400 mt-2">Failures: {metrics.queues.failures.resumeQueue}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Copilot Tasks Queue Depth</h3>
          <p className="text-4xl font-bold text-emerald-600 mt-2">{metrics.queues.copilotQueue}</p>
          <p className="text-xs text-red-400 mt-2">Failures: {metrics.queues.failures.copilotQueue}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Autonomous Agents Queue Depth</h3>
          <p className="text-4xl font-bold text-purple-600 mt-2">{metrics.queues.autonomousQueue}</p>
          <p className="text-xs text-red-400 mt-2">Failures: {metrics.queues.failures.autonomousQueue}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Learning Pipeline Queue Depth</h3>
          <p className="text-4xl font-bold text-orange-600 mt-2">{metrics.queues.learningQueue}</p>
          <p className="text-xs text-red-400 mt-2">Failures: {metrics.queues.failures.learningQueue}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Email Delivery Queue Depth</h3>
          <p className="text-4xl font-bold text-cyan-600 mt-2">{metrics.queues.emailQueue}</p>
          <p className="text-xs text-red-400 mt-2">Failures: {metrics.queues.failures.emailQueue}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Active Tenant Users</h3>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">{metrics.telemetry.activeUsers}</p>
        </div>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-500">Tokens Processed (Org)</h3>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">{metrics.telemetry.tokenUsage.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Total Cost: ${metrics.telemetry.totalCost.toFixed(4)}</p>
        </div>
      </div>

      {lastEvent && (
        <div className="text-xs text-gray-500 text-right">
          Last event received: {lastEvent.type} at {lastEvent.timestamp.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};
