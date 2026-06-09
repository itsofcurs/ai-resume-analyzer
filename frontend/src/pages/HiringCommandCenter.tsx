import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { ShieldAlert, TrendingUp, Users, Activity, Target, BrainCircuit, AlertTriangle, X } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
}

export const HiringCommandCenter = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState({
    healthScore: 0,
    highRisk: 0,
    futureLeaders: 0,
    atsPassRate: 0
  });
  const [skills, setSkills] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token } });

    const fetchDashData = async () => {
      try {
        const [dashRes, skillsRes] = await Promise.all([
          axios.get(`${API_URL}/api/analytics/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/api/analytics/skills`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setStats({
          healthScore: dashRes.data.healthScore || 0,
          highRisk: dashRes.data.highRiskCandidates || 0,
          futureLeaders: 0, // Placeholder
          atsPassRate: dashRes.data.averageATSScore || 0
        });
        setSkills(skillsRes.data);
      } catch (err) {
        console.error("Command Center fetch error", err);
      }
    };
    fetchDashData();

    socket.on('PROACTIVE_ALERT', (data: any) => {
      setAlerts(prev => [{ id: Date.now().toString(), ...data }, ...prev].slice(0, 5));
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Executive Hiring Command Center</h1>
          <p className="text-slate-500 mt-1">Real-time organizational hiring intelligence and proactive alerts.</p>
        </div>
      </div>

      {/* Proactive Alerts Banner Area */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div key={alert.id} className={`p-4 rounded-xl border flex items-center justify-between shadow-sm animate-fade-in ${
              alert.severity === 'high' 
                ? 'bg-rose-50 border-rose-200 text-rose-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-center gap-3">
                <AlertTriangle className={alert.severity === 'high' ? 'text-rose-500' : 'text-amber-500'} size={20} />
                <span className="font-medium text-sm">{alert.message}</span>
              </div>
              <button onClick={() => dismissAlert(alert.id)} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Hiring Health Score</p>
            <h3 className="text-3xl font-bold text-slate-800">{stats.healthScore}/100</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">High Risk Candidates</p>
            <h3 className="text-3xl font-bold text-slate-800">{stats.highRisk}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <BrainCircuit size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Predicted Future Leaders</p>
            <h3 className="text-3xl font-bold text-slate-800">{stats.futureLeaders}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Target size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">ATS Pass Rate</p>
            <h3 className="text-3xl font-bold text-slate-800">{stats.atsPassRate}%</h3>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users size={18} className="text-indigo-600"/>
            Pipeline Overview
          </h3>
          <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Funnel Chart Visualization (Phase 2F)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-600"/>
            Talent Pool Strengths
          </h3>
          <div className="space-y-4 h-64 overflow-y-auto pr-2">
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Technical Competencies</h4>
                <div className="flex flex-wrap gap-2">
                    {skills?.topTechnicalSkills?.length > 0 ? skills.topTechnicalSkills.map((s: any, i: number) => (
                        <div key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
                            <span className="text-sm font-medium text-blue-800 capitalize">{s.skill}</span>
                            <span className="text-xs font-bold text-blue-600 bg-white px-1.5 py-0.5 rounded">{s.avgScore.toFixed(0)}</span>
                        </div>
                    )) : <span className="text-sm text-slate-400 italic">No data yet</span>}
                </div>
            </div>
            <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Soft Skills & Leadership</h4>
                <div className="flex flex-wrap gap-2">
                    {skills?.topSoftSkills?.length > 0 ? skills.topSoftSkills.map((s: any, i: number) => (
                        <div key={i} className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                            <span className="text-sm font-medium text-emerald-800 capitalize">{s.skill}</span>
                            <span className="text-xs font-bold text-emerald-600 bg-white px-1.5 py-0.5 rounded">{s.avgScore.toFixed(0)}</span>
                        </div>
                    )) : <span className="text-sm text-slate-400 italic">No data yet</span>}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
