import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Users, LayoutDashboard, BrainCircuit, Check, X, Award, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const CandidateComparisonWorkspace = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const res = await axios.get(`${API_URL}/resumes`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCandidates(res.data);
      } catch (err) {
        console.error("Failed to fetch candidates", err);
      }
    };
    fetchCandidates();
  }, [token]);

  const toggleCandidate = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (selectedIds.length < 2) return;
    setComparing(true);
    setError('');
    setComparison(null);
    try {
      const res = await axios.post(`${API_URL}/copilot/compare_multi`, {
        candidateIds: selectedIds
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setComparison(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  // Get full objects for top-row stats
  const selectedCandidates = selectedIds.map(id => candidates.find(c => c._id === id || c.id === id)).filter(Boolean);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="text-indigo-600" size={26} />
            Candidate Comparison Workspace
          </h1>
          <p className="text-slate-500 text-sm mt-1">Select 2-3 candidates to generate a side-by-side AI evaluation matrix.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2 uppercase tracking-wider">
          <Users size={16} className="text-slate-400" /> Select Candidates ({selectedIds.length}/3)
        </h3>
        
        <div className="flex flex-wrap gap-3 mb-6">
          {candidates.map((c) => {
            const id = c._id || c.id;
            const isSelected = selectedIds.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleCandidate(id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  isSelected 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm shadow-indigo-100' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {c.candidateName || c.filename || 'Unknown'}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCompare}
          disabled={comparing || selectedIds.length < 2}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm shadow-indigo-500/20"
        >
          {comparing ? <BrainCircuit size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
          {comparing ? 'Generating Matrix...' : 'Compare Candidates'}
        </button>
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      </div>

      {comparison && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comparison.matrix.map((col: any, idx: number) => {
              const fullCandidate = selectedCandidates.find(c => c._id === col.candidateId || c.id === col.candidateId || c.candidateName === col.candidateName);
              const isFirst = idx === 0;

              return (
                <div key={idx} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className={`p-6 border-b ${isFirst ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-slate-100'}`}>
                    <h3 className="font-bold text-lg text-slate-800 mb-1">{col.candidateName}</h3>
                    
                    {/* Superlative Badge */}
                    <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-bold border border-amber-200/50 shadow-sm">
                      <Award size={14} className="text-amber-600" />
                      {col.superlative}
                    </div>
                  </div>

                  {/* Top-line Stats */}
                  {fullCandidate && (
                    <div className="grid grid-cols-2 border-b border-slate-100">
                      <div className="p-4 border-r border-slate-100 text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Overall Match</span>
                        <span className="text-xl font-black text-slate-800">{(fullCandidate.scores?.total * 100).toFixed(0) || fullCandidate.scores?.overall || 0}%</span>
                      </div>
                      <div className="p-4 text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Trust Score</span>
                        <span className="text-xl font-black text-slate-800 flex items-center justify-center gap-1">
                          <ShieldAlert size={16} className={fullCandidate.fraudAnalysis?.trustScore >= 80 ? 'text-emerald-500' : 'text-amber-500'} />
                          {fullCandidate.fraudAnalysis?.trustScore || 100}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="p-6 flex-1 bg-white space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-3 flex items-center gap-2">
                        <Check size={14} /> Key Strengths
                      </h4>
                      <ul className="space-y-2">
                        {col.strengths?.map((s: string, i: number) => (
                          <li key={i} className="text-sm text-slate-700 leading-relaxed pl-4 relative">
                            <span className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-3 flex items-center gap-2">
                        <X size={14} /> Weaknesses
                      </h4>
                      <ul className="space-y-2">
                        {col.weaknesses?.map((w: string, i: number) => (
                          <li key={i} className="text-sm text-slate-700 leading-relaxed pl-4 relative">
                            <span className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-indigo-900 text-white p-6 rounded-3xl shadow-md border border-indigo-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <h3 className="font-bold text-lg flex items-center gap-2 mb-3 relative z-10">
              <BrainCircuit className="text-indigo-400" size={24} />
              AI Hiring Recommendation
            </h3>
            <p className="text-indigo-100 leading-relaxed relative z-10">{comparison.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
};
