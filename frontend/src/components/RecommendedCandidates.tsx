import { Award, Briefcase, Star } from 'lucide-react';

interface Recommendation {
  resume_id: string;
  candidateName: string;
  final_score: number;
  ats_score: number;
  semantic_score: number;
  reason: string;
}

interface Props {
  recommendations?: Recommendation[];
}

export const RecommendedCandidates = ({ recommendations = [] }: Props) => {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center justify-center text-center text-slate-500 min-h-[200px]">
        <Briefcase size={32} className="text-slate-300 mb-3" />
        <p className="font-medium text-sm">No recommendations yet</p>
        <p className="text-xs mt-1">Use the Copilot to recommend candidates for a job description.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
        <h3 className="font-bold text-amber-900 flex items-center gap-2">
          <Star size={18} className="text-amber-500 fill-amber-500" />
          Top Recommendations
        </h3>
      </div>
      <div className="divide-y divide-slate-100">
        {recommendations.map((cand, idx) => (
          <div key={cand.resume_id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-sm">
                  #{idx + 1}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{cand.candidateName || 'Unknown Candidate'}</h4>
                  <p className="text-xs text-slate-500">{cand.reason}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-emerald-600">{cand.final_score.toFixed(1)}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Final Score</div>
              </div>
            </div>
            
            <div className="flex gap-4 mt-3">
              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-xs text-slate-600 font-medium">
                <Award size={12} className="text-slate-400" />
                ATS: {cand.ats_score}
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-xs text-slate-600 font-medium">
                <Star size={12} className="text-slate-400" />
                Semantic: {cand.semantic_score.toFixed(0)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
