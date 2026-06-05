import React from 'react';

interface AgentVisualizerProps {
  status: string | null;
}

const PIPELINE_STEPS = [
  { key: 'PENDING', label: 'Queued' },
  { key: 'EXTRACTING', label: 'Extract' },
  { key: 'ANALYZING', label: 'Parse' },
  { key: 'SCORING', label: 'Score' },
  { key: 'RANKING', label: 'Rank' },
];

const ACTIVE_STATUSES = ['PENDING', 'EXTRACTING', 'ANALYZING', 'SCORING', 'RANKING'];

export const AgentVisualizer: React.FC<AgentVisualizerProps> = ({ status }) => {
  // Only render when actively processing
  if (!status || !ACTIVE_STATUSES.includes(status)) return null;

  const activeIdx = PIPELINE_STEPS.findIndex(s => s.key === status);

  return (
    <div className="animate-slide-down">
      <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/60 px-5 py-3 shadow-sm flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Processing</span>
        </div>

        <div className="h-4 w-px bg-slate-200 shrink-0"></div>

        {/* Stepper */}
        <div className="flex items-center gap-1 flex-1">
          {PIPELINE_STEPS.map((step, idx) => {
            const isCompleted = idx < activeIdx;
            const isActive = idx === activeIdx;

            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                    isCompleted ? 'bg-emerald-400' : 'bg-slate-200'
                  }`}></div>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                    isCompleted ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' :
                    isActive ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/40 animate-step-pulse ring-2 ring-indigo-200' :
                    'bg-slate-200 text-slate-400'
                  }`}>
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${
                    isCompleted ? 'text-emerald-600' :
                    isActive ? 'text-indigo-600 font-bold' :
                    'text-slate-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
