import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, X, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface AgentResponse {
  message: string;
  best_candidate?: string;
  risks?: string[];
  strengths?: string[];
  suggested_next_action?: string;
  plan?: string[];
  results?: any;
  intent_detected?: string;
  evidence?: string[];
  confidence?: number;
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  agentData?: AgentResponse;
}

export const CopilotPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: "Hello! I'm your Autonomous Recruiter Copilot. How can I assist your hiring workflow today?" }
  ]);
  const [input, setInput] = useState('');
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string>('');
  const [executionTrace, setExecutionTrace] = useState<string[]>([]);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const token = useSelector((state: RootState) => state.auth.token);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAgentRunning, executionTrace]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, {
      auth: { token }
    });

    socket.on('COPILOT_THINKING', () => {
      setIsAgentRunning(true);
      setAgentStatus('Analyzing intent...');
      setExecutionTrace([]);
    });

    socket.on('COPILOT_TOOL_RUNNING', (data) => {
      setAgentStatus(`Executing tool: ${data.tool.replace('tool_', '')}...`);
      setExecutionTrace(prev => [...prev, `Running: ${data.tool.replace('tool_', '')}`]);
    });

    socket.on('COPILOT_TOOL_COMPLETED', (data) => {
      setExecutionTrace(prev => [...prev, `Completed: ${data.tool.replace('tool_', '')}`]);
    });

    socket.on('COPILOT_FINISHED', () => {
      setIsAgentRunning(false);
      setAgentStatus('');
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

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

    try {
      const response = await axios.post(`${API_URL}/copilot/autonomous`, { message: userMessage.text }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: response.data.message || "I've analyzed your request.",
        agentData: response.data
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
    }
  };

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setUnread(0);
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-[60] animate-slide-up sm:w-[450px]">
          <div className="flex flex-col bg-slate-900 sm:rounded-2xl border border-slate-800 shadow-2xl shadow-indigo-500/20 overflow-hidden h-full sm:h-[600px]">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 text-white px-5 py-4 flex items-center justify-between shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-blue-500/10" />
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-wide">Autonomous Copilot</h3>
                  <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Agent Mode Active
                  </p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors relative z-10 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-900 custom-scrollbar">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.sender === 'user' 
                      ? 'bg-slate-800 text-indigo-400' 
                      : 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20'
                  }`}>
                    {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={`max-w-[85%] ${
                    msg.sender === 'user' 
                      ? '' 
                      : 'space-y-3'
                  }`}>
                    <div className={`rounded-2xl px-4 py-3 ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-sm shadow-sm'
                        : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm shadow-sm'
                    }`}>
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                    
                    {msg.agentData && msg.sender === 'bot' && msg.agentData.best_candidate !== 'N/A' && (
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4">
                        {msg.agentData.best_candidate && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Top Recommendation</h4>
                              {msg.agentData.confidence && (
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                                  {msg.agentData.confidence}% Confidence
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-white flex items-center gap-2">
                              <CheckCircle2 size={14} className="text-emerald-400" />
                              {msg.agentData.best_candidate}
                            </p>
                          </div>
                        )}
                        
                        {msg.agentData.strengths && msg.agentData.strengths.length > 0 && (
                          <div>
                            <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Key Strengths</h4>
                            <ul className="space-y-1">
                              {msg.agentData.strengths.map((str, idx) => (
                                <li key={idx} className="text-[13px] text-slate-300 flex items-start gap-1.5">
                                  <span className="text-indigo-400 mt-0.5">•</span> {str}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {msg.agentData.risks && msg.agentData.risks.length > 0 && (
                          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                            <h4 className="text-[11px] uppercase tracking-wider text-rose-400 font-semibold mb-1.5 flex items-center gap-1.5">
                              <AlertTriangle size={12} />
                              Identified Risks
                            </h4>
                            <ul className="space-y-1">
                              {msg.agentData.risks.map((risk, idx) => (
                                <li key={idx} className="text-[13px] text-rose-200 flex items-start gap-1.5">
                                  <span className="text-rose-400 mt-0.5">•</span> {risk}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {msg.agentData.suggested_next_action && (
                          <div className="pt-2 border-t border-slate-700/50">
                            <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Suggested Action</h4>
                            <button className="text-[13px] bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
                              {msg.agentData.suggested_next_action}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isAgentRunning && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-sm relative">
                    <Bot size={14} />
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-slate-900 rounded-full flex items-center justify-center">
                      <Loader2 size={10} className="animate-spin text-indigo-400" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 max-w-[85%]">
                    <div className="bg-slate-800 border border-slate-700 text-slate-300 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                      <p className="text-[13px] font-medium flex items-center gap-2">
                        {agentStatus}
                      </p>
                    </div>
                    {executionTrace.length > 0 && (
                      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-3">
                        <h5 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Execution Trace</h5>
                        <div className="space-y-1.5">
                          {executionTrace.map((trace, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[12px] text-slate-400 font-mono">
                              {trace.startsWith('Completed') ? (
                                <CheckCircle2 size={12} className="text-emerald-500" />
                              ) : (
                                <ChevronRight size={12} className="text-indigo-400" />
                              )}
                              {trace}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            {messages.length === 1 && !isAgentRunning && (
              <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex flex-wrap gap-2">
                {['Find similar candidates to Sarah', 'Who has the highest ATS score?', 'Explain the fraud risk for John'].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); }}
                    className="text-[12px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition-colors border border-slate-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-4 bg-slate-900 border-t border-slate-800">
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. Find candidates with low fraud risk..."
                  className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:bg-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-[14px] transition-all outline-none"
                  disabled={isAgentRunning}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isAgentRunning}
                  className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-indigo-500/20 flex items-center justify-center shrink-0"
                >
                  <Send size={18} />
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
            ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-900/50 rotate-0' 
            : 'bg-gradient-to-br from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 shadow-indigo-500/40 animate-glow'
        }`}
        title={isOpen ? 'Close Copilot' : 'Open Autonomous Copilot'}
      >
        {isOpen ? (
          <X size={22} className="text-white" />
        ) : (
          <Bot size={24} className="text-white" />
        )}

        {/* Unread badge */}
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-sm border-2 border-slate-900">
            {unread}
          </span>
        )}
      </button>
    </>
  );
};
