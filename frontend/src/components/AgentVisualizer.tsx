import React from 'react';
import { DotFlow } from './ui/dot-flow';

interface AgentVisualizerProps {
  status: string | null;
}

export const AgentVisualizer: React.FC<AgentVisualizerProps> = ({ status }) => {
  return (
    <div className="w-full h-64 mb-6 relative">
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 bg-black/60 backdrop-blur-md py-1 px-3 rounded-full border border-slate-700 shadow-lg">
          <div className={`w-2 h-2 rounded-full ${status === 'PROCESSED' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]'}`}></div>
          LangGraph DotMatrix Pipeline
        </h3>
      </div>
      
      <DotFlow status={status} />
    </div>
  );
};

