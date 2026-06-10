import React, { useState } from 'react';
import axios from 'axios';
import { Trophy, Star, ShieldAlert, Sparkles } from 'lucide-react';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const CandidateRankingEngine = ({ jobId, token }: { jobId: string, token: string }) => {
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRank = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/jobs/${jobId}/candidates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRanking(res.data.ranking || []);
    } catch (err: any) {
      setError(err.message || 'Failed to rank candidates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm mt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            Batch Candidate Ranking Engine
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Evaluates all available candidates against this Job Description simultaneously.
          </p>
        </div>
        <button
          onClick={handleRank}
          disabled={loading}
          className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors border border-amber-200 disabled:opacity-50"
        >
          {loading ? (
            <Sparkles size={14} className="animate-spin" />
          ) : (
            <Trophy size={14} />
          )}
          {loading ? 'Ranking...' : 'Rank All Candidates'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {ranking.length > 0 && (
        <div className="space-y-4">
          {ranking.map((candidate, index) => (
            <div key={candidate.candidate_id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                  #{index + 1}
                </div>
                <div>
                  <h5 className="font-bold text-slate-800 text-sm">{candidate.candidate_name}</h5>
                  <p className="text-xs text-slate-500">ID: {candidate.candidate_id.substring(0, 8)}...</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Overall Score</span>
                  <span className="text-lg font-black text-slate-800">{candidate.final_score.toFixed(1)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">ATS</span>
                  <span className="text-sm font-bold text-blue-600">{candidate.scores.ats_score.toFixed(0)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Semantics</span>
                  <span className="text-sm font-bold text-indigo-600">{(candidate.scores.semantic_score * 100).toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
