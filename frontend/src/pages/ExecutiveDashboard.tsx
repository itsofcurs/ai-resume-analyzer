import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { LayoutDashboard, Users, TrendingUp, ShieldAlert, Target, Loader2, ArrowUpRight } from 'lucide-react';
import type { RootState } from '../store';
import { WorkforceIntelligence } from '../components/WorkforceIntelligence';
import { HiringForecastDashboard } from '../components/HiringForecastDashboard';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const ExecutiveDashboard = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/analytics/executive`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch executive metrics', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
            <LayoutDashboard className="text-indigo-600" size={32} />
            Executive Leadership Hub
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Global organizational hiring health and risk indicators.</p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-time Systems Active
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Total Global Pipeline" 
          value={data.totalCandidates.toLocaleString()} 
          icon={<Users size={24} />} 
          color="indigo" 
          trend="+12%" 
        />
        <MetricCard 
          title="Avg Success Probability" 
          value={`${data.avgSuccessProbability}%`} 
          icon={<TrendingUp size={24} />} 
          color="emerald" 
          trend="+4%" 
        />
        <MetricCard 
          title="Avg Organizational Fit" 
          value={`${data.avgAtsScore}%`} 
          icon={<Target size={24} />} 
          color="blue" 
          trend="-2%" 
        />
        <MetricCard 
          title="Critical Fraud Risk Volume" 
          value={data.highFraudRiskCount.toLocaleString()} 
          icon={<ShieldAlert size={24} />} 
          color={data.highFraudRiskCount > 10 ? 'rose' : 'amber'} 
          trend="-15%" 
          reverseTrend
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hiring Forecast Dashboard */}
        <HiringForecastDashboard />

        {/* Workforce Intelligence */}
        <WorkforceIntelligence />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-800">Organizational Risk Radar</h3>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider">Last 30 Days</span>
          </div>
          
          <div className="space-y-6">
            <RiskIndicator label="Average Pipeline Trust Score" value={data.avgTrustScore} type={data.avgTrustScore > 80 ? 'good' : 'warning'} />
            <RiskIndicator 
              label="Systemic Flight Risk Probability" 
              value={data.avgFlightRisk || 0} 
              type={data.avgFlightRisk > 30 ? "warning" : "good"} 
            />
            <RiskIndicator 
              label="Projected Offer Acceptance Rate" 
              value={data.avgOfferAcceptance || 0} 
              type={data.avgOfferAcceptance < 60 ? "warning" : "good"} 
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl shadow-xl p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <h3 className="text-xl font-bold mb-8 flex items-center gap-2 relative z-10">
            <TrendingUp className="text-indigo-400" /> Executive AI Summary
          </h3>
          
          <div className="space-y-4 relative z-10 text-indigo-50 leading-relaxed text-sm md:text-base">
            <p>
              The organization is currently tracking <strong className="text-white">{data.totalCandidates}</strong> active candidates. 
              The overall success probability sits at a healthy <strong className="text-emerald-400">{data.avgSuccessProbability}%</strong>.
            </p>
            <p>
              Integrity systems flag <strong className={data.highFraudRiskCount > 0 ? "text-rose-400" : "text-white"}>{data.highFraudRiskCount}</strong> candidates with critical trust issues. 
              Overall pipeline trust remains at <strong className="text-white">{data.avgTrustScore}%</strong>.
            </p>
            <div className="mt-8 pt-6 border-t border-indigo-500/30">
              <button className="flex items-center gap-2 text-indigo-300 hover:text-white transition-colors font-bold text-sm uppercase tracking-wider">
                Generate Board Report <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, icon, color, trend, reverseTrend = false }: any) => {
  const isPositive = trend.startsWith('+');
  const isGood = reverseTrend ? !isPositive : isPositive;
  
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-2xl border ${colors[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {trend}
        </div>
      </div>
      <div>
        <h3 className="text-slate-500 font-medium text-sm mb-1">{title}</h3>
        <p className="text-3xl font-black text-slate-800">{value}</p>
      </div>
    </div>
  );
};

const RiskIndicator = ({ label, value, type }: any) => {
  const getBarColor = () => {
    if (type === 'good') return 'bg-emerald-500';
    if (type === 'warning') return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div>
      <div className="flex justify-between text-sm font-bold mb-2">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-900">{value}%</span>
      </div>
      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${getBarColor()} transition-all duration-1000`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );
};
