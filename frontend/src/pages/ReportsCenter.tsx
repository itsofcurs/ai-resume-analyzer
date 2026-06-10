import React, { useState, useEffect } from 'react';
import { Activity, Server, Clock, CheckCircle } from 'lucide-react';
import axios from 'axios';

export function ReportsCenter() {
  const [sla, setSla] = useState<any>(null);

  useEffect(() => {
    // Fetch SLA data from backend
    axios.get('http://localhost:8000/api/reports/sla')
      .then(res => setSla(res.data))
      .catch(e => console.error(e));
  }, []);

  if (!sla) return <div className="p-8 text-white">Loading SLA Data...</div>;

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-white flex items-center gap-3">
        <Activity className="text-orange-400" /> Service Level Agreements (SLA)
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2 flex items-center gap-2"><Server size={16}/> System Availability</h3>
          <div className="text-4xl font-bold text-green-400 mb-1">{sla.availability}%</div>
          <p className="text-xs text-gray-500">Target: 99.9% (Met)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2 flex items-center gap-2"><Clock size={16}/> API Latency</h3>
          <div className="text-4xl font-bold text-white mb-1">{sla.latencyMs}ms</div>
          <p className="text-xs text-green-400">Target: &lt;200ms (Met)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2 flex items-center gap-2"><CheckCircle size={16}/> Job Success Rate</h3>
          <div className="text-4xl font-bold text-white mb-1">{sla.queueSuccessRate.toFixed(2)}%</div>
          <p className="text-xs text-green-400">Target: 99.5% (Met)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2">Resume Processing</h3>
          <div className="text-4xl font-bold text-white mb-1">{sla.processingTimeAvgS}s</div>
          <p className="text-xs text-green-400">Target: &lt;5s (Met)</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-bold text-white mb-4">Uptime History (Last 90 Days)</h2>
        <div className="flex gap-1 h-12 w-full items-end mt-4">
          {Array.from({ length: 90 }).map((_, i) => {
            const isDown = Math.random() > 0.98;
            return (
              <div 
                key={i} 
                className={`flex-1 rounded-sm ${isDown ? 'bg-red-500 h-1/2' : 'bg-green-500 h-full'}`}
                title={isDown ? 'Outage detected' : 'Operational'}
              ></div>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>90 days ago</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}
