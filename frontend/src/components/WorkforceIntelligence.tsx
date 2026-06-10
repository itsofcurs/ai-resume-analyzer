import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Network, TrendingDown, TrendingUp, Users } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const WorkforceIntelligence = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/analytics/workforce`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch workforce data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (loading) return <div className="h-48 flex items-center justify-center text-slate-500">Loading Workforce Intelligence...</div>;
  if (!data) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Network className="text-indigo-600" />
          Workforce Intelligence
        </h3>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="text-sm font-medium text-slate-500 mb-1">Total Employees (Hired)</div>
          <div className="text-3xl font-black text-slate-800">{data.metrics.totalEmployees}</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="text-sm font-medium text-slate-500 mb-1">Global Attrition Risk</div>
          <div className={`text-3xl font-black ${data.attritionRisk > 30 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {data.attritionRisk}%
          </div>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="text-sm font-medium text-slate-500 mb-1">Diversity Score</div>
          <div className={`text-xl font-black ${data.metrics.diversityScore === null ? 'text-slate-400 text-sm' : 'text-indigo-600 text-3xl'}`}>
            {data.metrics.diversityScore !== null ? `${data.metrics.diversityScore}/100` : 'Diversity analytics unavailable'}
          </div>
        </div>
      </div>

      <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Top Organizational Skill Gaps</h4>
      <div className="space-y-3">
        {data.skillGaps.map((gap: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-3 bg-rose-50/50 rounded-xl border border-rose-100">
            <span className="font-semibold text-rose-900">{gap.skill}</span>
            <span className="text-sm text-rose-600 font-medium">{gap.count} candidates missing</span>
          </div>
        ))}
      </div>
    </div>
  );
};
