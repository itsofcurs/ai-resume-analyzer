import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { BrainCircuit, Loader2, FileText, Send, User, ChevronDown, ChevronUp, BookOpen, Lightbulb, GraduationCap } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

// Parse markdown-style Q&A into structured cards
function parseQnA(raw: string): { question: string; answer: string }[] {
  const items: { question: string; answer: string }[] = [];
  
  // Try numbered Q&A patterns: "1. **Q:** ..." or "**Question 1:**" or "Q1:" etc.
  const blocks = raw.split(/(?=\n(?:\d+[\.\)]\s|#{1,3}\s|\*\*Q(?:uestion)?\s*\d*[:\.]?\*\*|Q\d+[:\.]|Question\s*\d+[:\.]?))/i);
  
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    
    // Try to split on answer markers
    const answerMatch = trimmed.match(/\n\s*(?:\*\*A(?:nswer)?[:\.]?\*\*|A[:\.]|Answer[:\.]?)\s*([\s\S]*)/i);
    
    if (answerMatch) {
      const questionPart = trimmed.slice(0, answerMatch.index).trim();
      const answerPart = answerMatch[1].trim();
      if (questionPart && answerPart) {
        items.push({
          question: questionPart.replace(/^\d+[\.\)]\s*/, '').replace(/^\*\*/,'').replace(/\*\*$/,'').replace(/^Q(?:uestion)?\s*\d*[:\.]?\s*/i,'').trim(),
          answer: answerPart,
        });
        continue;
      }
    }
    
    // Fallback: split by first newline
    const lines = trimmed.split('\n');
    if (lines.length >= 2) {
      const q = lines[0].replace(/^\d+[\.\)]\s*/, '').replace(/^\*\*/,'').replace(/\*\*$/,'').replace(/^Q(?:uestion)?\s*\d*[:\.]?\s*/i,'').trim();
      const a = lines.slice(1).join('\n').replace(/^A(?:nswer)?[:\.]?\s*/i, '').trim();
      if (q && a) {
        items.push({ question: q, answer: a });
      }
    }
  }
  
  return items;
}

// Parse summary into sections
function parseSummary(raw: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const blocks = raw.split(/(?=\n#{1,3}\s)/);
  
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      sections.push({
        title: headingMatch[1].trim(),
        content: trimmed.slice(headingMatch[0].length).trim(),
      });
    } else if (sections.length === 0) {
      sections.push({ title: 'Overview', content: trimmed });
    }
  }
  
  if (sections.length === 0 && raw.trim()) {
    sections.push({ title: 'Study Guide', content: raw.trim() });
  }
  
  return sections;
}

const QnACard = ({ question, answer, index }: { question: string; answer: string; index: number }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-slate-50/50 transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-slate-800 leading-snug">{question}</h4>
        </div>
        <div className="shrink-0 mt-0.5">
          {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>
      
      {isOpen && (
        <div className="px-5 pb-4 pt-0 border-t border-slate-100 animate-fade-in">
          <div className="ml-10 mt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={13} className="text-amber-500" />
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Answer</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const SummarySection = ({ title, content, index }: { title: string; content: string; index: number }) => {
  const icons = [BookOpen, GraduationCap, Lightbulb, BrainCircuit];
  const Icon = icons[index % icons.length];
  
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
          <Icon size={14} />
        </div>
        <h4 className="font-bold text-sm text-slate-800">{title}</h4>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
};

export const InterviewPrep = () => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const token = useSelector((state: RootState) => state.auth.token);
  
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'QnA' | 'Summary'>('QnA');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const res = await axios.get(`${API_URL}/resumes`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCandidates(res.data);
      } catch (error) {
        console.error("Failed to fetch candidates", error);
      }
    };
    fetchCandidates();
  }, [token]);

  const handleGenerate = async () => {
    if (!selectedCandidateId || !topic) return;
    
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const response = await axios.post(`${API_URL}/interview/prep`, {
        candidateId: selectedCandidateId,
        topic,
        mode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResult(response.data.result);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate interview prep.');
    } finally {
      setLoading(false);
    }
  };

  const parsedQnA = mode === 'QnA' && result ? parseQnA(result) : [];
  const parsedSummary = mode === 'Summary' && result ? parseSummary(result) : [];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BrainCircuit className="text-indigo-600" size={26} />
          Interview Prep Studio
        </h1>
        <p className="text-slate-500 text-sm mt-1">Generate targeted Q&A or study summaries based on a candidate's profile.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 h-fit space-y-5">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <User size={13} /> Candidate Context
            </label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
            >
              <option value="">-- Choose a Candidate --</option>
              {candidates.map((c: any) => (
                <option key={c._id || c.id} value={c._id || c.id}>{c.candidateName || c.filename || 'Unknown'} - {c.parsedData?.title || 'No Title'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Technology / Topic</label>
            <input
              type="text"
              placeholder="e.g. System Design, React, Python..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Generation Mode</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setMode('QnA')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode === 'QnA' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Q&A Questions
              </button>
              <button
                onClick={() => setMode('Summary')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode === 'Summary' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Study Summary
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedCandidateId || !topic}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {loading ? 'Generating...' : 'Generate Prep'}
          </button>
          
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 text-xs rounded-xl border border-rose-100 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <div className="bg-white/50 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-100 min-h-[500px] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2 text-slate-700 font-bold text-sm bg-slate-50/80 rounded-t-2xl">
              <FileText size={16} className="text-indigo-600" />
              Generated {mode === 'QnA' ? 'Questions & Answers' : 'Study Guide'}
              {result && mode === 'QnA' && parsedQnA.length > 0 && (
                <span className="ml-auto text-xs font-medium text-slate-400">{parsedQnA.length} questions</span>
              )}
            </div>
            
            <div className="p-5 flex-1 overflow-auto">
              {/* Empty state */}
              {!result && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
                  <BrainCircuit size={40} className="mb-3 opacity-20" />
                  <p className="text-sm">Select a candidate and topic to generate interview materials.</p>
                </div>
              )}
              
              {/* Loading */}
              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-indigo-500 py-16">
                  <Loader2 size={36} className="animate-spin mb-3" />
                  <p className="font-medium text-sm animate-pulse">AI is analyzing candidate profile and generating {mode}...</p>
                </div>
              )}

              {/* Q&A Cards */}
              {result && !loading && mode === 'QnA' && (
                <div className="space-y-3">
                  {parsedQnA.length > 0 ? (
                    parsedQnA.map((item, idx) => (
                      <QnACard key={idx} question={item.question} answer={item.answer} index={idx} />
                    ))
                  ) : (
                    // Fallback: render as plain text if parsing fails
                    <div className="bg-white rounded-xl border border-slate-200/80 p-5">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{result}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Sections */}
              {result && !loading && mode === 'Summary' && (
                <div className="space-y-4">
                  {parsedSummary.length > 0 ? (
                    parsedSummary.map((section, idx) => (
                      <SummarySection key={idx} title={section.title} content={section.content} index={idx} />
                    ))
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200/80 p-5">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{result}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
