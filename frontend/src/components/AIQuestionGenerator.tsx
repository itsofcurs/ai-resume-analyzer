import React, { useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { BrainCircuit, Loader2, Code, UserCheck, ShieldCheck, HelpCircle } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const AIQuestionGenerator = ({ candidateId }: { candidateId: string }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [questions, setQuestions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/interview/generate-questions`, { candidateId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuestions(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate questions');
    } finally {
      setLoading(false);
    }
  };

  const renderSection = (title: string, icon: React.ReactNode, data: any[], colorClass: string) => {
    if (!data || data.length === 0) return null;
    return (
      <div className={`p-4 rounded-xl border ${colorClass} mb-4 bg-white/50`}>
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
          {icon}
          {title}
        </h4>
        <div className="space-y-4">
          {data.map((q: any, i: number) => (
            <div key={i} className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
              <p className="font-semibold text-slate-800 text-sm mb-2">{q.question}</p>
              <div className="text-xs text-slate-500 mb-2">
                <span className="font-bold text-slate-600">Why ask this: </span>{q.reason}
              </div>
              <div className="text-xs bg-slate-50 p-2 rounded border border-slate-100 italic">
                <span className="font-bold text-slate-600 not-italic uppercase text-[10px] tracking-wider block mb-1">Expected Answer: </span>
                {q.expected}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <HelpCircle size={16} className="text-indigo-600" />
          AI Interview Question Generator
        </h3>
        <button
          onClick={generateQuestions}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-1.5 rounded-lg text-xs transition-colors border border-indigo-200 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
          {loading ? 'Generating...' : questions ? 'Regenerate' : 'Generate Questions'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!questions && !loading && (
        <div className="text-center py-6 text-slate-400 text-sm">
          Click generate to fetch targeted Technical, Behavioral, and Integrity questions based on the candidate's resume and trust score.
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center text-indigo-500 py-8">
          <Loader2 size={24} className="animate-spin mb-2" />
          <p className="font-medium text-xs animate-pulse">Analyzing profile gaps & generating questions...</p>
        </div>
      )}

      {questions && !loading && (
        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {renderSection('Technical Evaluation', <Code size={16} className="text-blue-500" />, questions.technical, 'border-blue-100')}
          {renderSection('Behavioral & Leadership', <UserCheck size={16} className="text-emerald-500" />, questions.behavioral, 'border-emerald-100')}
          {renderSection('Integrity & Gap Analysis', <ShieldCheck size={16} className="text-amber-500" />, questions.integrity, 'border-amber-100')}
        </div>
      )}
    </div>
  );
};
