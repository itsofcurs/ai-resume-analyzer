import { useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { MessageSquare, Send, BrainCircuit, Target, AlertTriangle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface QA {
  question: string;
  answer: string;
}

export const AdaptiveSimulator = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  
  const [topic, setTopic] = useState('React Performance Optimization');
  const [history, setHistory] = useState<QA[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('How would you optimize a React application that renders a large list of dynamic components?');
  const [currentAnswer, setCurrentAnswer] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState<any>(null);
  const [direction, setDirection] = useState<string>('');

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim()) return;
    
    const newHistory = [...history, { question: currentQuestion, answer: currentAnswer }];
    setHistory(newHistory);
    setIsProcessing(true);
    setCurrentAnswer('');

    try {
      const res = await axios.post(
        `${API_URL}/interview/adaptive`,
        {
          currentTopic: topic,
          conversationHistory: newHistory,
          resumeId: "simulated_id"
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCurrentQuestion(res.data.nextQuestion);
      setLastEvaluation(res.data.evaluation);
      setDirection(res.data.direction);
    } catch (err) {
      console.error(err);
      alert('Failed to generate next question.');
      // rollback
      setHistory(history);
      setCurrentAnswer(newHistory[newHistory.length - 1].answer);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderDirectionIcon = (dir: string) => {
    if (dir === 'drill_down') return <AlertTriangle className="text-amber-500" size={18} />;
    if (dir === 'pivot_advanced') return <Target className="text-emerald-500" size={18} />;
    return <BrainCircuit className="text-indigo-500" size={18} />;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Adaptive Interview Simulator</h1>
        <p className="text-slate-500">Test the Phase 3A dynamic interview question engine.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <label className="block text-sm font-medium text-slate-700 mb-2">Topic / Role Focus</label>
        <input 
          type="text" 
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="space-y-4">
        {history.map((qa, i) => (
          <div key={i} className="space-y-4">
            <div className="bg-indigo-50 p-4 rounded-xl rounded-tl-none border border-indigo-100 max-w-[80%]">
              <span className="text-xs font-bold text-indigo-400 mb-1 block">AI INTERVIEWER</span>
              <p className="text-indigo-900">{qa.question}</p>
            </div>
            <div className="bg-white p-4 rounded-xl rounded-tr-none border border-slate-200 max-w-[80%] ml-auto shadow-sm">
              <span className="text-xs font-bold text-slate-400 mb-1 block">CANDIDATE</span>
              <p className="text-slate-700">{qa.answer}</p>
            </div>
          </div>
        ))}
      </div>

      {lastEvaluation && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm flex items-start gap-4">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            {renderDirectionIcon(direction)}
          </div>
          <div>
            <div className="font-bold text-slate-700 flex items-center gap-2">
              AI Decision: {direction}
              <span className="bg-white px-2 py-0.5 rounded text-xs border">Score: {lastEvaluation.score}</span>
            </div>
            <p className="text-slate-600 mt-1">{lastEvaluation.feedback}</p>
            {lastEvaluation.missing_concepts?.length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {lastEvaluation.missing_concepts.map((c: string, idx: number) => (
                  <span key={idx} className="bg-rose-50 text-rose-600 px-2 py-1 rounded text-xs font-medium border border-rose-100">
                    Missing: {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isProcessing ? (
        <div className="flex items-center gap-2 text-slate-400 animate-pulse p-4">
          <BrainCircuit size={20} /> Generating adaptive response...
        </div>
      ) : (
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="bg-indigo-50 p-4 rounded-xl rounded-tl-none border border-indigo-100 max-w-[80%] shadow-sm">
            <span className="text-xs font-bold text-indigo-400 mb-1 block flex items-center gap-1">
              <MessageSquare size={12} /> AI INTERVIEWER
            </span>
            <p className="text-indigo-900 font-medium text-lg">{currentQuestion}</p>
          </div>
          
          <div className="flex gap-2 relative mt-4">
            <textarea
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Type your candidate response here to test the adaptive engine..."
              className="w-full bg-white p-4 pr-16 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-32"
            />
            <button 
              onClick={handleSubmitAnswer}
              disabled={!currentAnswer.trim()}
              className="absolute bottom-4 right-4 bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
