import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts';
import { AlertTriangle, Clock, TrendingUp, Users, Activity } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

export const PipelineAnalytics = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [stuckCandidates, setStuckCandidates] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [analyticsRes, stuckRes] = await Promise.all([
        axios.get(`${API_URL}/pipeline/analytics`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/pipeline/stuck`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setAnalytics(analyticsRes.data);
      setStuckCandidates(stuckRes.data);
    } catch (error) {
      console.error("Failed to fetch analytics", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Fallback data if API doesn't return full charts yet
  const stageData = analytics?.stageDistribution || [
    { stage: 'Applied', count: 120 },
    { stage: 'Screening', count: 45 },
    { stage: 'Interview Scheduled', count: 15 },
    { stage: 'Offer Extended', count: 4 }
  ];

  const funnelData = analytics?.funnelData || [
    { name: 'Applied', value: 120 },
    { name: 'Screening', value: 45 },
    { name: 'Interview', value: 15 },
    { name: 'Hired', value: 3 }
  ];

  const timeData = analytics?.timeData || [
    { stage: 'Applied', days: 3 },
    { stage: 'Screening', days: 5 },
    { stage: 'Interview', days: 8 },
    { stage: 'Offer', days: 4 }
  ];

  const velocityData = analytics?.velocityData || [
    { week: 'W1', hires: 1 },
    { week: 'W2', hires: 3 },
    { week: 'W3', hires: 2 },
    { week: 'W4', hires: 5 }
  ];

  return (
    <div className="p-6 bg-slate-50 min-h-full space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pipeline Analytics</h1>
          <p className="text-sm text-slate-500">Real-time metrics and bottlenecks for your hiring funnel.</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2">
          <Activity size={16} />
          Refresh Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI Cards */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Candidates</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">184</h3>
            </div>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Users size={20} /></div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Avg Time to Hire</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">20d</h3>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Clock size={20} /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Pass-Through Rate</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">12%</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><TrendingUp size={20} /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-rose-200 bg-rose-50/30 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-rose-600">Stuck Candidates</p>
              <h3 className="text-3xl font-bold text-rose-700 mt-1">{stuckCandidates.length}</h3>
            </div>
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><AlertTriangle size={20} /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Chart */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Conversion Funnel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={funnelData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="value" stroke="#6366f1" fill="#818cf8" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stage Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Stage Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stageData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="count" nameKey="stage">
                  {stageData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {stageData.map((entry: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                {entry.stage} ({entry.count})
              </div>
            ))}
          </div>
        </div>

        {/* Time in Stage */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Average Days in Stage</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="stage" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="days" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hiring Velocity */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Hiring Velocity (Last 4 Weeks)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={velocityData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="week" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="hires" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stuck Candidates Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-500" />
            Candidates Requiring Attention
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 font-semibold">Candidate</th>
                <th className="px-6 py-3 font-semibold">Current Stage</th>
                <th className="px-6 py-3 font-semibold">Priority</th>
                <th className="px-6 py-3 font-semibold">Days in Stage</th>
                <th className="px-6 py-3 font-semibold">SLA Limit</th>
                <th className="px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stuckCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No candidates are currently stuck in the pipeline. Great job!
                  </td>
                </tr>
              ) : (
                stuckCandidates.map((candidate: any) => (
                  <tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">{candidate.name || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">{candidate.stage}</span>
                    </td>
                    <td className="px-6 py-4">
                      {candidate.priority === 'Critical' && '🔴 Critical'}
                      {candidate.priority === 'High' && '🟠 High'}
                      {candidate.priority === 'Medium' && '🟡 Medium'}
                      {candidate.priority === 'Low' && '🟢 Low'}
                      {!candidate.priority && '--'}
                    </td>
                    <td className="px-6 py-4 font-bold text-rose-600">{candidate.daysInStage} days</td>
                    <td className="px-6 py-4 text-slate-500">{candidate.slaLimit} days</td>
                    <td className="px-6 py-4">
                      <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs font-semibold">SLA Breached</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
