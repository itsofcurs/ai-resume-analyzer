import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Brain, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Activity } from 'lucide-react';

interface Factor {
  factor: string;
  weight: number;
  evidence: string;
}

interface ExplainabilityData {
  confidence: number;
  reasoning: string;
  contributingFactors: Factor[];
  negativeFactors: Factor[];
  auditTrail: string[];
}

interface Props {
  recommendationPayload: any;
  title?: string;
}

export const AIExplainabilityPanel: React.FC<Props> = ({ recommendationPayload, title = "AI Decision Reasoning" }) => {
  const [data, setData] = useState<ExplainabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && !data && !loading) {
      fetchExplanation();
    }
  }, [expanded]);

  const fetchExplanation = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/copilot/explain`, {
        recommendation_payload: recommendationPayload
      }, { withCredentials: true });
      setData(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch AI explanation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mt-4">
      <div 
        className="px-4 py-3 bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-800">{title}</h3>
          {data && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
              {(data.confidence * 100).toFixed(0)}% Confidence
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
      </div>

      {expanded && (
        <div className="p-4 border-t border-gray-200">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Activity className="w-8 h-8 text-indigo-500 animate-spin" />
              <span className="ml-3 text-gray-600">Decomposing AI reasoning...</span>
            </div>
          ) : error ? (
            <div className="text-red-500 p-4 bg-red-50 rounded-md text-sm">{error}</div>
          ) : data ? (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">Synthesis</h4>
                <p className="text-gray-700 text-sm leading-relaxed bg-indigo-50/50 p-3 rounded-md border border-indigo-100">
                  {data.reasoning}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1 mb-3">
                    <CheckCircle2 className="w-4 h-4" /> Contributing Factors
                  </h4>
                  <div className="space-y-3">
                    {data.contributingFactors.map((factor, idx) => (
                      <div key={idx} className="bg-emerald-50/50 p-3 rounded-md border border-emerald-100">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-emerald-900 text-sm">{factor.factor}</span>
                          <span className="text-xs font-mono text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                            wt: {factor.weight}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-700">{factor.evidence}</p>
                      </div>
                    ))}
                    {data.contributingFactors.length === 0 && (
                      <span className="text-xs text-gray-500">No positive factors identified.</span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-rose-700 flex items-center gap-1 mb-3">
                    <XCircle className="w-4 h-4" /> Risk Factors
                  </h4>
                  <div className="space-y-3">
                    {data.negativeFactors.map((factor, idx) => (
                      <div key={idx} className="bg-rose-50/50 p-3 rounded-md border border-rose-100">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-rose-900 text-sm">{factor.factor}</span>
                          <span className="text-xs font-mono text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                            wt: {factor.weight}
                          </span>
                        </div>
                        <p className="text-xs text-rose-700">{factor.evidence}</p>
                      </div>
                    ))}
                    {data.negativeFactors.length === 0 && (
                      <span className="text-xs text-gray-500">No risk factors identified.</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1 mb-3">
                  <Clock className="w-4 h-4" /> Decision Audit Trail
                </h4>
                <div className="bg-gray-900 rounded-md p-4 overflow-x-auto">
                  <div className="space-y-2 font-mono text-xs text-gray-300">
                    {data.auditTrail.map((log, idx) => (
                      <div key={idx} className="flex gap-3">
                        <span className="text-gray-500 shrink-0">[{idx.toString().padStart(2, '0')}]</span>
                        <span className={log.includes('POS') ? 'text-emerald-400' : log.includes('NEG') ? 'text-rose-400' : 'text-gray-300'}>
                          {log}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
