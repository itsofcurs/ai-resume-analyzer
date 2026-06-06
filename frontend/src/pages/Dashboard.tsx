import { useState, useEffect, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileText, CheckCircle, Users, TrendingUp, BrainCircuit, ChevronRight, X, Sparkles, ShieldAlert, ShieldCheck, Trash2, Target, Award, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import type { RootState } from '../store';
import { logout } from '../store/authSlice';
import { AgentVisualizer } from '../components/AgentVisualizer';
import { RecommendedCandidates } from '../components/RecommendedCandidates';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const Dashboard = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [stats, setStats] = useState({ total_resumes: 0, processed: 0, failed: 0, unique_skills: 0, avg_ats_score: null as number | null, averageTrustScore: null as number | null, highRiskCandidates: 0, mediumRiskCandidates: 0, verifiedCandidates: 0, averageHiringReadiness: null as number | null, averageGrowthPotential: null as number | null, candidatesInterviewReady: 0, candidatesRequiringUpskilling: 0, averageSuccessScore: null as number | null, highPotentialCandidates: 0, lowRetentionRisk: 0, leadershipCandidates: 0, strongHireCandidates: 0 });
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [summary, setSummary] = useState<string>('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);

  const token = useSelector((state: RootState) => state.auth.token);
  const dispatch = useDispatch();

  const fetchData = async () => {
    try {
      const [statsRes, candidatesRes] = await Promise.all([
        axios.get(`${API_URL}/resumes/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/resumes`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setStats(statsRes.data);
      setCandidates(candidatesRes.data);
    } catch (error: any) {
      console.error("Failed to fetch dashboard data", error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        dispatch(logout());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const socket = io(socketUrl);
    socket.on('resume_processed', () => {
      fetchData();
    });
    socket.on('resume_status_update', (data: { id: string, status: string }) => {
      setCandidates(prev => prev.map(c => 
        (c._id === data.id || c.id === data.id) ? { ...c, status: data.status } : c
      ));
      if (data.status === 'PROCESSED' || data.status === 'FAILED') fetchData();
    });
    return () => { socket.disconnect(); };
  }, [token]);

  const handleFileUpload = async (files: FileList | File[]) => {
    const formData = new FormData();
    const fileArray = Array.from(files);
    
    if (fileArray.length === 1) {
      formData.append('file', fileArray[0]);
      setIsUploading(true);
      try {
        await axios.post(`${API_URL}/resumes/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
        });
        fetchData();
      } catch (error) {
        console.error("Upload failed", error);
        alert("Failed to upload file. Please try again.");
      } finally {
        setIsUploading(false);
      }
    } else if (fileArray.length > 1) {
      fileArray.forEach(f => formData.append('files', f));
      setIsUploading(true);
      try {
        await axios.post(`${API_URL}/resumes/upload/batch`, formData, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
        });
        fetchData();
      } catch (error) {
        console.error("Batch upload failed", error);
        alert("Failed to upload files. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); 
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteCandidate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this candidate?")) return;
    try {
      await axios.delete(`${API_URL}/resumes/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCandidates(prev => prev.filter(c => (c._id || c.id) !== id));
      if (selectedCandidate && (selectedCandidate._id || selectedCandidate.id) === id) {
        setSelectedCandidate(null);
      }
      fetchData();
    } catch (error) {
      console.error("Failed to delete candidate:", error);
      alert("Failed to delete candidate");
    }
  };

  const openCandidate = async (candidate: any) => {
    setSelectedCandidate(candidate);
    if (candidate.status === 'PROCESSED') {
      setLoadingSummary(true);
      setSummary('');
      try {
        const res = await axios.get(`${API_URL}/copilot/summary/${candidate._id || candidate.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSummary(res.data.summary);
      } catch (err: any) {
        setSummary(err.response?.data?.error || "Failed to generate AI Summary.");
      } finally {
        setLoadingSummary(false);
      }
    }
  };

  const processingCandidate = candidates.find(c => ['PENDING', 'EXTRACTING', 'ANALYZING', 'SCORING', 'RANKING'].includes(c.status));
  const activeStatus = processingCandidate ? processingCandidate.status : null;

  // Show 3 candidates by default, all if expanded
  const VISIBLE_COUNT = 3;
  const visibleCandidates = showAllCandidates ? candidates : candidates.slice(0, VISIBLE_COUNT);
  const hasMoreCandidates = candidates.length > VISIBLE_COUNT;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 relative animate-fade-in">
      {/* Header */}
      <header>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">AI Hiring Intelligence</h2>
        <p className="text-slate-500 text-sm mt-1">Semantic search, fraud detection, and candidate insights.</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users size={64} />
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Resumes</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stats.total_resumes}</h3>
          <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
            <TrendingUp size={12} /> live tracking
          </p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
            <FileText size={64} />
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Processed</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stats.processed}</h3>
          <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
            <TrendingUp size={12} /> NLP Pipeline Active
          </p>
        </div>
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-5 border border-indigo-500 shadow-[0_4px_20px_rgb(79,70,229,0.2)] text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <BrainCircuit size={64} />
          </div>
          <p className="text-xs font-semibold text-indigo-200 uppercase tracking-wider mb-1">Semantic Vectors</p>
          <h3 className="text-3xl font-black tracking-tight">{stats.unique_skills}</h3>
          <p className="text-xs text-indigo-200 mt-2 font-medium flex items-center gap-1">
            <CheckCircle size={12} /> MongoDB Atlas Ready
          </p>
        </div>
        {stats.avg_ats_score != null && (
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-blue-200 transition-colors">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
              <Target size={64} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg ATS Score</p>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stats.avg_ats_score}</h3>
            <p className="text-xs text-blue-600 mt-2 font-medium flex items-center gap-1">
              <TrendingUp size={12} /> AI Quality Index
            </p>
          </div>
        )}
      </div>

      {/* Fraud Detection Metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.averageTrustScore != null && (
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-emerald-200 transition-colors">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
              <ShieldCheck size={64} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg Trust Score</p>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stats.averageTrustScore}</h3>
            <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
              <TrendingUp size={12} /> Fraud Detection Agent
            </p>
          </div>
        )}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-rose-200 transition-colors">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
            <ShieldAlert size={64} />
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">High Risk</p>
          <h3 className="text-3xl font-black text-rose-600 tracking-tight">{stats.highRiskCandidates}</h3>
          <p className="text-xs text-rose-600 mt-2 font-medium">Flagged candidates</p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-amber-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Medium Risk</p>
          <h3 className="text-3xl font-black text-amber-500 tracking-tight">{stats.mediumRiskCandidates}</h3>
          <p className="text-xs text-amber-600 mt-2 font-medium">Contradictions found</p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-emerald-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Verified (Low Risk)</p>
          <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{stats.verifiedCandidates}</h3>
          <p className="text-xs text-emerald-600 mt-2 font-medium">Clean profiles</p>
        </div>
      </div>

      {/* Career Intelligence Metrics (Skill Gap Phase 2C-C) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        {stats.averageHiringReadiness != null && (
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
              <BrainCircuit size={64} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg Hiring Readiness</p>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stats.averageHiringReadiness}%</h3>
            <p className="text-xs text-indigo-600 mt-2 font-medium flex items-center gap-1">
              <TrendingUp size={12} /> Career Intelligence
            </p>
          </div>
        )}
        {stats.averageGrowthPotential != null && (
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-blue-200 transition-colors">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp size={64} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg Growth Potential</p>
            <h3 className="text-3xl font-black text-blue-600 tracking-tight">{stats.averageGrowthPotential}%</h3>
            <p className="text-xs text-blue-600 mt-2 font-medium flex items-center gap-1">
              Future Leaders
            </p>
          </div>
        )}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-emerald-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Interview Ready</p>
          <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{stats.candidatesInterviewReady}</h3>
          <p className="text-xs text-emerald-600 mt-2 font-medium">Ready to hire</p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-amber-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Needs Upskilling</p>
          <h3 className="text-3xl font-black text-amber-500 tracking-tight">{stats.candidatesRequiringUpskilling}</h3>
          <p className="text-xs text-amber-600 mt-2 font-medium">Have missing skills</p>
        </div>
      </div>

      {/* Workforce Intelligence Metrics (Predictive Hiring Phase 2C-D) */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mt-4">
        {stats.averageSuccessScore != null && (
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
              <BrainCircuit size={64} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg Success Score</p>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{stats.averageSuccessScore}%</h3>
            <p className="text-xs text-indigo-600 mt-2 font-medium flex items-center gap-1">
              <TrendingUp size={12} /> Predictive Engine
            </p>
          </div>
        )}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-emerald-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Strong Hires</p>
          <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{stats.strongHireCandidates}</h3>
          <p className="text-xs text-emerald-600 mt-2 font-medium">Top recommendation</p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-blue-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">High Potential</p>
          <h3 className="text-3xl font-black text-blue-600 tracking-tight">{stats.highPotentialCandidates}</h3>
          <p className="text-xs text-blue-600 mt-2 font-medium">&gt;80% Success Prob</p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Low Retention Risk</p>
          <h3 className="text-3xl font-black text-indigo-600 tracking-tight">{stats.lowRetentionRisk}</h3>
          <p className="text-xs text-indigo-600 mt-2 font-medium">Likely to stay long</p>
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-purple-200 transition-colors">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Leadership Material</p>
          <h3 className="text-3xl font-black text-purple-600 tracking-tight">{stats.leadershipCandidates}</h3>
          <p className="text-xs text-purple-600 mt-2 font-medium">High/Exceptional</p>
        </div>
      </div>

      {/* Pipeline Status Strip (only when processing) */}
      <AgentVisualizer status={activeStatus} />

      {/* Main Content Area — 2 column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Candidates */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">
                Recent Candidates
                {candidates.length > 0 && <span className="ml-2 text-slate-400 font-medium">({candidates.length})</span>}
              </h3>
              <button className="text-xs text-indigo-600 font-semibold hover:text-indigo-700 transition-colors" onClick={fetchData}>Refresh</button>
            </div>
            
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="p-6 text-center text-slate-400 text-sm">Loading data from Database...</div>
              ) : candidates.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">No resumes uploaded yet. Upload one to see it here!</div>
              ) : visibleCandidates.map((candidate) => {
                const authScore = candidate.aiAnalysis?.authenticity_score;
                const isSuspicious = authScore && authScore < 70;
                
                return (
                  <div key={candidate._id || candidate.id} onClick={() => openCandidate(candidate)} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs border border-slate-200/60">
                        {candidate.candidateName?.substring(0,2).toUpperCase() || 'UN'}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                          {candidate.candidateName || candidate.filename}
                          {isSuspicious && (
                            <span title="Low Authenticity Score">
                              <ShieldAlert size={13} className="text-rose-500" />
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {candidate.candidateEmail || 'Status: ' + candidate.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${candidate.status === 'PROCESSED' ? 'text-emerald-600' : (candidate.status === 'PROCESSING' || candidate.status === 'EXTRACTING' || candidate.status === 'PENDING' || candidate.status === 'SCORING' || candidate.status === 'RANKING' ? 'text-indigo-500 animate-pulse' : 'text-amber-500')}`}>
                          {candidate.status}
                        </p>
                        {candidate.atsScores?.overall_score != null && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                              candidate.atsScores.overall_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                              candidate.atsScores.overall_score >= 60 ? 'bg-blue-100 text-blue-700' :
                              candidate.atsScores.overall_score >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                              ATS {candidate.atsScores.overall_score}
                            </span>
                            {candidate.candidateRanking?.grade && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                ['A+', 'A'].includes(candidate.candidateRanking.grade) ? 'bg-emerald-100 text-emerald-700' :
                                ['B+', 'B'].includes(candidate.candidateRanking.grade) ? 'bg-blue-100 text-blue-700' :
                                ['C+', 'C'].includes(candidate.candidateRanking.grade) ? 'bg-amber-100 text-amber-700' :
                                'bg-rose-100 text-rose-700'
                              }`}>
                                {candidate.candidateRanking.grade}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDeleteCandidate(candidate._id || candidate.id, e)}
                        className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Delete Candidate"
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show More / Show Less */}
            {hasMoreCandidates && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                <button
                  onClick={() => setShowAllCandidates(!showAllCandidates)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors mx-auto"
                >
                  {showAllCandidates ? (
                    <><ChevronUp size={14} /> Show Less</>
                  ) : (
                    <><ChevronDown size={14} /> Show {candidates.length - VISIBLE_COUNT} More Candidates</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Upload + Fraud Protection */}
        <div className="space-y-5">
          {/* Upload Widget */}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange} 
            accept=".pdf,.docx,.txt" 
            multiple
          />
          <div 
            className={`bg-white rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 cursor-pointer shadow-sm ${
              isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <UploadCloud size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-0.5">Ingest Resumes</h3>
            <p className="text-xs text-slate-500 mb-3">Drag & drop PDF, DOCX, or TXT</p>
            <button 
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 px-5 rounded-xl transition-colors text-xs shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isUploading}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              {isUploading ? "Uploading..." : "Browse Files"}
            </button>
          </div>

          {/* Fraud Protection */}
          <div className="bg-gradient-to-b from-white to-slate-50 rounded-2xl border border-slate-200/80 p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5">
              <ShieldAlert size={80} />
            </div>
            <div className="flex items-center gap-2.5 mb-2 relative z-10">
              <div className="bg-rose-100 text-rose-600 p-1.5 rounded-lg">
                <ShieldAlert size={16} />
              </div>
              <h3 className="font-bold text-sm text-slate-800">Fraud Protection</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed relative z-10">
              AI actively scanning for keyword stuffing, perfect phrasing, and impossible timeline claims.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom: Recommendations */}
      <div className="mt-2">
        <RecommendedCandidates />
      </div>

      {/* Candidate Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl shadow-inner border border-indigo-200/50">
                  {selectedCandidate.candidateName?.substring(0,2).toUpperCase() || 'UN'}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">{selectedCandidate.candidateName || selectedCandidate.filename}</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{selectedCandidate.candidateEmail || 'No email provided'} • {selectedCandidate.candidatePhone || 'No phone'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCandidate(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={18} /></button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-6">
              
              {/* Authenticity Score Panel */}
              {selectedCandidate.aiAnalysis && (
                <div className={`rounded-xl p-4 border ${
                  selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {selectedCandidate.aiAnalysis.authenticity_score < 70 ? (
                          <ShieldAlert className="text-rose-600" size={18} />
                        ) : (
                          <ShieldCheck className="text-emerald-600" size={18} />
                        )}
                        <h4 className={`font-bold text-sm ${selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'text-rose-900' : 'text-emerald-900'}`}>
                          Authenticity Score: {selectedCandidate.aiAnalysis.authenticity_score}/100
                        </h4>
                      </div>
                      <p className={`text-xs ${selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        AI-Generated Probability: {selectedCandidate.aiAnalysis.ai_generated_probability}%
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
                    }`}>
                      {selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'HIGH RISK' : 'VERIFIED'}
                    </span>
                  </div>
                  
                  {selectedCandidate.aiAnalysis.red_flags && selectedCandidate.aiAnalysis.red_flags.length > 0 && selectedCandidate.aiAnalysis.authenticity_score < 90 && (
                    <div className="mt-3 pt-3 border-t border-rose-200/50">
                      <h5 className="text-[10px] font-bold text-rose-900 uppercase tracking-wider mb-1.5">Flagged Concerns</h5>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {selectedCandidate.aiAnalysis.red_flags.map((flag: string, i: number) => (
                          <li key={i} className="text-xs text-rose-800">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Copilot Summary */}
              {selectedCandidate.status === 'PROCESSED' && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-100/50 rounded-xl p-5 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Sparkles size={60} />
                  </div>
                  <div className="flex items-center gap-2 mb-2 text-indigo-700 font-bold text-sm relative z-10">
                    <Sparkles size={16} /> AI Recruiter Summary
                  </div>
                  {loadingSummary ? (
                    <div className="animate-pulse flex space-x-4 relative z-10">
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-2 bg-indigo-200 rounded"></div>
                        <div className="h-2 bg-indigo-200 rounded w-5/6"></div>
                        <div className="h-2 bg-indigo-200 rounded w-4/6"></div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-700 leading-relaxed text-xs font-medium relative z-10">{summary}</p>
                  )}
                </div>
              )}

              {/* ATS Score Breakdown */}
              {selectedCandidate.atsScores && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 text-blue-700 font-bold text-sm">
                    <Target size={16} /> ATS Score Breakdown
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-black text-slate-900">{selectedCandidate.atsScores.overall_score}/100</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      selectedCandidate.atsScores.overall_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                      selectedCandidate.atsScores.overall_score >= 60 ? 'bg-blue-100 text-blue-700' :
                      selectedCandidate.atsScores.overall_score >= 40 ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {selectedCandidate.atsScores.overall_score >= 80 ? 'Excellent' :
                       selectedCandidate.atsScores.overall_score >= 60 ? 'Good' :
                       selectedCandidate.atsScores.overall_score >= 40 ? 'Average' : 'Needs Work'}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Skill Completeness', value: selectedCandidate.atsScores.skill_completeness },
                      { label: 'Experience', value: selectedCandidate.atsScores.experience_score },
                      { label: 'Education', value: selectedCandidate.atsScores.education_score },
                      { label: 'Resume Quality', value: selectedCandidate.atsScores.resume_quality },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-slate-600 font-medium">{item.label}</span>
                          <span className="text-slate-900 font-bold">{item.value}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all duration-500 ${
                            item.value >= 80 ? 'bg-emerald-500' :
                            item.value >= 60 ? 'bg-blue-500' :
                            item.value >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                          }`} style={{ width: `${item.value}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate Ranking */}
              {selectedCandidate.candidateRanking && (
                <div className="bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-100/50 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 text-cyan-700 font-bold text-sm">
                    <Award size={16} /> Candidate Ranking
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <div className={`text-2xl font-black ${
                        ['A+', 'A'].includes(selectedCandidate.candidateRanking.grade) ? 'text-emerald-600' :
                        ['B+', 'B'].includes(selectedCandidate.candidateRanking.grade) ? 'text-blue-600' :
                        ['C+', 'C'].includes(selectedCandidate.candidateRanking.grade) ? 'text-amber-600' :
                        'text-rose-600'
                      }`}>{selectedCandidate.candidateRanking.grade}</div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">Grade</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-lg inline-block ${
                        selectedCandidate.candidateRanking.tier === 'Exceptional' ? 'bg-emerald-100 text-emerald-700' :
                        selectedCandidate.candidateRanking.tier === 'Strong' ? 'bg-blue-100 text-blue-700' :
                        selectedCandidate.candidateRanking.tier === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{selectedCandidate.candidateRanking.tier}</div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">Tier</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-lg inline-block ${
                        selectedCandidate.candidateRanking.hiring_priority === 'Critical' ? 'bg-rose-100 text-rose-700' :
                        selectedCandidate.candidateRanking.hiring_priority === 'High' ? 'bg-emerald-100 text-emerald-700' :
                        selectedCandidate.candidateRanking.hiring_priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{selectedCandidate.candidateRanking.hiring_priority}</div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">Priority</div>
                    </div>
                  </div>
                  {selectedCandidate.candidateRanking.recruiter_recommendation && (
                    <div className="bg-white/60 rounded-lg p-3 border border-cyan-100">
                      <p className="text-xs text-slate-700 leading-relaxed italic">
                        "{selectedCandidate.candidateRanking.recruiter_recommendation}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Skills */}
              {selectedCandidate.parsedData?.skills && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2 text-sm">Extracted Technology Stack</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCandidate.parsedData.skills.map((skill: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200/60 text-slate-700 rounded-lg text-[11px] font-bold transition-colors">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 mb-2 text-sm">Raw Context Reference</h4>
                <div className="bg-slate-900 text-slate-300 p-4 rounded-xl text-[11px] font-mono overflow-y-auto max-h-32 leading-relaxed shadow-inner">
                  {selectedCandidate.rawText?.substring(0, 800)}...
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
