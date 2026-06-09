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
    <div className="p-4 md:p-6 lg:p-8 max-w-[1440px] mx-auto space-y-5 relative animate-fade-in">
      {/* Header */}
      <header className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">AI Hiring Intelligence</h2>
          <p className="text-slate-500 text-sm mt-0.5">Semantic search, fraud detection, and candidate insights.</p>
        </div>
      </header>

      {/* Row 1: KPI Panels (12-col grid) */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 xl:grid-cols-12 gap-5">
        
        {/* Panel 1: AI Processing */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm col-span-1 md:col-span-4 lg:col-span-4 xl:col-span-4 flex flex-col justify-between">
          <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2 uppercase tracking-wider">
            <BrainCircuit size={14} className="text-indigo-600" /> AI Processing
          </h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50 text-blue-600"><Users size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.total_resumes}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Total</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600"><FileText size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.processed}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Processed</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600"><BrainCircuit size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.unique_skills}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Vectors</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-50 text-purple-600"><Target size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.avg_ats_score || 0}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Avg ATS</div>
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2 mt-1">
              <div className="p-1.5 rounded-md bg-amber-50 text-amber-600"><TrendingUp size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.candidatesRequiringUpskilling}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Needs Upskilling</div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Hiring Intelligence */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm col-span-1 md:col-span-4 lg:col-span-4 xl:col-span-4 flex flex-col justify-between">
          <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2 uppercase tracking-wider">
            <Award size={14} className="text-emerald-600" /> Hiring Intelligence
          </h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-3 h-full content-start">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600"><CheckCircle size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.strongHireCandidates}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Strong Hires</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-blue-50 text-blue-600"><TrendingUp size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.highPotentialCandidates}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">High Potential</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-50 text-purple-600"><Users size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.leadershipCandidates}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Leadership</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-teal-50 text-teal-600"><Target size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.candidatesInterviewReady}</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Ready</div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 3: Risk & Fraud */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm col-span-1 md:col-span-4 lg:col-span-4 xl:col-span-4 flex flex-col justify-between">
          <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2 uppercase tracking-wider">
            <ShieldAlert size={14} className="text-rose-600" /> Risk & Fraud
          </h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-3 h-full content-start">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-slate-100 text-slate-600"><ShieldCheck size={14} /></div>
              <div>
                <div className="text-sm font-black text-slate-800 leading-none">{stats.averageTrustScore || 0}%</div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Avg Trust</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-rose-50 text-rose-600"><ShieldAlert size={14} /></div>
              <div>
                <div className="text-sm font-black text-rose-600 leading-none">{stats.highRiskCandidates}</div>
                <div className="text-[9px] font-bold text-rose-500 uppercase tracking-wider mt-0.5">High Risk</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-50 text-amber-600"><ShieldAlert size={14} /></div>
              <div>
                <div className="text-sm font-black text-amber-600 leading-none">{stats.mediumRiskCandidates}</div>
                <div className="text-[9px] font-bold text-amber-500 uppercase tracking-wider mt-0.5">Med Risk</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600"><CheckCircle size={14} /></div>
              <div>
                <div className="text-sm font-black text-emerald-600 leading-none">{stats.verifiedCandidates}</div>
                <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mt-0.5">Verified</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Status Strip (only when processing) */}
      <AgentVisualizer status={activeStatus} />

      {/* Row 2: Main Content Area (12-col grid) */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 xl:grid-cols-12 gap-5">
        
        {/* Left: Recent Candidates */}
        <div className="col-span-1 md:col-span-4 lg:col-span-5 xl:col-span-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">
                Recent Candidates
                {candidates.length > 0 && <span className="ml-2 text-slate-400 font-medium">({candidates.length})</span>}
              </h3>
              <button className="text-xs text-indigo-600 font-semibold hover:text-indigo-700 transition-colors" onClick={fetchData}>Refresh</button>
            </div>
            
            <div className="divide-y divide-slate-100 flex-1">
              {loading ? (
                <div className="p-6 text-center text-slate-400 text-xs">Loading data from Database...</div>
              ) : candidates.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">No resumes uploaded yet. Upload one to see it here!</div>
              ) : visibleCandidates.map((candidate) => {
                const authScore = candidate.aiAnalysis?.authenticity_score;
                const isSuspicious = authScore && authScore < 70;
                
                return (
                  <div key={candidate._id || candidate.id} onClick={() => openCandidate(candidate)} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] border border-slate-200/60">
                        {candidate.candidateName?.substring(0,2).toUpperCase() || 'UN'}
                      </div>
                      <div className="truncate">
                        <h4 className="font-bold text-xs text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5 truncate">
                          {candidate.candidateName || candidate.filename}
                          {isSuspicious && (
                            <span title="Low Authenticity Score" className="shrink-0">
                              <ShieldAlert size={12} className="text-rose-500" />
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {candidate.candidateEmail || 'Status: ' + candidate.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <div className="text-right">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${candidate.status === 'PROCESSED' ? 'text-emerald-600' : (candidate.status === 'PROCESSING' || candidate.status === 'EXTRACTING' || candidate.status === 'PENDING' || candidate.status === 'SCORING' || candidate.status === 'RANKING' ? 'text-indigo-500 animate-pulse' : 'text-amber-500')}`}>
                          {candidate.status}
                        </p>
                        {candidate.atsScores?.overall_score != null && (
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              candidate.atsScores.overall_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                              candidate.atsScores.overall_score >= 60 ? 'bg-blue-100 text-blue-700' :
                              candidate.atsScores.overall_score >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                              ATS {candidate.atsScores.overall_score}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDeleteCandidate(candidate._id || candidate.id, e)}
                        className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="Delete Candidate"
                      >
                        <Trash2 size={12} />
                      </button>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show More / Show Less */}
            {hasMoreCandidates && (
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/30 shrink-0">
                <button
                  onClick={() => setShowAllCandidates(!showAllCandidates)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 transition-colors mx-auto"
                >
                  {showAllCandidates ? (
                    <><ChevronUp size={12} /> Show Less</>
                  ) : (
                    <><ChevronDown size={12} /> Show {candidates.length - VISIBLE_COUNT} More Candidates</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Upload + Fraud Protection */}
        <div className="col-span-1 md:col-span-4 lg:col-span-3 xl:col-span-4 space-y-5">
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
            className={`bg-indigo-50/30 rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 cursor-pointer shadow-sm ${
              isDragging ? 'border-indigo-500 bg-indigo-100' : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md">
              <UploadCloud size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-0.5">Ingest Resumes</h3>
            <p className="text-[11px] text-slate-500 mb-3">Drag & drop PDF, DOCX, or TXT</p>
            <button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-5 rounded-lg transition-colors text-xs shadow-sm disabled:opacity-70 disabled:cursor-not-allowed w-full"
              disabled={isUploading}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              {isUploading ? "Uploading..." : "Browse Files"}
            </button>
          </div>

          {/* Fraud Protection */}
          <div className="bg-gradient-to-br from-slate-50 to-rose-50/30 rounded-xl border border-slate-200/80 p-4 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-5">
              <ShieldAlert size={60} />
            </div>
            <div className="flex items-center gap-2 mb-1.5 relative z-10">
              <div className="bg-rose-100 text-rose-600 p-1.5 rounded-md">
                <ShieldAlert size={14} />
              </div>
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Fraud Protection</h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed relative z-10 font-medium">
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
