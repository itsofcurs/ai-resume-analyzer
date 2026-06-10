import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrainCircuit, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { AIExplainabilityPanel } from './AIExplainabilityPanel';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const AIRecruiterBrief = ({ candidateId, token }: { candidateId: string, token: string }) => {
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBrief = async () => {
      setLoading(true);
      try {
        // Here we hit the predictive/success endpoint which serves as the AI brief data source
        const res = await axios.post(`${API_URL}/success/predict`, {
          resumeId: candidateId
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBrief(res.data.successPrediction);
      } catch (error) {
        console.error("Failed to fetch AI brief", error);
      } finally {
        setLoading(false);
      }
    };
    if (candidateId) fetchBrief();
  }, [candidateId, token]);

  if (loading) {
    return (
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-center">
        <Sparkles size={16} className="text-indigo-500 animate-spin mr-2" />
        <span className="text-xs font-semibold text-indigo-700">Generating AI Brief...</span>
      </div>
    );
  }

  if (!brief) return null;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-5 mb-5 shadow-sm">
      <h3 className="font-bold text-indigo-900 text-sm flex items-center gap-2 mb-4 border-b border-indigo-100/50 pb-2">
        <BrainCircuit size={16} className="text-indigo-600" />
        AI Recruiter Brief
      </h3>

      <div className="flex items-center gap-3 mb-4">
        <div className="bg-white px-3 py-2 rounded-xl border border-indigo-100 flex-1 text-center shadow-sm">
          <span className="text-[10px] uppercase font-bold text-indigo-400 block">Hire Probability</span>
          <span className="text-lg font-black text-indigo-700">{brief.successProbability || 0}%</span>
        </div>
        <div className="bg-white px-3 py-2 rounded-xl border border-indigo-100 flex-1 text-center shadow-sm">
          <span className="text-[10px] uppercase font-bold text-indigo-400 block">Confidence</span>
          <span className="text-sm font-bold text-slate-700 mt-1 block">{brief.confidence || 'Medium'}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <span className="text-[10px] uppercase font-bold text-emerald-600 mb-1 block">Strengths</span>
          <div className="grid grid-cols-2 gap-4">
            {brief?.strengths?.map((strength: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-emerald-50/50 p-2 rounded-lg">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                <span>{strength}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Identified Risks</h4>
          <div className="grid grid-cols-2 gap-4">
            {brief?.risks?.map((risk: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-rose-50/50 p-2 rounded-lg">
                <AlertTriangle size={16} className="text-rose-500 mt-0.5 shrink-0" />
                <span>{risk}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-indigo-100/50">
        <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">Recommendation</span>
        <p className="text-xs font-semibold text-slate-800 bg-white p-2.5 rounded-lg border border-indigo-100 shadow-sm leading-relaxed">
          {brief.recommendation || 'Proceed to Interview phase to evaluate cultural fit.'}
        </p>
      </div>

      {/* Phase 5B: Explainability Integration */}
      <AIExplainabilityPanel recommendationPayload={brief} />
    </div>
  );
};
