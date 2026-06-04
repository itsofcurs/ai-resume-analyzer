import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  data?: any;
}

export const CopilotPanel = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: "Hello! I'm your Recruiter Copilot. Ask me to find candidates, recommend top profiles for a job, or compare two candidates." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const token = useSelector((state: RootState) => state.auth.token);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/copilot/chat`, { query: userMessage.text }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: response.data.message || "I processed your request.",
        data: response.data.data
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Copilot Error:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: "Sorry, I encountered an error while processing that."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="bg-indigo-600 text-white p-4 flex items-center gap-2">
        <Sparkles size={20} className="text-indigo-200" />
        <h3 className="font-semibold">Recruiter Copilot</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
              {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`max-w-[80%] rounded-2xl p-3 ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              
              {/* Optional Data Renderer (e.g. Candidates found) */}
              {msg.data && Array.isArray(msg.data) && (
                <div className="mt-3 space-y-2">
                  {msg.data.map((item: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-100 text-xs text-slate-600">
                      <strong>{item.candidateName || item.metadata?.name || 'Candidate'}</strong>
                      {item.score && <span className="ml-2 text-indigo-600 font-medium">Score: {item.score.toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-none p-3 shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              <span className="text-sm text-slate-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Copilot..."
            className="flex-1 bg-slate-100 border-transparent focus:bg-white focus:border-indigo-300 focus:ring-0 rounded-lg px-4 py-2 text-sm transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
