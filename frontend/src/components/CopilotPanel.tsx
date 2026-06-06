import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, X, MessageCircle } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: "Hello! I'm your Recruiter Copilot. Ask me to find candidates, recommend top profiles for a job, or compare two candidates." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unread, setUnread] = useState(0);
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
      if (!isOpen) setUnread(prev => prev + 1);
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

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setUnread(0);
  };

  return (
    <>
      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-[60] animate-slide-up sm:w-[400px]">
          <div className="flex flex-col bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl shadow-slate-300/30 overflow-hidden h-full sm:h-[520px]">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Recruiter Copilot</h3>
                  <p className="text-[10px] text-indigo-200 font-medium">AI-Powered Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/15 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    msg.sender === 'user' 
                      ? 'bg-indigo-100 text-indigo-700' 
                      : 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm'
                  }`}>
                    {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    msg.sender === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-sm' 
                      : 'bg-white border border-slate-200/80 text-slate-700 rounded-tl-sm shadow-sm'
                  }`}>
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    
                    {msg.data && Array.isArray(msg.data) && (
                      <div className="mt-2.5 space-y-1.5">
                        {msg.data.map((item: any, idx: number) => (
                          <div key={idx} className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-xs text-slate-600">
                            <strong className="text-slate-800">{item.candidateName || item.metadata?.name || 'Candidate'}</strong>
                            {item.score && <span className="ml-2 text-indigo-600 font-semibold">Score: {item.score.toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-sm">
                    <Bot size={14} />
                  </div>
                  <div className="bg-white border border-slate-200/80 text-slate-700 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                    <span className="text-[13px] text-slate-400">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-white border-t border-slate-100">
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Copilot..."
                  className="flex-1 bg-slate-100 border border-transparent focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 rounded-xl px-4 py-2.5 text-sm transition-all outline-none"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-indigo-500/20"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={toggleOpen}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
          isOpen 
            ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-400/30 rotate-0' 
            : 'bg-gradient-to-br from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 shadow-indigo-500/30 animate-glow'
        }`}
        title={isOpen ? 'Close Copilot' : 'Open AI Copilot'}
      >
        {isOpen ? (
          <X size={22} className="text-white" />
        ) : (
          <MessageCircle size={22} className="text-white" />
        )}

        {/* Unread badge */}
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
            {unread}
          </span>
        )}
      </button>
    </>
  );
};
