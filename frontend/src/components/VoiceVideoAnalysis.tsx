import React, { useState } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

interface VoiceVideoAnalysisProps {
  analysisData: any[]; // Array of rounds
}

export const VoiceVideoAnalysis: React.FC<VoiceVideoAnalysisProps> = ({ analysisData }) => {
  if (!analysisData || analysisData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">Voice & Video Intelligence</h2>
        <p className="text-gray-400">No media analysis available for this candidate.</p>
      </div>
    );
  }

  const [selectedRound, setSelectedRound] = useState(analysisData.length - 1);
  const data = analysisData[selectedRound];

  const radarData = [
    { subject: 'Communication', A: data.communicationScore || 0, fullMark: 100 },
    { subject: 'Confidence', A: data.confidenceScore || 0, fullMark: 100 },
    { subject: 'Leadership', A: data.leadershipPresenceScore || 0, fullMark: 100 },
    { subject: 'Engagement', A: data.engagementScore || 0, fullMark: 100 },
    { subject: 'Integrity', A: data.interviewIntegrityScore || 0, fullMark: 100 },
    { subject: 'Authenticity', A: data.authenticityScore || 0, fullMark: 100 },
  ];

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mt-6 shadow-lg shadow-blue-900/10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Voice & Video Intelligence</h2>
          <p className="text-gray-400 text-sm mt-1">Multi-modal behavioral analysis</p>
        </div>
        {analysisData.length > 1 && (
          <select 
            className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-1"
            value={selectedRound}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
          >
            {analysisData.map((rd, i) => (
              <option key={i} value={i}>{rd.roundType || `Round ${i + 1}`}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Chart */}
        <div className="lg:col-span-1 bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 text-center">Core Competencies</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#FFF' }} />
                <Radar name="Candidate" dataKey="A" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Communication" value={data.communicationScore} />
          <MetricCard title="Confidence" value={data.confidenceScore} />
          <MetricCard title="Leadership" value={data.leadershipPresenceScore} />
          <MetricCard title="Integrity" value={data.interviewIntegrityScore} isRisk={data.interviewIntegrityScore < 70} />
          
          <MetricCard title="Speech Rate" value={data.speechRate} subtitle="wpm" />
          <MetricCard title="Filler Words" value={data.fillerWordCount} subtitle="count" />
          <MetricCard title="Eye Contact" value={data.eyeContactScore} />
          <MetricCard title="Authenticity" value={data.authenticityScore} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Executive Summary */}
        <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4">
          <h3 className="text-blue-400 font-semibold mb-2 text-sm uppercase tracking-wider">Executive Summary</h3>
          <p className="text-gray-300 text-sm leading-relaxed">{data.executiveSummary || 'No summary available.'}</p>
        </div>

        {/* Risks & Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4">
            <h3 className="text-red-400 font-semibold mb-2 text-sm uppercase tracking-wider">Risks</h3>
            {data.scriptReadingRisk === 'HIGH' && <p className="text-red-300 text-xs mb-1">• High Script Reading Risk</p>}
            {data.aiGeneratedAnswerRisk === 'HIGH' && <p className="text-red-300 text-xs mb-1">• Potential AI Generated Answers</p>}
            {data.suspiciousBehaviorFlags?.map((flag: string, i: number) => (
              <p key={i} className="text-red-300 text-xs mb-1">• {flag}</p>
            ))}
            {(!data.suspiciousBehaviorFlags || data.suspiciousBehaviorFlags.length === 0) && data.scriptReadingRisk !== 'HIGH' && data.aiGeneratedAnswerRisk !== 'HIGH' && (
              <p className="text-green-400 text-xs">✓ No major behavioral risks detected</p>
            )}
          </div>
          
          <div className="bg-green-900/20 border border-green-900/50 rounded-lg p-4">
            <h3 className="text-green-400 font-semibold mb-2 text-sm uppercase tracking-wider">Strengths</h3>
            {data.strengths?.map((str: string, i: number) => (
              <p key={i} className="text-green-300 text-xs mb-1">• {str}</p>
            ))}
            {(!data.strengths || data.strengths.length === 0) && (
              <p className="text-gray-500 text-xs">No specific strengths extracted.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, subtitle = '', isRisk = false }: { title: string, value: number, subtitle?: string, isRisk?: boolean }) => {
  const getGradient = (val: number, risk: boolean) => {
    if (risk) return 'from-red-600 to-red-900';
    if (val >= 85) return 'from-green-500 to-emerald-700';
    if (val >= 70) return 'from-blue-500 to-indigo-700';
    return 'from-yellow-500 to-orange-700';
  };

  return (
    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 flex flex-col justify-between">
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">{title}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${getGradient(value, isRisk)}`}>
          {value ? Math.round(value) : 0}
        </span>
        <span className="text-gray-500 text-xs">{subtitle || '%'}</span>
      </div>
    </div>
  );
};
