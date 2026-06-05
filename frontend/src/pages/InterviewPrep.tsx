import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { BrainCircuit, Loader2, FileText, Send, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

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

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
          <BrainCircuit className="text-blue-600" size={32} />
          Interview Prep Studio
        </h1>
        <p className="text-slate-500 mt-2">Generate targeted Q&A or study summaries based on a candidate's profile.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-fit space-y-6">
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <User size={16} /> Select Candidate Context
            </label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Choose a Candidate --</option>
              {candidates.map((c: any) => (
                <option key={c._id || c.id} value={c._id || c.id}>{c.candidateName || c.filename || 'Unknown'} - {c.parsedData?.title || 'No Title'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Technology / Topic</label>
            <input
              type="text"
              placeholder="e.g. System Design, React, Python..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Generation Mode</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setMode('QnA')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'QnA' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Q&A Questions
              </button>
              <button
                onClick={() => setMode('Summary')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'Summary' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Study Summary
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedCandidateId || !topic}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {loading ? 'Generating...' : 'Generate Prep'}
          </button>
          
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}
        </div>

        {/* Results Section */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 min-h-[500px] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2 text-slate-700 font-semibold bg-slate-50 rounded-t-2xl">
              <FileText size={18} className="text-blue-600" />
              Generated {mode === 'QnA' ? 'Questions & Answers' : 'Study Guide'}
            </div>
            
            <div className="p-6 flex-1 overflow-auto">
              {!result && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <BrainCircuit size={48} className="mb-4 opacity-20" />
                  <p>Select a candidate and topic to generate interview materials.</p>
                </div>
              )}
              
              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-blue-500">
                  <Loader2 size={40} className="animate-spin mb-4" />
                  <p className="font-medium animate-pulse">AI is analyzing candidate profile and generating {mode}...</p>
                </div>
              )}

              {result && !loading && (
                <div className="prose prose-slate max-w-none prose-headings:text-slate-800 prose-a:text-blue-600 prose-strong:text-slate-800">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
