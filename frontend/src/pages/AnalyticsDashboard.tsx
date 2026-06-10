import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { io } from 'socket.io-client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, ScatterChart, Scatter, CartesianGrid, ZAxis, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell } from 'recharts';
import { BrainCircuit, Target, Activity, CheckCircle, ShieldAlert, Users, TrendingUp, RefreshCw, Video, Mic } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const AnalyticsDashboard = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  
  const [dashboard, setDashboard] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [skills, setSkills] = useState<any>(null);
  const [success, setSuccess] = useState<any>(null);
  const [authenticity, setAuthenticity] = useState<any>(null);
  const [mediaMetrics, setMediaMetrics] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const fetchAnalytics = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      const suffix = forceRefresh ? '?refresh=true' : '';
      
      const [dashRes, funnelRes, trendsRes, skillsRes, successRes, authRes, mediaRes] = await Promise.all([
        axios.get(`${API_URL}/analytics/dashboard${suffix}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/analytics/funnel${suffix}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/analytics/trends${suffix}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/analytics/skills${suffix}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/analytics/success${suffix}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/analytics/authenticity${suffix}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/analytics/media${suffix}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setDashboard(dashRes.data);
      setFunnel(funnelRes.data);
      setTrends(trendsRes.data);
      setSkills(skillsRes.data);
      setSuccess(successRes.data);
      setAuthenticity(authRes.data);
      setMediaMetrics(mediaRes.data);
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateInsights = async () => {
    if (!dashboard) return;
    setInsightsLoading(true);
    try {
      // Aggregating metrics for the Python agent
      const payload = {
        organization_id: "org-context", // The backend pulls this from token anyway, but we pass dummy
        aggregated_stats: {
          funnel,
          dashboard,
          skills
        }
      };
      
      const res = await axios.post(`${import.meta.env.VITE_AI_API_URL || 'http://localhost:8000'}/api/analytics/insights`, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      setInsights(res.data);
    } catch (err) {
      console.error("Failed to generate insights", err);
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('ANALYTICS_UPDATED', () => {
      fetchAnalytics(true);
    });
    
    socket.on('ANALYTICS_REFRESHING', () => {
      setRefreshing(true);
    });

    return () => { socket.disconnect(); };
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 relative">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="text-indigo-600" />
            Recruiter Intelligence
          </h2>
          <p className="text-slate-500 mt-1">Executive overview of hiring health and organizational intelligence.</p>
        </div>
        <button 
          onClick={() => fetchAnalytics(true)}
          disabled={refreshing}
          className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Force Refresh"}
        </button>
      </header>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        
        {/* Executive Health Score */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-20"><Activity size={64} /></div>
          <div>
            <div className="text-indigo-100 font-medium text-sm">Hiring Health Score</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-5xl font-black tracking-tighter">{dashboard?.healthScore || 0}</span>
              <span className="text-xl font-bold text-indigo-200">/100</span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">Grade {dashboard?.grade || 'N/A'}</span>
            <span className="text-indigo-100 text-xs">Based on 5 key vectors</span>
          </div>
        </div>

        {/* Total Funnel */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">FUNNEL</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{dashboard?.totalCandidates || 0}</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Total Candidates</div>
          </div>
        </div>

        {/* ATS Avg */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Target size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{dashboard?.averageATSScore || 0}</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Avg ATS Score</div>
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">RISK</span>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black text-slate-800">{dashboard?.highRiskCandidates || 0}</div>
              <div className="text-sm font-medium text-slate-500 mt-1">High Risk Profiles</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-emerald-600 flex items-center gap-1 justify-end">
                <CheckCircle size={14} /> {dashboard?.verifiedCandidates || 0}
              </div>
              <div className="text-xs text-slate-400">Verified</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Predictive Success KPI Cards (Phase 2E-A & B) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Target size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">SUCCESS AI</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{success?.metrics?.averageSuccessProbability || 0}%</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Avg Success Probability</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{success?.metrics?.highPotentialCandidates || 0}</div>
            <div className="text-sm font-medium text-slate-500 mt-1">High Potential Candidates (80%+)</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{success?.metrics?.futureLeadersPipeline || 0}</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Future Leaders Pipeline</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">CULTURE</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{success?.metrics?.averageCulturalFit || 0}%</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Avg Cultural Fit</div>
          </div>
        </div>
      </div>

      {/* Voice & Video Media Metrics */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mt-6">
        <div className="flex justify-between items-start mb-6">
          <div className="flex gap-3 items-center">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Video size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">Voice & Video Intelligence</h3>
              <p className="text-sm text-slate-500">Aggregated communication, leadership, and authenticity metrics from all recorded interviews.</p>
            </div>
          </div>
          <div className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-bold flex items-center gap-1">
             <Mic size={14} /> {mediaMetrics?.totalRoundsAnalyzed || 0} Rounds Analyzed
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500">Avg Communication</div>
            <div className="text-3xl font-black text-slate-800 mt-2">{mediaMetrics?.averageCommunication || 0}</div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500">Avg Leadership</div>
            <div className="text-3xl font-black text-slate-800 mt-2">{mediaMetrics?.averageLeadership || 0}</div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500">Avg Integrity</div>
            <div className="text-3xl font-black text-slate-800 mt-2">{mediaMetrics?.averageIntegrity || 0}</div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500">Avg Authenticity</div>
            <div className="text-3xl font-black text-slate-800 mt-2">{mediaMetrics?.averageAuthenticity || 0}</div>
          </div>
        </div>
      </div>

      {/* Detailed Analytics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">AUTHENTICITY</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{authenticity?.metrics?.averageAuthenticityScore || 0}%</div>
            <div className="text-sm font-medium text-slate-500 mt-1">Avg Authenticity Score</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{authenticity?.metrics?.aiAssistedCandidates || 0}</div>
            <div className="text-sm font-medium text-slate-500 mt-1">AI-Assisted Responses</div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-800">{authenticity?.metrics?.highRiskInterviews || 0}</div>
            <div className="text-sm font-medium text-slate-500 mt-1">High Plagiarism Risk</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Processing Funnel */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp className="text-blue-600" size={18} />
            Candidate Pipeline Funnel
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Uploaded', val: funnel?.uploaded || 0 },
                { name: 'Processed', val: funnel?.processed || 0 },
                { name: 'Shortlisted', val: funnel?.shortlisted || 0 },
                { name: 'Interviewed', val: funnel?.interviewed || 0 },
                { name: 'Verified', val: funnel?.verified || 0 },
              ]} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} className="text-xs font-medium" width={80} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="val" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Upload Trends */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="text-purple-600" size={18} />
            30-Day Upload Trends
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends?.dailyUploads || []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <XAxis dataKey="_id" axisLine={false} tickLine={false} className="text-xs" />
                <YAxis axisLine={false} tickLine={false} className="text-xs" />
                <Tooltip cursor={{stroke: '#e2e8f0'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Cultural Fit & Correlation Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Cultural Fit Distribution */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users className="text-teal-600" size={18} />
            Cultural Fit Distribution
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(success?.culturalFitDistribution || []).map((d: any) => ({ range: typeof d._id === 'number' ? `${d._id}+` : d._id, count: d.count }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <XAxis dataKey="range" axisLine={false} tickLine={false} className="text-xs" />
                <YAxis axisLine={false} tickLine={false} className="text-xs" />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Success vs Culture Correlation */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Target className="text-purple-600" size={18} />
            Success vs Cultural Fit
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" dataKey="culture" name="Cultural Fit" axisLine={false} tickLine={false} domain={[0, 100]} className="text-xs" label={{ value: 'Cultural Fit', position: 'insideBottom', offset: -5, className: 'text-xs fill-slate-400' }} />
                <YAxis type="number" dataKey="success" name="Success Prob" axisLine={false} tickLine={false} domain={[0, 100]} className="text-xs" label={{ value: 'Success', angle: -90, position: 'insideLeft', className: 'text-xs fill-slate-400' }} />
                <ZAxis type="number" range={[50, 50]} />
                <Tooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Scatter data={success?.successVsCultureCorrelation || []} fill="#8b5cf6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Skills Intelligence & AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Top Technical Skills */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm col-span-1">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Target className="text-blue-600" size={16} />
            Top Tech Skills
          </h3>
          <div className="space-y-3">
            {skills?.topTechnicalSkills?.length > 0 ? skills.topTechnicalSkills.map((s: any, i: number) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 capitalize">{s.skill}</span>
                  <span className="text-xs font-bold text-blue-600">{s.avgScore.toFixed(0)}/100</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${s.avgScore}%` }}></div>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500 italic">No technical skills detected.</p>}
          </div>
        </div>

        {/* Top Soft Skills */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm col-span-1">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="text-emerald-600" size={16} />
            Top Soft Skills
          </h3>
          <div className="space-y-3">
            {skills?.topSoftSkills?.length > 0 ? skills.topSoftSkills.map((s: any, i: number) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 capitalize">{s.skill}</span>
                  <span className="text-xs font-bold text-emerald-600">{s.avgScore.toFixed(0)}/100</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${s.avgScore}%` }}></div>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500 italic">No soft skills detected.</p>}
          </div>
        </div>
        
        {/* Missing Skills */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm col-span-1">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ShieldAlert className="text-rose-600" size={16} />
            Missing Skills
          </h3>
          <div className="space-y-3">
            {skills?.missingSkills?.length > 0 ? skills.missingSkills.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 capitalize">{s._id || s.name}</span>
                <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md">{s.count} missing</span>
              </div>
            )) : <p className="text-sm text-slate-500 italic">No missing skills detected.</p>}
          </div>
        </div>

        {/* AI Hiring Insights Generator */}
        <div className="bg-slate-900 p-6 rounded-3xl shadow-lg col-span-1 lg:col-span-2 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <BrainCircuit className="text-indigo-400" />
                Executive AI Insights
              </h3>
              {!insights && (
                <button 
                  onClick={generateInsights}
                  disabled={insightsLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {insightsLoading ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {insightsLoading ? "Analyzing..." : "Generate Analysis"}
                </button>
              )}
            </div>

            {insights ? (
              <div className="space-y-4">
                <p className="text-indigo-100 text-sm leading-relaxed border-l-2 border-indigo-500 pl-4">
                  {insights.executiveSummary}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="bg-white/10 rounded-xl p-4">
                    <h4 className="text-rose-300 text-xs font-bold mb-2 uppercase tracking-wider">Primary Risks</h4>
                    <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                      {insights.hiringRisks?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <h4 className="text-emerald-300 text-xs font-bold mb-2 uppercase tracking-wider">Recommendations</h4>
                    <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                      {insights.recommendations?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">
                Click generate to trigger the LangGraph analysis over your current organizational data.
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Advanced Skill Graph Intelligence (Phase 3B.1) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        
        {/* Competency Distribution */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="text-indigo-600" size={18} />
            Organization Competency Matrix
          </h3>
          <div className="h-[300px] w-full flex">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                { subject: 'Technical', A: skills?.competencyDistribution?.technical?.reduce((acc: number, cur: any) => acc + (cur.level === 'Expert' ? 100 : cur.level === 'Advanced' ? 75 : cur.level === 'Intermediate' ? 50 : 25) * cur.count, 0) / Math.max(1, skills?.competencyDistribution?.technical?.reduce((a:number, c:any)=>a+c.count, 0) || 1) || 0, fullMark: 100 },
                { subject: 'Leadership', A: skills?.competencyDistribution?.leadership?.reduce((acc: number, cur: any) => acc + (cur.level === 'Expert' ? 100 : cur.level === 'Advanced' ? 75 : cur.level === 'Intermediate' ? 50 : 25) * cur.count, 0) / Math.max(1, skills?.competencyDistribution?.leadership?.reduce((a:number, c:any)=>a+c.count, 0) || 1) || 0, fullMark: 100 },
                { subject: 'Communication', A: skills?.competencyDistribution?.communication?.reduce((acc: number, cur: any) => acc + (cur.level === 'Expert' ? 100 : cur.level === 'Advanced' ? 75 : cur.level === 'Intermediate' ? 50 : 25) * cur.count, 0) / Math.max(1, skills?.competencyDistribution?.communication?.reduce((a:number, c:any)=>a+c.count, 0) || 1) || 0, fullMark: 100 },
                { subject: 'Problem Solving', A: skills?.competencyDistribution?.problemSolving?.reduce((acc: number, cur: any) => acc + (cur.level === 'Expert' ? 100 : cur.level === 'Advanced' ? 75 : cur.level === 'Intermediate' ? 50 : 25) * cur.count, 0) / Math.max(1, skills?.competencyDistribution?.problemSolving?.reduce((a:number, c:any)=>a+c.count, 0) || 1) || 0, fullMark: 100 }
              ]}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" className="text-xs font-bold text-slate-600" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar name="Org Average" dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.6} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-xs text-slate-400 mt-2">Aggregate competency scores (0-100 scale mapping)</div>
        </div>

        {/* Skill Clusters */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Target className="text-purple-600" size={18} />
            Skill Cluster Density
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skills?.skillClusterDistribution || []} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="cluster" axisLine={false} tickLine={false} className="text-xs font-medium" width={100} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24}>
                  {(skills?.skillClusterDistribution || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316'][index % 6]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-xs text-slate-400 mt-2">Number of candidates excelling per cluster</div>
        </div>
      </div>
      
    </div>
  );
};

// Dummy Sparkles icon since it wasn't imported from lucide-react above
const Sparkles = ({size=16}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
