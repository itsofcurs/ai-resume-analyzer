import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Clock, FileText, CheckCircle2, Video, FastForward, PlayCircle } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

const TIMELINE_ICONS: any = {
  'RESUME_UPLOADED': FileText,
  'ATS_PROCESSED': CheckCircle2,
  'PIPELINE_MOVE': FastForward,
  'INTERVIEW_SCHEDULED': Clock,
  'INTERVIEW_COMPLETED': Video
};

const TIMELINE_COLORS: any = {
  'RESUME_UPLOADED': 'text-blue-500 bg-blue-50',
  'ATS_PROCESSED': 'text-emerald-500 bg-emerald-50',
  'PIPELINE_MOVE': 'text-indigo-500 bg-indigo-50',
  'INTERVIEW_SCHEDULED': 'text-amber-500 bg-amber-50',
  'INTERVIEW_COMPLETED': 'text-purple-500 bg-purple-50'
};

export const CandidateTimeline = ({ candidateId }: { candidateId: string }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (candidateId) {
      fetchTimeline();
    }
  }, [candidateId]);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/interview/timeline/${candidateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTimeline(res.data);
    } catch (error) {
      console.error("Failed to fetch candidate timeline", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mt-4 flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mt-4">
      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4">
        <Clock size={16} className="text-slate-500" />
        Activity Timeline
      </h3>

      <div className="relative border-l-2 border-slate-100 ml-3 space-y-6">
        {timeline.length === 0 ? (
          <div className="text-sm text-slate-500 italic pl-4">No activities recorded yet.</div>
        ) : (
          timeline.map((event, idx) => {
            const Icon = TIMELINE_ICONS[event.type] || PlayCircle;
            const colorClass = TIMELINE_COLORS[event.type] || 'text-slate-500 bg-slate-50';
            
            return (
              <div key={idx} className="relative pl-6">
                <div className={`absolute -left-[11px] top-1 p-1 rounded-full border-2 border-white ${colorClass}`}>
                  <Icon size={12} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{event.title}</h4>
                  {event.details && <p className="text-xs text-slate-600 mt-0.5">{event.details}</p>}
                  <span className="text-[10px] text-slate-400 font-medium block mt-1">
                    {new Date(event.date).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
