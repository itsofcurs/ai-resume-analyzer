import React, { useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Mail, Loader2, Sparkles, Send } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const AIOutreachComposer = ({ candidateId, jobId }: { candidateId: string; jobId?: string }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState('');
  
  const [outreachType, setOutreachType] = useState('initial_contact');
  const [notes, setNotes] = useState('');

  const handleGenerate = async () => {
    if (!candidateId) {
      setError('No Candidate ID provided.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(
        `${API_URL}/copilot/outreach/generate`,
        { candidateId, jobId, outreachType, notes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGenerated(res.data);
    } catch (err: any) {
      console.error('Outreach Error:', err);
      setError('Failed to generate outreach.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Mail className="text-indigo-600" />
          AI Outreach Composer
        </h3>
      </div>

      {error && <div className="text-rose-600 text-sm mb-4 bg-rose-50 p-3 rounded-lg border border-rose-100">{error}</div>}

      {!generated ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Outreach Type</label>
            <select 
              value={outreachType} 
              onChange={(e) => setOutreachType(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="initial_contact">Initial Contact</option>
              <option value="follow_up">Follow Up</option>
              <option value="rejection">Gentle Rejection</option>
              <option value="offer">Offer Extension</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Additional Notes</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Mention their open source contribution..."
              className="w-full p-2 border border-slate-300 rounded-lg text-sm h-24 resize-none"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-semibold shadow-sm"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Generating Draft...' : 'Generate AI Draft'}
          </button>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 mb-1">Subject</div>
            <div className="font-medium text-slate-800">{generated.subject}</div>
            
            <div className="mt-4 text-sm font-semibold text-slate-500 mb-1">Body</div>
            <div className="whitespace-pre-wrap text-slate-700 text-sm font-medium">{generated.body}</div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setGenerated(null)}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors text-sm font-semibold"
            >
              Discard & Retry
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-sm"
            >
              <Send size={16} /> Send Email
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
