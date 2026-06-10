import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Tag, Play, CheckCircle2, ChevronRight, User, MessageSquare, ClipboardCheck } from 'lucide-react';
import type { RootState } from '../store';
import { AIRecruiterBrief } from './AIRecruiterBrief';
import { AIQuestionGenerator } from './AIQuestionGenerator';
import { HiringRecommendationEngine } from './HiringRecommendationEngine';
import { InterviewScorecard } from './InterviewScorecard';
import { AIOutreachComposer } from './AIOutreachComposer';
import { InterviewCopilotPanel } from './InterviewCopilotPanel';
import { AIExplainabilityPanel } from './AIExplainabilityPanel';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

const STAGES = [
  'Applied',
  'Screening',
  'Shortlisted',
  'Interview Scheduled',
  'Interview Completed',
  'Offer Extended',
  'Hired',
  'Rejected'
];

export const CandidateActionCenter = ({ candidate, onUpdate }: { candidate: any, onUpdate: () => void }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(candidate?.pipelineStage || 'Applied');
  const [tagInput, setTagInput] = useState('');
  
  // New State
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [owner, setOwner] = useState(candidate?.currentOwner || '');
  const [noteText, setNoteText] = useState('');
  const [showScorecard, setShowScorecard] = useState(false);

  useEffect(() => {
    const fetchRecruiters = async () => {
      try {
        const res = await axios.get(`${API_URL}/pipeline/assignable-users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRecruiters(res.data);
      } catch (err) {
        console.error("Failed to fetch recruiters", err);
      }
    };
    fetchRecruiters();
  }, [token]);

  useEffect(() => {
    setStage(candidate?.pipelineStage || 'Applied');
    setOwner(candidate?.currentOwner || '');
  }, [candidate]);

  const handleStageChange = async (newStage: string) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/pipeline/move`, {
        candidateIds: [candidate._id || candidate.id],
        newStage
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStage(newStage);
      onUpdate();
    } catch (error) {
      console.error("Failed to update stage", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerChange = async (newOwner: string) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/pipeline/assign`, {
        candidateIds: [candidate._id || candidate.id],
        newOwner
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOwner(newOwner);
      onUpdate();
    } catch (error) {
      console.error("Failed to assign owner", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      setLoading(true);
      try {
        await axios.post(`${API_URL}/pipeline/tags`, {
          candidateIds: [candidate._id || candidate.id],
          tags: [tagInput.trim()],
          action: 'add'
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTagInput('');
        onUpdate();
      } catch (error) {
        console.error("Failed to add tag", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/pipeline/tags`, {
        candidateIds: [candidate._id || candidate.id],
        tags: [tagToRemove],
        action: 'remove'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onUpdate();
    } catch (error) {
      console.error("Failed to remove tag", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/pipeline/notes`, {
        candidateId: candidate._id || candidate.id,
        text: noteText.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNoteText('');
      onUpdate();
    } catch (error) {
      console.error("Failed to add note", error);
    } finally {
      setLoading(false);
    }
  };

  if (!candidate) return null;

  return (
    <div className="space-y-5 relative">
      {/* Hiring Decision Engine (aggregates everything) */}
      <HiringRecommendationEngine candidateId={candidate._id || candidate.id} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
        <AIRecruiterBrief candidateId={candidate._id || candidate.id} token={token || ''} />

        <div className="flex items-center justify-between mt-2">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Play size={16} className="text-indigo-600" />
            Action Center
          </h3>
          <button 
            onClick={() => setShowScorecard(true)}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            <ClipboardCheck size={14} /> Submit Scorecard
          </button>
        </div>

      {/* Assignment */}
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1 uppercase">
          <User size={12} /> Assign Recruiter
        </label>
        <select 
          value={owner}
          onChange={(e) => handleOwnerChange(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
        >
          <option value="">Unassigned</option>
          {recruiters.map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
          ))}
        </select>
      </div>

      {/* CRM Metrics */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1 uppercase">
          <MessageSquare size={12} /> Candidate Engagement CRM
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Outreach Count</div>
            <div className="text-sm font-semibold text-slate-800">{candidate?.candidateEngagement?.outreachCount || 0}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Last Contacted</div>
            <div className="text-sm font-semibold text-slate-800">
              {candidate?.candidateEngagement?.lastContacted 
                ? new Date(candidate.candidateEngagement.lastContacted).toLocaleDateString() 
                : 'Never'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Response Rate</div>
            <div className="text-sm font-semibold text-slate-800">{candidate?.candidateEngagement?.responseRate || 0}%</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Engagement Score</div>
            <div className="text-sm font-semibold text-slate-800">{candidate?.candidateEngagement?.engagementScore || 0}/100</div>
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Stage Progression */}
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-2 block uppercase">Pipeline Stage</label>
        <select 
          value={stage}
          onChange={(e) => handleStageChange(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer disabled:opacity-50"
        >
          {STAGES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        
        {/* Visual Progress Bar Mini */}
        <div className="mt-3 flex items-center justify-between gap-1">
          {STAGES.map((s, idx) => {
            const currentIdx = STAGES.indexOf(stage);
            const isCompleted = idx <= currentIdx;
            const isCurrent = idx === currentIdx;
            
            return (
              <div 
                key={s} 
                title={s}
                className={`h-1.5 flex-1 rounded-full ${
                  isCurrent ? 'bg-indigo-600' : 
                  isCompleted ? 'bg-indigo-300' : 'bg-slate-100'
                }`}
              />
            );
          })}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Tags */}
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1 uppercase">
          <Tag size={12} /> Tags
        </label>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {candidate.tags && candidate.tags.length > 0 ? (
            candidate.tags.map((tag: string, idx: number) => (
              <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium border border-indigo-100">
                {tag}
                <button 
                  onClick={() => handleRemoveTag(tag)}
                  disabled={loading}
                  className="hover:text-indigo-900 ml-1 opacity-70 hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            ))
          ) : (
            <span className="text-xs text-slate-400 italic">No tags assigned.</span>
          )}
        </div>
        
        <input 
          type="text" 
          placeholder="Add a tag and press Enter..." 
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          disabled={loading}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>

      <hr className="border-slate-100" />

      {/* Recruiter Notes */}
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1 uppercase">
          <MessageSquare size={12} /> Recruiter Notes
        </label>
        
        <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
          {candidate.recruiterNotes && candidate.recruiterNotes.length > 0 ? (
            candidate.recruiterNotes.map((note: any, idx: number) => {
              const author = recruiters.find(r => r.id === note.addedBy)?.name || 'Recruiter';
              return (
                <div key={idx} className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-sm">
                  <div className="flex justify-between items-center mb-1 text-xs text-slate-500">
                    <span className="font-semibold">{author}</span>
                    <span>{new Date(note.addedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-700">{note.text}</p>
                </div>
              );
            })
          ) : (
            <span className="text-xs text-slate-400 italic">No notes yet.</span>
          )}
        </div>

        <div className="flex gap-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add an internal note..."
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-10"
          />
          <button 
            onClick={handleAddNote}
            disabled={loading || !noteText.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors h-10"
          >
            Add
          </button>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* AI Question Generator Integration */}
      <AIQuestionGenerator candidateId={candidate._id || candidate.id} />

      <hr className="border-slate-100" />

      {/* Live Interview Copilot */}
      {stage.includes('Interview') && (
        <>
          <InterviewCopilotPanel candidateId={candidate._id || candidate.id} context={`Interview for stage: ${stage}`} />
          <hr className="border-slate-100" />
        </>
      )}

      {/* Phase 4C Module 2: CRM Intelligence Panel */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1 uppercase">
          <MessageSquare size={12} /> CRM Intelligence
        </label>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase">Outreach Count</div>
            <div className="text-xl font-bold text-indigo-600">{candidate.candidateEngagement?.outreachCount || 0}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase">Last Contacted</div>
            <div className="text-sm font-bold text-slate-700 mt-1">
              {candidate.candidateEngagement?.lastContacted ? new Date(candidate.candidateEngagement.lastContacted).toLocaleDateString() : 'Never'}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase">Response Rate</div>
            <div className="text-xl font-bold text-emerald-600">{candidate.candidateEngagement?.responseRate || 0}%</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase">Engagement Score</div>
            <div className="text-xl font-bold text-purple-600">{candidate.candidateEngagement?.engagementScore || 0}/100</div>
          </div>
        </div>
      </div>
      
      <hr className="border-slate-100" />

      {/* AI Outreach Composer */}
      <AIOutreachComposer candidateId={candidate._id || candidate.id} jobId={candidate.jobId} />
      
      </div> {/* Closing Action Center main card */}

      {showScorecard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <InterviewScorecard 
              candidateId={candidate._id || candidate.id} 
              onClose={() => {
                setShowScorecard(false);
                onUpdate(); // trigger refresh of recommendation engine
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};
