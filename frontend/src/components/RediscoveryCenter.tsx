import React, { useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Search, Loader2, Sparkles, UserPlus } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const RediscoveryCenter = ({ jobId }: { jobId: string }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!jobId) {
      setError('No Job ID selected.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(
        `${API_URL}/rediscovery/search`,
        { jobId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResults(res.data.rediscovery_results || []);
    } catch (err: any) {
      console.error('Rediscovery Error:', err);
      setError('Failed to run rediscovery search.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Search className="text-indigo-600" />
          Autonomous Rediscovery
        </h3>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-semibold shadow-sm"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {loading ? 'Searching...' : 'Run Rediscovery'}
        </button>
      </div>

      {error && <div className="text-rose-600 text-sm mb-4 bg-rose-50 p-3 rounded-lg border border-rose-100">{error}</div>}

      {results.length > 0 ? (
        <div className="space-y-4">
          {results.map((candidate, idx) => (
            <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-slate-800 text-base">{candidate.name}</h4>
                  <p className="text-sm text-slate-500 line-clamp-2 mt-1">{candidate.reason}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">
                    {candidate.rediscovery_score}% Match
                  </span>
                  <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1">
                    <UserPlus size={14} /> Add to Pipeline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="text-center py-8 text-slate-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-300">
            Click 'Run Rediscovery' to search your ATS for silver medalist candidates.
          </div>
        )
      )}
    </div>
  );
};
