import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { CreditCard, Users, Zap, CheckCircle2, AlertTriangle, ExternalLink, Activity } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const BillingDashboard: React.FC = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subRes, usageRes] = await Promise.all([
          axios.get(`${API_URL}/billing/subscription`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/billing/usage`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setSubscription(subRes.data);
        setUsage(usageRes.data.usage);
        setInvoices(usageRes.data.invoices);
      } catch (error) {
        console.error("Failed to fetch billing data", error);
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchData();
  }, [token]);

  const handleCheckout = async (priceId: string) => {
    try {
      const res = await axios.post(`${API_URL}/billing/checkout`, { priceId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (error) {
      console.error("Checkout failed", error);
    }
  };

  const handlePortal = async () => {
    try {
      const res = await axios.post(`${API_URL}/billing/portal`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (error) {
      console.error("Portal failed", error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Activity className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Billing & Subscription</h1>
        <p className="text-slate-600">Manage your TalentAI workspace plan and usage limits.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Plan Overview */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <CreditCard className="w-24 h-24" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CreditCard className="text-indigo-600 w-5 h-5" /> Current Plan
          </h2>
          
          <div className="mb-6">
            <span className="text-3xl font-black text-slate-900">{subscription?.planTier}</span>
            <span className={`ml-3 px-3 py-1 rounded-full text-xs font-bold ${
              subscription?.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {subscription?.status === 'active' ? 'Active' : 'Inactive / Trial'}
            </span>
          </div>

          <p className="text-sm text-slate-600 mb-6 max-w-md">
            Your current plan supports up to {usage?.seatsLimit} seats and {usage?.apiLimit} API credits per month.
          </p>

          <div className="flex gap-4">
            {subscription?.stripeCustomerId ? (
              <button 
                onClick={handlePortal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
              >
                Manage Subscription <ExternalLink className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={() => handleCheckout('price_mock_enterprise')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
              >
                Upgrade to Pro <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Usage Quotas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="text-indigo-600 w-5 h-5" /> Current Usage
          </h2>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 flex items-center gap-1"><Users className="w-4 h-4" /> Seats</span>
              <span className="font-semibold text-slate-800">{usage?.seatsUsed} / {usage?.seatsLimit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div 
                className="bg-indigo-500 h-2 rounded-full" 
                style={{ width: `${Math.min(((usage?.seatsUsed || 0) / (usage?.seatsLimit || 1)) * 100, 100)}%` }}
              ></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 flex items-center gap-1"><Zap className="w-4 h-4" /> API Credits</span>
              <span className="font-semibold text-slate-800">{usage?.apiUsage} / {usage?.apiLimit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div 
                className="bg-emerald-500 h-2 rounded-full" 
                style={{ width: `${Math.min(((usage?.apiUsage || 0) / (usage?.apiLimit || 1)) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Invoice History</h2>
        </div>
        <div className="p-0">
          {invoices.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Invoice ID</th>
                  <th className="px-6 py-3 font-semibold">Amount</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{inv.stripeInvoiceId}</td>
                    <td className="px-6 py-4 text-slate-800">${inv.amount.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-slate-500">
              No invoice history found.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
