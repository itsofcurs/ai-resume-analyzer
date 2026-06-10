import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Server, Activity, Database, Zap } from 'lucide-react';

interface CostAnalytics {
  totals: {
    tokens: number;
    prompt: number;
    completion: number;
    total: number;
  };
  byWorkflow: Array<{
    workflowName: string;
    _sum: {
      totalCost: number;
      tokensUsed: number;
    };
  }>;
}

export function AICostCenter() {
  const [analytics, setAnalytics] = useState<CostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/cost/analytics`, {
          withCredentials: true,
        });
        setAnalytics(response.data);
      } catch (error) {
        console.error('Failed to fetch AI cost analytics:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCosts();
  }, []);

  if (loading || !analytics) {
    return <div className="p-8 text-center text-zinc-400">Loading Cost Intelligence...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">AI Cost Intelligence</h1>
        <p className="text-zinc-400 mt-2">Monitor AI token consumption and financial spend.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-[#2A2A2A] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500"><Server size={48} /></div>
          <div className="text-sm font-medium text-zinc-400 mb-1">Total AI Spend</div>
          <div className="text-3xl font-bold text-emerald-400">${analytics.totals.total.toFixed(4)}</div>
        </div>
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-[#2A2A2A] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-500"><Database size={48} /></div>
          <div className="text-sm font-medium text-zinc-400 mb-1">Tokens Consumed</div>
          <div className="text-3xl font-bold text-white">{analytics.totals.tokens.toLocaleString()}</div>
        </div>
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-[#2A2A2A] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500"><Zap size={48} /></div>
          <div className="text-sm font-medium text-zinc-400 mb-1">Prompt Cost</div>
          <div className="text-3xl font-bold text-amber-400">${analytics.totals.prompt.toFixed(4)}</div>
        </div>
        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-[#2A2A2A] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-purple-500"><Activity size={48} /></div>
          <div className="text-sm font-medium text-zinc-400 mb-1">Completion Cost</div>
          <div className="text-3xl font-bold text-purple-400">${analytics.totals.completion.toFixed(4)}</div>
        </div>
      </div>

      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg mt-8">
        <div className="p-6 border-b border-[#2A2A2A]">
          <h2 className="text-xl font-bold text-white">Spend by Workflow</h2>
        </div>
        <table className="min-w-full divide-y divide-[#2A2A2A]">
          <thead className="bg-[#222]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Workflow</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Tokens Used</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2A2A]">
            {analytics.byWorkflow.map((wf) => (
              <tr key={wf.workflowName} className="hover:bg-[#222] transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-white">{wf.workflowName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">
                  {wf._sum.tokensUsed?.toLocaleString() || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-400 font-mono">
                  ${(wf._sum.totalCost || 0).toFixed(4)}
                </td>
              </tr>
            ))}
            {analytics.byWorkflow.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">No workflow cost data available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
