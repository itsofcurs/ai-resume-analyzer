import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { ClipboardCheck, Loader2, Save, X, ThumbsUp, AlertTriangle, ShieldCheck, HeartHandshake } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const InterviewScorecard = ({ candidateId, onClose }: { candidateId: string, onClose?: () => void }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  
  const [tech, setTech] = useState(0);
  const [behavior, setBehavior] = useState(0);
  const [comm, setComm] = useState(0);
  const [conf, setConf] = useState(0);
  const [notes, setNotes] = useState('');
  const [rec, setRec] = useState<'Strong Hire' | 'Hire' | 'Hold' | 'Reject' | ''>('');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [scorecards, setScorecards] = useState<any[]>([]);
  const [loadingScorecards, setLoadingScorecards] = useState(false);

  const fetchScorecards = async () => {
    setLoadingScorecards(true);
    try {
      const res = await axios.get(`${API_URL}/scorecards/candidate/${candidateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScorecards(res.data || []);
    } catch (err) {
      console.error("Failed to fetch scorecards", err);
    } finally {
      setLoadingScorecards(false);
    }
  };

  useEffect(() => {
    if (candidateId && token) {
      fetchScorecards();
    }
  }, [candidateId, token]);

  // Auto-compute overall score
  const overall = Math.round((tech + behavior + comm + conf) / 4) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rec) {
      setError('Please provide a final recommendation.');
      return;
    }
    
    setSubmitting(true);
    setError('');
    try {
      await axios.post(`${API_URL}/scorecards`, {
        candidateId,
        technicalScore: tech,
        behavioralScore: behavior,
        communicationScore: comm,
        confidenceScore: conf,
        overallScore: overall,
        notes,
        recommendation: rec
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(true);
      fetchScorecards();
      if (onClose) {
        setTimeout(() => onClose(), 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit scorecard.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSlider = (label: string, value: number, setValue: (v: number) => void) => (
    <div className="mb-4">
      <div className="flex justify-between mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <label>{label}</label>
        <span className="text-slate-800">{value}/100</span>
      </div>
      <input 
        type="range" 
        min="0" 
        max="100" 
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in relative">
      <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <ClipboardCheck size={20} className="text-indigo-200" />
          Submit Interview Scorecard
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-indigo-200 hover:text-white transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        {success ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <ClipboardCheck size={32} className="text-emerald-500" />
            </div>
            <h4 className="text-lg font-bold text-slate-800 mb-1">Scorecard Submitted</h4>
            <p className="text-sm text-slate-500">The evaluation has been attached to the candidate's profile.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mb-6">
              {renderSlider('Technical Fit', tech, setTech)}
              {renderSlider('Behavioral & Cultural', behavior, setBehavior)}
              {renderSlider('Communication', comm, setComm)}
              {renderSlider('Confidence & Execution', conf, setConf)}
            </div>

            <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Computed Overall</span>
              <span className="text-3xl font-black text-indigo-600">{overall}</span>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Final Recommendation</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['Strong Hire', 'Hire', 'Hold', 'Reject'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRec(r as any)}
                    className={`py-2 px-3 rounded-xl border text-sm font-bold transition-all ${
                      rec === r 
                        ? (r.includes('Hire') ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]' : r === 'Hold' ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-[0_0_0_2px_rgba(245,158,11,0.2)]' : 'bg-rose-50 border-rose-500 text-rose-700 shadow-[0_0_0_2px_rgba(244,63,94,0.2)]')
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Evaluator Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Briefly justify your recommendation..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all resize-none"
              ></textarea>
            </div>

            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-sm shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {submitting ? 'Submitting...' : 'Submit Scorecard'}
            </button>
          </>
        )}
      </form>

      {scorecards.length > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 p-6">
          <h4 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck size={16} className="text-slate-500" />
            Historical Scorecards ({scorecards.length})
          </h4>
          <div className="space-y-4">
            {scorecards.map((sc, idx) => (
              <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">Interviewer: {sc.interviewerId}</div>
                    <div className="text-xs text-slate-500">{new Date(sc.createdAt).toLocaleString()}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    sc.recommendation.includes('Hire') ? 'bg-emerald-100 text-emerald-700' :
                    sc.recommendation === 'Hold' ? 'bg-amber-100 text-amber-700' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {sc.recommendation}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-4 mb-3 text-xs font-bold text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                  <div>Overall: <span className="text-indigo-600">{sc.overallScore}</span></div>
                  <div>Tech: <span className="text-slate-800">{sc.technicalScore}</span></div>
                  <div>Behavior: <span className="text-slate-800">{sc.behavioralScore}</span></div>
                  <div>Comm: <span className="text-slate-800">{sc.communicationScore}</span></div>
                  <div>Conf: <span className="text-slate-800">{sc.confidenceScore}</span></div>
                </div>

                {sc.notes && (
                  <div className="text-sm text-slate-600 italic bg-slate-50 p-3 rounded-lg border-l-2 border-slate-300">
                    "{sc.notes}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
