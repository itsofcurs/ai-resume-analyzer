import React, { useState } from 'react';
import { CreditCard, Zap, Shield, TrendingUp } from 'lucide-react';

export function BillingCenter() {
  const [loading, setLoading] = useState(false);

  const handleSubscription = async (action: 'upgrade' | 'downgrade' | 'cancel') => {
    setLoading(true);
    // Real implementation would call /api/billing/{action}
    setTimeout(() => {
      setLoading(false);
      alert(`Subscription ${action} request processed successfully.`);
    }, 1000);
  };

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-white flex items-center gap-3">
        <CreditCard className="text-indigo-400" /> Subscription & Billing
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col justify-between shadow-lg">
          <div>
            <h3 className="text-gray-400 font-medium mb-1">Current Plan</h3>
            <div className="text-3xl font-bold text-white mb-2">Enterprise Pro</div>
            <p className="text-sm text-gray-500">Billed $499/mo automatically.</p>
          </div>
          <div className="mt-6 flex gap-2">
            <button disabled={loading} onClick={() => handleSubscription('downgrade')} className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 rounded-lg transition-colors">Downgrade</button>
            <button disabled={loading} onClick={() => handleSubscription('cancel')} className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm py-2 rounded-lg transition-colors">Cancel</button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-4">API Quota Usage</h3>
          <div className="mb-2 flex justify-between text-sm">
            <span>LLM Tokens</span>
            <span className="font-mono">845,000 / 1,000,000</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: '84.5%' }}></div>
          </div>
          <button className="mt-6 w-full flex items-center justify-center gap-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 py-2 rounded-lg text-sm transition-colors">
            <Zap size={16} /> Add Quota Block
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-4 flex items-center gap-2"><TrendingUp size={16} /> Projected Cost</h3>
          <div className="text-4xl font-bold text-white mb-1">$512.40</div>
          <p className="text-sm text-emerald-400 mb-4">-4% vs last month</p>
          <div className="text-sm text-gray-500 space-y-1">
            <div className="flex justify-between"><span>Base Plan</span><span>$499.00</span></div>
            <div className="flex justify-between"><span>Overage</span><span>$13.40</span></div>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
        <h3 className="text-xl font-bold text-white mb-4">Invoice History</h3>
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase bg-gray-800/50">
            <tr>
              <th className="px-4 py-3 rounded-tl-lg">Date</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 rounded-tr-lg text-right">Invoice</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-800">
              <td className="px-4 py-3">June 1, 2026</td>
              <td className="px-4 py-3">$499.00</td>
              <td className="px-4 py-3"><span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-full text-xs">Paid</span></td>
              <td className="px-4 py-3 text-right"><button className="text-indigo-400 hover:underline">Download PDF</button></td>
            </tr>
            <tr>
              <td className="px-4 py-3">May 1, 2026</td>
              <td className="px-4 py-3">$499.00</td>
              <td className="px-4 py-3"><span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-full text-xs">Paid</span></td>
              <td className="px-4 py-3 text-right"><button className="text-indigo-400 hover:underline">Download PDF</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
