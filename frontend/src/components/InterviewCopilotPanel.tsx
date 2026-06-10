import React, { useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Mic, Loader2, Sparkles, MessageSquare, AlertTriangle } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const InterviewCopilotPanel = ({ candidateId, context }: { candidateId: string; context: string }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [candidateAnswer, setCandidateAnswer] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!currentQuestion || !candidateAnswer) {
      setError('Please provide both the question and the candidate\'s answer.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(
        `${API_URL}/interview/live-analysis`,
        { candidateId, context, currentQuestion, candidateAnswer },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAnalysis(res.data.live_analysis);
    } catch (err: any) {
      console.error('Live Analysis Error:', err);
      setError('Failed to analyze the interview response.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-full max-h-[800px]">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Mic className="text-indigo-600" />
          Live Interview Copilot
        </h3>
        <span className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Listening
        </span>
      </div>

      {error && <div className="text-rose-600 text-sm mb-4 bg-rose-50 p-3 rounded-lg border border-rose-100 shrink-0">{error}</div>}

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Current Question</label>
            <textarea 
              value={currentQuestion}
              onChange={(e) => setCurrentQuestion(e.target.value)}
              placeholder="What question did you ask?"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Candidate's Answer (Transcript)</label>
            <textarea 
              value={candidateAnswer}
              onChange={(e) => setCandidateAnswer(e.target.value)}
              placeholder="Paste or transcribe the candidate's answer here..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-32"
            />
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || !currentQuestion || !candidateAnswer}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-bold shadow-md shadow-indigo-200"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {loading ? 'Analyzing Response...' : 'Analyze & Generate Follow-ups'}
        </button>

        {analysis && (
          <div className="mt-6 space-y-4 animate-fade-in border-t border-slate-100 pt-6">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Response Evaluation</h4>
                <p className="text-sm text-slate-600 mt-1">{analysis.critique}</p>
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 font-black text-xl border border-indigo-100 shrink-0 ml-4">
                {analysis.score}<span className="text-xs text-indigo-400 font-bold">/10</span>
              </div>
            </div>

            {analysis.red_flags && analysis.red_flags.length > 0 && (
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                <h5 className="text-xs font-bold text-rose-800 uppercase flex items-center gap-1 mb-2">
                  <AlertTriangle size={14} /> Potential Red Flags
                </h5>
                <ul className="list-disc pl-5 text-sm text-rose-700 space-y-1">
                  {analysis.red_flags.map((flag: string, idx: number) => (
                    <li key={idx}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h5 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-2">
                <MessageSquare size={14} /> Suggested Follow-up Questions
              </h5>
              <div className="space-y-2">
                {analysis.follow_up_questions.map((q: string, idx: number) => (
                  <div key={idx} className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm font-medium text-blue-900 shadow-sm cursor-pointer hover:bg-blue-100 transition-colors">
                    {q}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
