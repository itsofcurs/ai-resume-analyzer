import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { BrainCircuit, Loader2, FileText, Send, User, BookOpen, Lightbulb, GraduationCap } from 'lucide-react';
import type { RootState } from '../store';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';

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



const SummarySection = ({ title, content, index }: { title: string; content: string; index: number }) => {
  const icons = [BookOpen, GraduationCap, Lightbulb, BrainCircuit];
  const Icon = icons[index % icons.length];
  
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    let listItems: string[] = [];
    const elements: React.ReactNode[] = [];
    
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const listMatch = trimmed.match(/^[-*]\s+(.+)/) || trimmed.match(/^\d+\.\s+(.+)/);
      
      if (listMatch) {
        listItems.push(listMatch[1]);
      } else {
        if (listItems.length > 0) {
          elements.push(
            <ul key={`list-${i}`} className="space-y-2.5 my-4 ml-1">
              {listItems.map((item, j) => (
                <li key={j} className="flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 shadow-sm ${index % 2 === 0 ? 'bg-indigo-500' : 'bg-blue-500'}`}></div>
                  <span className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>') }} />
                </li>
              ))}
            </ul>
          );
          listItems = [];
        }
        
        if (trimmed) {
          elements.push(
            <p key={`p-${i}`} className="text-sm text-slate-700 leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>') }} />
          );
        }
      }
    });
    
    if (listItems.length > 0) {
      elements.push(
        <ul key="list-final" className="space-y-2.5 my-4 ml-1">
          {listItems.map((item, j) => (
            <li key={j} className="flex items-start gap-3">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 shadow-sm ${index % 2 === 0 ? 'bg-indigo-500' : 'bg-blue-500'}`}></div>
              <span className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>') }} />
            </li>
          ))}
        </ul>
      );
    }
    
    return elements;
  };

  const gradients = [
    "from-indigo-500 to-blue-500",
    "from-emerald-400 to-teal-500",
    "from-purple-500 to-pink-500",
    "from-amber-400 to-orange-500"
  ];
  
  const bgColors = [
    "bg-indigo-50",
    "bg-emerald-50",
    "bg-purple-50",
    "bg-amber-50"
  ];
  
  const iconColors = [
    "text-indigo-600",
    "text-emerald-600",
    "text-purple-600",
    "text-amber-600"
  ];

  const gradient = gradients[index % gradients.length];
  const bgColor = bgColors[index % bgColors.length];
  const iconColor = iconColors[index % iconColors.length];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden relative group hover:shadow-md transition-all duration-300">
      <div className={`absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b ${gradient}`}></div>
      <div className="p-6 pl-8">
        <div className="flex items-center gap-3.5 mb-5 border-b border-slate-100 pb-4">
          <div className={`w-11 h-11 rounded-xl ${bgColor} ${iconColor} flex items-center justify-center shadow-inner border border-white/50 shrink-0`}>
            <Icon size={22} />
          </div>
          <h4 className="text-[17px] font-bold text-slate-800 tracking-tight">{title}</h4>
        </div>
        <div className="pl-1">
          {renderContent(content)}
        </div>
      </div>
    </div>
  );
};

export const InterviewPrep = () => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const token = useSelector((state: RootState) => state.auth.token);
  
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'QnA' | 'Summary'>('QnA');
  const [displayedMode, setDisplayedMode] = useState<'QnA' | 'Summary' | null>(null);
  
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
      setDisplayedMode(mode);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate interview prep.');
    } finally {
      setLoading(false);
    }
  };

  const parsedQnA = displayedMode === 'QnA' && result ? parseQnA(result) : [];
  const parsedSummary = displayedMode === 'Summary' && result ? parseSummary(result) : [];

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
              Generated {displayedMode === 'QnA' ? 'Questions & Answers' : 'Study Guide'}
              {result && displayedMode === 'QnA' && parsedQnA.length > 0 && (
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
                  <p className="font-medium text-sm animate-pulse">AI is analyzing candidate profile and generating...</p>
                </div>
              )}

              {/* Q&A Cards */}
              {result && !loading && displayedMode === 'QnA' && (
                <div className="space-y-3">
                  {parsedQnA.length > 0 ? (
                    <Accordion
                      type="single"
                      collapsible
                      className="bg-white border-slate-200/80 shadow-sm w-full rounded-xl -space-y-px"
                      defaultValue="item-0"
                    >
                      {parsedQnA.map((item, idx) => (
                        <AccordionItem
                          value={`item-${idx}`}
                          key={`item-${idx}`}
                          className="relative border-x border-slate-200/80 first:rounded-t-xl first:border-t last:rounded-b-xl last:border-b"
                        >
                          <AccordionTrigger className="px-5 py-4 text-[14px] font-semibold text-slate-800 leading-snug hover:no-underline hover:bg-slate-50/50">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap px-5 pb-4">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    // Fallback: render as plain text if parsing fails
                    <div className="bg-white rounded-xl border border-slate-200/80 p-5">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{result}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Sections */}
              {result && !loading && displayedMode === 'Summary' && (
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
