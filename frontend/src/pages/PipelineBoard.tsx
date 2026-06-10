import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult, DragStart } from '@hello-pangea/dnd';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Search, Filter, AlertCircle, Clock, CheckCircle2, User, Tag, Calendar } from 'lucide-react';
import type { RootState } from '../store';
import { InterviewSchedulerModal } from '../components/InterviewSchedulerModal';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${SOCKET_URL}/api`;

const COLUMNS = [
  'Applied',
  'Screening',
  'Shortlisted',
  'Interview Scheduled',
  'Interview Completed',
  'Offer Extended',
  'Hired',
  'Rejected'
];

const PRIORITY_COLORS = {
  'Low': 'bg-green-100 text-green-700',
  'Medium': 'bg-yellow-100 text-yellow-700',
  'High': 'bg-orange-100 text-orange-700',
  'Critical': 'bg-red-100 text-red-700'
};

const PRIORITY_ICONS = {
  'Low': '🟢',
  'Medium': '🟡',
  'High': '🟠',
  'Critical': '🔴'
};

export const PipelineBoard = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const socketIdRef = useRef("");
  
  // Toast state
  const [toast, setToast] = useState<{ show: boolean, candidateId: string | null }>({ show: false, candidateId: null });
  const [isInterviewModalOpen, setInterviewModalOpen] = useState(false);
  const [selectedCandidateForInterview, setSelectedCandidateForInterview] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('ALL');

  useEffect(() => {
    fetchPipeline();

    // Socket.io initialization
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      socketIdRef.current = socket.id || "";
    });

    socket.on('PIPELINE_UPDATED', (event: any) => {
      if (event && event.sourceSocketId === socketIdRef.current) return;
      if (isDraggingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      fetchPipeline(false);
    });

    socket.on('INTERVIEW_CREATED', (event: any) => {
      if (event && event.sourceSocketId === socketIdRef.current) return;
      if (isDraggingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      fetchPipeline(false);
    });

    socket.on('PIPELINE_ANALYTICS_UPDATED', (event: any) => {
      if (event && event.sourceSocketId === socketIdRef.current) return;
      if (isDraggingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      fetchPipeline(false);
    });

    socket.on('PIPELINE_NOTE_ADDED', (event: any) => {
      if (event && event.sourceSocketId === socketIdRef.current) return;
      if (isDraggingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      fetchPipeline(false);
    });

    socket.on('PIPELINE_ASSIGNMENT_UPDATED', (event: any) => {
      if (event && event.sourceSocketId === socketIdRef.current) return;
      if (isDraggingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      fetchPipeline(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchPipeline = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/pipeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCandidates(res.data);
    } catch (error) {
      console.error("Failed to fetch pipeline data", error);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const onDragStart = (initial: DragStart) => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const onDragEnd = async (result: DropResult) => {
    isDraggingRef.current = false;
    setIsDragging(false);

    if (pendingRefreshRef.current) {
      pendingRefreshRef.current = false;
      fetchPipeline(false);
    }

    const { source, destination, draggableId } = result;

    // Dropped outside the list
    if (!destination) return;

    // Dropped in the same place
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const newStage = destination.droppableId;
    
    // Optimistic UI update
    const updatedCandidates = candidates.map(c => {
      if (c._id === draggableId) {
        return { ...c, pipelineStage: newStage };
      }
      return c;
    });
    setCandidates(updatedCandidates);

    // Call API
    try {
      await axios.post(`${API_URL}/pipeline/move`, {
        candidateIds: [draggableId],
        newStage,
        sourceSocketId: socketIdRef.current
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Show Interview Scheduler Toast if moved to Interview Scheduled
      if (newStage === 'Interview Scheduled') {
        setToast({ show: true, candidateId: draggableId });
        setTimeout(() => setToast({ show: false, candidateId: null }), 5000);
      }
    } catch (error) {
      console.error("Failed to move candidate", error);
      // Revert on failure
      fetchPipeline();
    }
  };

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = c.candidateName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.candidateEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = selectedPriority === 'ALL' || c.priority === selectedPriority;
    return matchesSearch && matchesPriority;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header & Controls */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pipeline Board</h1>
          <p className="text-sm text-slate-500">Drag and drop candidates to manage their hiring stage.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Search candidates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 transition-all"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none transition-all cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">🔴 Critical</option>
              <option value="High">🟠 High</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Low">🟢 Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-6 h-full items-start">
            {COLUMNS.map(columnId => {
              const columnCandidates = filteredCandidates.filter(c => c.pipelineStage === columnId);
              
              return (
                <div key={columnId} className="flex flex-col bg-slate-100 rounded-xl w-80 shrink-0 max-h-full">
                  <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200/60 shrink-0">
                    <h3 className="font-semibold text-slate-700 text-sm">{columnId}</h3>
                    <span className="bg-slate-200 text-slate-600 text-xs font-medium px-2 py-0.5 rounded-full">
                      {columnCandidates.length}
                    </span>
                  </div>
                  
                  <Droppable droppableId={columnId}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-indigo-50/50' : ''}`}
                      >
                        {columnCandidates.map((candidate, index) => (
                          <Draggable key={candidate._id} draggableId={candidate._id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 transition-all ${snapshot.isDragging ? 'shadow-lg ring-2 ring-indigo-500/20 rotate-1' : 'hover:shadow-md hover:border-slate-300'}`}
                              >
                                {/* Header */}
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <h4 className="font-bold text-slate-800 text-sm">{candidate.candidateName || 'Unknown Candidate'}</h4>
                                    <p className="text-xs text-slate-500 truncate w-40">{candidate.candidateEmail || 'No email'}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <span title={candidate.priority} className="text-sm">
                                      {/* @ts-ignore */}
                                      {PRIORITY_ICONS[candidate.priority] || '🟡'}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Metrics Grid */}
                                <div className="grid grid-cols-3 gap-2 my-3">
                                  <div className="bg-slate-50 rounded p-1.5 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase font-semibold">ATS</div>
                                    <div className={`text-xs font-bold ${candidate.atsScores?.overallScore >= 80 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                      {candidate.atsScores?.overallScore || '--'}
                                    </div>
                                  </div>
                                  <div className="bg-slate-50 rounded p-1.5 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Trust</div>
                                    <div className={`text-xs font-bold ${candidate.fraudAnalysis?.trustScore >= 80 ? 'text-emerald-600' : candidate.fraudAnalysis?.trustScore < 60 ? 'text-rose-600' : 'text-slate-700'}`}>
                                      {candidate.fraudAnalysis?.trustScore || '--'}
                                    </div>
                                  </div>
                                  <div className="bg-slate-50 rounded p-1.5 text-center">
                                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Success</div>
                                    <div className={`text-xs font-bold ${candidate.successPrediction?.successProbability >= 80 ? 'text-indigo-600' : 'text-slate-700'}`}>
                                      {candidate.successPrediction?.successProbability ? `${candidate.successPrediction.successProbability}%` : '--'}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Tags */}
                                {candidate.tags && candidate.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {candidate.tags.slice(0, 3).map((tag: string, idx: number) => (
                                      <span key={idx} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium border border-indigo-100">
                                        {tag}
                                      </span>
                                    ))}
                                    {candidate.tags.length > 3 && (
                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                                        +{candidate.tags.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Toast Notification for Interview Scheduler */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 max-w-sm flex flex-col gap-3 animate-in slide-in-from-bottom-5 z-50">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <Calendar size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Candidate moved to Interview Scheduled</h4>
              <p className="text-xs text-slate-500 mt-1">Would you like to schedule the interview now?</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-1">
            <button 
              onClick={() => setToast({ show: false, candidateId: null })}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Later
            </button>
            <button 
              onClick={() => {
                setSelectedCandidateForInterview(toast.candidateId);
                setInterviewModalOpen(true);
                setToast({ show: false, candidateId: null });
              }}
              className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
            >
              Schedule Interview
            </button>
          </div>
        </div>
      )}

      {selectedCandidateForInterview && (
        <InterviewSchedulerModal
          isOpen={isInterviewModalOpen}
          onClose={() => setInterviewModalOpen(false)}
          candidateId={selectedCandidateForInterview}
          onSuccess={() => fetchPipeline(false)}
        />
      )}
    </div>
  );
};
