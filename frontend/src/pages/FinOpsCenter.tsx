import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import axios from 'axios';

export function FinOpsCenter() {
  const [trends, setTrends] = useState<any[]>([]);

  useEffect(() => {
    axios.get('http://localhost:8000/api/reports/cost-trends')
      .then(res => setTrends(res.data.trends || []))
      .catch(e => console.error(e));
  }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-white flex items-center gap-3">
        <DollarSign className="text-emerald-400" /> FinOps Governance
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2">Total AI Cost (MTD)</h3>
          <div className="text-4xl font-bold text-white mb-1">$412.50</div>
          <p className="text-xs text-emerald-400 flex items-center gap-1"><TrendingDown size={14}/> 12% under budget</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2">Cost Per Hire</h3>
          <div className="text-4xl font-bold text-white mb-1">$8.25</div>
          <p className="text-xs text-gray-500">Average across all workflows</p>
        </div>
        <div className="bg-gray-900 border border-orange-500/50 rounded-xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">ALERT</div>
          <h3 className="text-gray-400 font-medium mb-2">Projected Overage</h3>
          <div className="text-4xl font-bold text-orange-400 mb-1">$85.00</div>
          <p className="text-xs text-orange-300 flex items-center gap-1"><AlertTriangle size={14}/> Budget cap approaching in 4 days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Cost Allocation by Workflow</h2>
          <div className="space-y-4">
            {trends.length > 0 ? trends.map((t, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-300 font-medium">{t.workflowName}</span>
                <div className="text-right">
                  <div className="text-white">${t._sum.totalCost?.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">{t._sum.tokensUsed?.toLocaleString()} tokens</div>
                </div>
              </div>
            )) : (
              <div className="text-gray-500 italic">No cost data available yet. Use the system to generate AI requests.</div>
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Budget Limits</h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">Soft Limit Warning ($400.00)</span>
                <span className="text-red-400">Triggered</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">Hard Limit Cap ($500.00)</span>
                <span className="text-emerald-400">$87.50 remaining</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '82.5%' }}></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">When hard limit is reached, AI features degrade to fallback models or pause until next billing cycle.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
