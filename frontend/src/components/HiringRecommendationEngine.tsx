import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { BrainCircuit, Loader2, Target, ShieldAlert, Users, TrendingUp, FileText, Video } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const HiringRecommendationEngine = ({ candidateId }: { candidateId: string }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [flightRisk, setFlightRisk] = useState<number | null>(null);
  const [offerAcceptance, setOfferAcceptance] = useState<number | null>(null);
  const [predicting, setPredicting] = useState(false);

  const fetchRecommendation = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/scorecards/recommendation/${candidateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch recommendation", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendation();
  }, [candidateId, token]);

  const runAdvancedPredictions = async () => {
    setPredicting(true);
    try {
      const [flightRes, offerRes] = await Promise.all([
        axios.post(`${API_URL}/predictive-hiring/flight-risk`, { candidateId }, { headers: { Authorization: `Bearer ${token}` } }),
        axios.post(`${API_URL}/predictive-hiring/offer-acceptance`, { candidateId, offeredSalary: 'Market Rate' }, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setFlightRisk(flightRes.data.probability);
      setOfferAcceptance(offerRes.data.probability);
    } catch (err) {
      console.error('Failed to run predictions', err);
    } finally {
      setPredicting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[200px]">
        <Loader2 size={24} className="text-indigo-500 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Aggregating Scorecards & Trust Signals...</p>
      </div>
    );
  }

  if (!data) return null;

  const getRecColor = (rec: string) => {
    switch (rec) {
      case 'Strong Hire': return 'bg-emerald-500 shadow-emerald-500/30';
      case 'Hire': return 'bg-emerald-400 shadow-emerald-400/30';
      case 'Hold': return 'bg-amber-500 shadow-amber-500/30';
      case 'Reject': return 'bg-rose-500 shadow-rose-500/30';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden relative">
      <div className="bg-slate-900 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div>
          <h3 className="font-bold text-white flex items-center gap-2">
            <BrainCircuit size={20} className="text-indigo-400" />
            Decision Engine
          </h3>
          <p className="text-slate-400 text-xs mt-1">Aggregates interviews, ATS match, and authenticity signals.</p>
        </div>

        <div className={`px-6 py-2 rounded-full text-white font-black tracking-wider uppercase text-sm shadow-lg ${getRecColor(data.recommendation)}`}>
          {data.recommendation}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden group col-span-2">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <TrendingUp size={14} /> Confidence
            </div>
            <div className="text-3xl font-black text-indigo-600">{data.confidence}<span className="text-sm text-indigo-300 ml-1">%</span></div>
            <div className="absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all" style={{ width: `${data.confidence}%` }}></div>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <Users size={14} /> Interview
            </div>
            <div className="text-2xl font-black text-slate-700">{data.breakdown?.interview || '--'}</div>
            <div className="absolute bottom-0 left-0 h-1 bg-slate-500 transition-all" style={{ width: `${data.breakdown?.interview || 0}%` }}></div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <Target size={14} /> JD Match
            </div>
            <div className="text-2xl font-black text-blue-600">{data.breakdown?.jdMatch || 0}</div>
            <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all" style={{ width: `${data.breakdown?.jdMatch || 0}%` }}></div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <ShieldAlert size={14} /> Trust
            </div>
            <div className={`text-2xl font-black ${data.breakdown?.trust >= 80 ? 'text-emerald-600' : 'text-amber-500'}`}>{data.breakdown?.trust || 0}</div>
            <div className={`absolute bottom-0 left-0 h-1 ${data.breakdown?.trust >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} transition-all`} style={{ width: `${data.breakdown?.trust || 0}%` }}></div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <BrainCircuit size={14} /> Success
            </div>
            <div className="text-2xl font-black text-purple-600">{data.breakdown?.successProbability || 0}</div>
            <div className="absolute bottom-0 left-0 h-1 bg-purple-500 transition-all" style={{ width: `${data.breakdown?.successProbability || 0}%` }}></div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <FileText size={14} /> ATS
            </div>
            <div className="text-2xl font-black text-teal-600">{data.breakdown?.ats || 0}</div>
            <div className="absolute bottom-0 left-0 h-1 bg-teal-500 transition-all" style={{ width: `${data.breakdown?.ats || 0}%` }}></div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <Video size={14} /> Voice/Video
            </div>
            <div className="text-2xl font-black text-pink-600">{data.breakdown?.voiceVideo || 0}</div>
            <div className="absolute bottom-0 left-0 h-1 bg-pink-500 transition-all" style={{ width: `${data.breakdown?.voiceVideo || 0}%` }}></div>
          </div>
        </div>

        {/* Advanced Predictive Intelligence */}
        <div className="mb-6 p-5 bg-indigo-50/50 rounded-xl border border-indigo-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <BrainCircuit className="text-indigo-600" size={16} />
              Advanced AI Predictions
            </h4>
            {flightRisk === null && !predicting && (
              <button 
                onClick={runAdvancedPredictions}
                className="text-xs bg-white border border-indigo-200 text-indigo-700 font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-indigo-50 transition-colors"
              >
                Run Predictive Models
              </button>
            )}
            {predicting && <Loader2 size={16} className="text-indigo-500 animate-spin" />}
          </div>

          {flightRisk !== null && offerAcceptance !== null && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5 uppercase tracking-wider text-slate-600">
                  <span>Offer Acceptance Probability</span>
                  <span className={offerAcceptance > 70 ? 'text-emerald-600' : 'text-amber-600'}>{offerAcceptance}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${offerAcceptance > 70 ? 'bg-emerald-500' : offerAcceptance > 40 ? 'bg-amber-500' : 'bg-rose-500'} transition-all duration-1000`} style={{ width: `${offerAcceptance}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5 uppercase tracking-wider text-slate-600">
                  <span>6-Month Flight Risk</span>
                  <span className={flightRisk < 30 ? 'text-emerald-600' : 'text-rose-600'}>{flightRisk}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${flightRisk < 30 ? 'bg-emerald-500' : flightRisk < 60 ? 'bg-amber-500' : 'bg-rose-500'} transition-all duration-1000`} style={{ width: `${flightRisk}%` }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={fetchRecommendation}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          ↻ Refresh Aggregation
        </button>
      </div>
    </div>
  );
};
