import { motion } from 'framer-motion';
import { 
  FileText, BarChart, ListOrdered, MessageSquare, 
  BrainCircuit, ShieldAlert, Bot, Network 
} from 'lucide-react';

const agents = [
  {
    id: 'parser',
    name: 'Parsing Agent',
    description: 'Extracts skills, experience, and education from raw resumes using NLP.',
    icon: FileText,
    color: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-50',
    textColor: 'text-blue-600',
    delay: 0.1
  },
  {
    id: 'ats',
    name: 'ATS Scoring Agent',
    description: 'Applies rigid rule-based filtering against job descriptions.',
    icon: BarChart,
    color: 'from-indigo-500 to-purple-600',
    bg: 'bg-indigo-50',
    textColor: 'text-indigo-600',
    delay: 0.2
  },
  {
    id: 'ranking',
    name: 'Semantic Ranking Agent',
    description: 'Embeds resumes into a vector database for semantic similarity ranking.',
    icon: ListOrdered,
    color: 'from-purple-500 to-fuchsia-600',
    bg: 'bg-purple-50',
    textColor: 'text-purple-600',
    delay: 0.3
  },
  {
    id: 'prep',
    name: 'Interview Prep Agent',
    description: 'Dynamically generates targeted technical and behavioral QnA.',
    icon: MessageSquare,
    color: 'from-fuchsia-500 to-pink-600',
    bg: 'bg-fuchsia-50',
    textColor: 'text-fuchsia-600',
    delay: 0.4
  },
  {
    id: 'eval',
    name: 'Evaluation Agent',
    description: 'Scores mock candidate answers based on depth and correctness.',
    icon: BrainCircuit,
    color: 'from-pink-500 to-rose-600',
    bg: 'bg-pink-50',
    textColor: 'text-pink-600',
    delay: 0.5
  },
  {
    id: 'fraud',
    name: 'Fraud Detection Agent',
    description: 'Cross-references interview answers with resume claims to detect contradictions.',
    icon: ShieldAlert,
    color: 'from-rose-500 to-red-600',
    bg: 'bg-rose-50',
    textColor: 'text-rose-600',
    delay: 0.6
  },
  {
    id: 'skillgap',
    name: 'Skill Gap Intelligence Agent',
    description: 'Generates hiring readiness scores and personalized 30/60/90 day career development plans.',
    icon: BrainCircuit,
    color: 'from-cyan-500 to-blue-600',
    bg: 'bg-cyan-50',
    textColor: 'text-cyan-600',
    delay: 0.7
  }
];

const copilot = {
  id: 'copilot',
  name: 'Recruiter Copilot',
  description: 'Global AI Assistant orchestrating all agents and querying across the knowledge base.',
  icon: Bot,
  color: 'from-emerald-400 to-teal-500',
  bg: 'bg-emerald-50',
  textColor: 'text-emerald-600',
  delay: 0.8
};

export const AgentsPipeline = () => {
  return (
    <div className="p-8 max-w-7xl mx-auto min-h-[calc(100vh-2rem)]">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-2xl mb-4 shadow-inner border border-indigo-100/50">
          <Network className="text-indigo-600" size={32} />
        </div>
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-3">AI Agents Architecture</h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-lg">
          Visualize the sequential intelligence flow powering TalentAI, from raw data extraction to deep cognitive analysis and fraud detection.
        </p>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-12 items-start justify-center">
        
        {/* Main Pipeline */}
        <div className="flex-1 w-full relative">
          {/* Animated Connecting Line Background */}
          <div className="absolute left-[39px] top-[40px] bottom-[40px] w-1 bg-slate-100 rounded-full z-0 hidden sm:block"></div>
          
          <div className="space-y-6 relative z-10">
            {agents.map((agent, index) => {
              const Icon = agent.icon;
              return (
                <motion.div 
                  key={agent.id}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: agent.delay, duration: 0.5, type: "spring", stiffness: 100 }}
                  className="flex items-center gap-6 group"
                >
                  {/* Node Icon */}
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${agent.color} p-0.5 shadow-lg relative shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3`}>
                    <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center relative overflow-hidden">
                      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${agent.color}`}></div>
                      <Icon size={32} className={agent.textColor} />
                    </div>
                    {/* Animated pulse dot */}
                    {index < agents.length - 1 && (
                      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-300 animate-ping hidden sm:block"></div>
                    )}
                  </div>

                  {/* Node Content */}
                  <div className="flex-1 bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b ${agent.color}`}></div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{agent.name}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{agent.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Global Copilot Orchestrator */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: copilot.delay, duration: 0.6 }}
          className="lg:w-[400px] w-full sticky top-8"
        >
          <div className="bg-slate-900 rounded-3xl p-1 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            {/* Animated data streams flowing to Copilot */}
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-20 h-[80%] flex flex-col justify-between py-10 opacity-30 lg:flex hidden pointer-events-none z-0">
               {[...Array(6)].map((_, i) => (
                 <div key={i} className="h-0.5 w-full bg-gradient-to-r from-transparent to-emerald-400 relative overflow-hidden">
                   <div className="absolute top-0 left-0 h-full w-full bg-white opacity-50 animate-[slide_2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.3}s` }}></div>
                 </div>
               ))}
            </div>

            <div className="bg-slate-900 border border-slate-700/50 rounded-[22px] p-8 relative z-10">
              <div className="flex justify-center mb-6 relative">
                <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${copilot.color} flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.3)]`}>
                  <copilot.icon size={48} className="text-white" />
                </div>
              </div>
              
              <h2 className="text-2xl font-black text-white text-center mb-4 tracking-tight">{copilot.name}</h2>
              <p className="text-slate-300 text-center text-sm leading-relaxed mb-8">
                {copilot.description}
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></div>
                  <span className="text-xs font-medium text-slate-300">Semantic Engine Connected</span>
                </div>
                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                  <span className="text-xs font-medium text-slate-300">Fraud Detection Matrix Active</span>
                </div>
                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" style={{ animationDelay: '1s' }}></div>
                  <span className="text-xs font-medium text-slate-300">Interview Evaluator Online</span>
                </div>
                <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" style={{ animationDelay: '1.5s' }}></div>
                  <span className="text-xs font-medium text-slate-300">Skill Gap Intelligence Enabled</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
      
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};
