import { useState, useEffect, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileText, CheckCircle, Users, TrendingUp, BrainCircuit, ChevronRight, X, Sparkles, ShieldAlert, ShieldCheck, Trash2, Target, Award } from 'lucide-react';
import axios from 'axios';
import { useSelector, useDispatch } from 'react-redux';
import { io } from 'socket.io-client';
import type { RootState } from '../store';
import { logout } from '../store/authSlice';
import { AgentVisualizer } from '../components/AgentVisualizer';
import { CopilotPanel } from '../components/CopilotPanel';
import { SemanticSearchWidget } from '../components/SemanticSearchWidget';
import { RecommendedCandidates } from '../components/RecommendedCandidates';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const Dashboard = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [stats, setStats] = useState({ total_resumes: 0, processed: 0, failed: 0, unique_skills: 0, avg_ats_score: null as number | null });
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [summary, setSummary] = useState<string>('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Semantic Search State

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
      fetchData(); // auto-refresh when processed
    });
    socket.on('resume_status_update', (data: { id: string, status: string }) => {
      setCandidates(prev => prev.map(c => 
        (c._id === data.id || c.id === data.id) ? { ...c, status: data.status } : c
      ));
      if (data.status === 'PROCESSED' || data.status === 'FAILED') fetchData(); // Refresh stats
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
      fetchData(); // Refresh stats
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 relative">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">AI Hiring Intelligence</h2>
          <p className="text-slate-500 mt-1">Semantic search, fraud detection, and candidate insights.</p>
        </div>
        

      </header>
      
      {/* 3D Agent Workflow Tracker (Shown when a resume is processing or recently processed) */}
      {(activeStatus || candidates.length > 0) && (
        <AgentVisualizer status={activeStatus || (candidates.length > 0 ? candidates[0].status : null)} />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 border border-slate-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users size={80} />
          </div>
          <p className="text-sm font-medium text-slate-500 mb-1">Total Resumes</p>
          <h3 className="text-4xl font-black text-slate-900 tracking-tight">{stats.total_resumes}</h3>
          <p className="text-sm text-emerald-600 mt-2 font-medium flex items-center gap-1">
            <TrendingUp size={14} /> live tracking
          </p>
        </div>
        <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 border border-slate-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:border-indigo-200 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <FileText size={80} />
          </div>
          <p className="text-sm font-medium text-slate-500 mb-1">Successfully Processed</p>
          <h3 className="text-4xl font-black text-slate-900 tracking-tight">{stats.processed}</h3>
          <p className="text-sm text-emerald-600 mt-2 font-medium flex items-center gap-1">
            <TrendingUp size={14} /> NLP Pipeline Active
          </p>
        </div>
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 border border-indigo-500 shadow-[0_8px_30px_rgb(79,70,229,0.3)] text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <BrainCircuit size={80} />
          </div>
          <p className="text-sm font-medium text-indigo-100 mb-1">Semantic Vectors</p>
          <h3 className="text-4xl font-black tracking-tight">{stats.unique_skills}</h3>
          <p className="text-sm text-indigo-200 mt-2 font-medium flex items-center gap-1">
            <CheckCircle size={14} /> MongoDB Atlas Ready
          </p>
        </div>
        {stats.avg_ats_score != null && (
          <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 border border-slate-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:border-blue-200 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Target size={80} />
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">Avg ATS Score</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tight">{stats.avg_ats_score}</h3>
            <p className="text-sm text-blue-600 mt-2 font-medium flex items-center gap-1">
              <TrendingUp size={14} /> AI Quality Index
            </p>
          </div>
        )}
      </div>

      {/* Main Action Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-slate-800">
                Recent Candidates
              </h3>
              <div className="flex items-center gap-4">
                <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700" onClick={fetchData}>Refresh Data</button>
              </div>
            </div>
            
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Loading data from Database...</div>
              ) : candidates.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No resumes uploaded yet. Upload one to see it here!</div>
              ) : candidates.map((candidate) => {
                const authScore = candidate.aiAnalysis?.authenticity_score;
                const isSuspicious = authScore && authScore < 70;
                
                return (
                  <div key={candidate._id || candidate.id} onClick={() => openCandidate(candidate)} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm border border-slate-200">
                        {candidate.candidateName?.substring(0,2).toUpperCase() || 'UN'}
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                          {candidate.candidateName || candidate.filename}
                          {isSuspicious && (
                            <span title="Low Authenticity Score">
                              <ShieldAlert size={14} className="text-rose-500" />
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {candidate.candidateEmail || 'Status: ' + candidate.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`text-sm font-medium ${candidate.status === 'PROCESSED' ? 'text-emerald-600' : (candidate.status === 'PROCESSING' || candidate.status === 'EXTRACTING' || candidate.status === 'PENDING' || candidate.status === 'SCORING' || candidate.status === 'RANKING' ? 'text-indigo-500 animate-pulse' : 'text-amber-500')}`}>
                          {candidate.status}
                        </p>
                        {candidate.atsScores?.overall_score != null && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              candidate.atsScores.overall_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                              candidate.atsScores.overall_score >= 60 ? 'bg-blue-100 text-blue-700' :
                              candidate.atsScores.overall_score >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                              ATS {candidate.atsScores.overall_score}
                            </span>
                            {candidate.candidateRanking?.grade && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
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
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Delete Candidate"
                      >
                        <Trash2 size={16} />
                      </button>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
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
            className={`bg-white rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ease-in-out cursor-pointer shadow-sm ${
              isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Ingest Resumes</h3>
            <p className="text-sm text-slate-500 mb-4">Drag & drop PDF, DOCX, or TXT</p>
            <button 
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 px-6 rounded-xl transition-colors text-sm shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isUploading}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              {isUploading ? "Uploading..." : "Browse Files"}
            </button>
          </div>

          {/* System Alerts */}
          <div className="bg-gradient-to-b from-white to-slate-50 rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <ShieldAlert size={100} />
            </div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="bg-rose-100 text-rose-600 p-2 rounded-lg">
                <ShieldAlert size={20} />
              </div>
              <h3 className="font-bold text-slate-800">Fraud Protection</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4 relative z-10">
              AI actively scanning for keyword stuffing, perfect phrasing, and impossible timeline claims.
            </p>
          </div>
        </div>
      </div>

      {/* Recruiter Intelligence Platform Phase 2A Extensions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2">
          <CopilotPanel />
        </div>
        <div className="space-y-6">
          <SemanticSearchWidget />
          <RecommendedCandidates />
        </div>
      </div>

      {/* Candidate Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/80">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-2xl shadow-inner border border-indigo-200/50">
                  {selectedCandidate.candidateName?.substring(0,2).toUpperCase() || 'UN'}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedCandidate.candidateName || selectedCandidate.filename}</h2>
                  <p className="text-sm text-slate-500 font-medium mt-1">{selectedCandidate.candidateEmail || 'No email provided'} • {selectedCandidate.candidatePhone || 'No phone'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCandidate(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              
              {/* Authenticity Score Panel */}
              {selectedCandidate.aiAnalysis && (
                <div className={`rounded-2xl p-5 border ${
                  selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {selectedCandidate.aiAnalysis.authenticity_score < 70 ? (
                          <ShieldAlert className="text-rose-600" size={20} />
                        ) : (
                          <ShieldCheck className="text-emerald-600" size={20} />
                        )}
                        <h4 className={`font-bold ${selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'text-rose-900' : 'text-emerald-900'}`}>
                          Authenticity Score: {selectedCandidate.aiAnalysis.authenticity_score}/100
                        </h4>
                      </div>
                      <p className={`text-sm ${selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        AI-Generated Probability: {selectedCandidate.aiAnalysis.ai_generated_probability}%
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                        selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
                      }`}>
                        {selectedCandidate.aiAnalysis.authenticity_score < 70 ? 'HIGH RISK' : 'VERIFIED'}
                      </span>
                    </div>
                  </div>
                  
                  {selectedCandidate.aiAnalysis.red_flags && selectedCandidate.aiAnalysis.red_flags.length > 0 && selectedCandidate.aiAnalysis.authenticity_score < 90 && (
                    <div className="mt-4 pt-4 border-t border-rose-200/50">
                      <h5 className="text-xs font-bold text-rose-900 uppercase tracking-wider mb-2">Flagged Concerns</h5>
                      <ul className="list-disc pl-5 space-y-1">
                        {selectedCandidate.aiAnalysis.red_flags.map((flag: string, i: number) => (
                          <li key={i} className="text-sm text-rose-800">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Copilot Summary Box */}
              {selectedCandidate.status === 'PROCESSED' && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-100/50 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Sparkles size={80} />
                  </div>
                  <div className="flex items-center gap-2 mb-3 text-indigo-700 font-bold relative z-10">
                    <Sparkles size={18} /> AI Recruiter Summary
                  </div>
                  {loadingSummary ? (
                    <div className="animate-pulse flex space-x-4 relative z-10">
                      <div className="flex-1 space-y-3 py-1">
                        <div className="h-2 bg-indigo-200 rounded"></div>
                        <div className="h-2 bg-indigo-200 rounded w-5/6"></div>
                        <div className="h-2 bg-indigo-200 rounded w-4/6"></div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-700 leading-relaxed text-sm font-medium relative z-10">{summary}</p>
                  )}
                </div>
              )}

              {/* ATS Score Breakdown Panel */}
              {selectedCandidate.atsScores && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-blue-700 font-bold">
                    <Target size={18} /> ATS Score Breakdown
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl font-black text-slate-900">{selectedCandidate.atsScores.overall_score}/100</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
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
                  <div className="space-y-3">
                    {[
                      { label: 'Skill Completeness', value: selectedCandidate.atsScores.skill_completeness },
                      { label: 'Experience', value: selectedCandidate.atsScores.experience_score },
                      { label: 'Education', value: selectedCandidate.atsScores.education_score },
                      { label: 'Resume Quality', value: selectedCandidate.atsScores.resume_quality },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600 font-medium">{item.label}</span>
                          <span className="text-slate-900 font-bold">{item.value}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-500 ${
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

              {/* Candidate Ranking Panel */}
              {selectedCandidate.candidateRanking && (
                <div className="bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-100/50 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-cyan-700 font-bold">
                    <Award size={18} /> Candidate Ranking
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className={`text-3xl font-black ${
                        ['A+', 'A'].includes(selectedCandidate.candidateRanking.grade) ? 'text-emerald-600' :
                        ['B+', 'B'].includes(selectedCandidate.candidateRanking.grade) ? 'text-blue-600' :
                        ['C+', 'C'].includes(selectedCandidate.candidateRanking.grade) ? 'text-amber-600' :
                        'text-rose-600'
                      }`}>{selectedCandidate.candidateRanking.grade}</div>
                      <div className="text-xs text-slate-500 font-medium mt-1">Grade</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-bold px-2 py-1 rounded-lg ${
                        selectedCandidate.candidateRanking.tier === 'Exceptional' ? 'bg-emerald-100 text-emerald-700' :
                        selectedCandidate.candidateRanking.tier === 'Strong' ? 'bg-blue-100 text-blue-700' :
                        selectedCandidate.candidateRanking.tier === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{selectedCandidate.candidateRanking.tier}</div>
                      <div className="text-xs text-slate-500 font-medium mt-1">Tier</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-bold px-2 py-1 rounded-lg ${
                        selectedCandidate.candidateRanking.hiring_priority === 'Critical' ? 'bg-rose-100 text-rose-700' :
                        selectedCandidate.candidateRanking.hiring_priority === 'High' ? 'bg-emerald-100 text-emerald-700' :
                        selectedCandidate.candidateRanking.hiring_priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{selectedCandidate.candidateRanking.hiring_priority}</div>
                      <div className="text-xs text-slate-500 font-medium mt-1">Priority</div>
                    </div>
                  </div>
                  {selectedCandidate.candidateRanking.recruiter_recommendation && (
                    <div className="bg-white/60 rounded-xl p-4 border border-cyan-100">
                      <p className="text-sm text-slate-700 leading-relaxed italic">
                        "{selectedCandidate.candidateRanking.recruiter_recommendation}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Skills */}
              {selectedCandidate.parsedData?.skills && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-3 text-lg">Extracted Technology Stack</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCandidate.parsedData.skills.map((skill: string, i: number) => (
                      <span key={i} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200/60 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 mb-3 text-lg">Raw Context Reference</h4>
                <div className="bg-slate-900 text-slate-300 p-5 rounded-2xl text-xs font-mono overflow-y-auto max-h-40 leading-relaxed shadow-inner">
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
