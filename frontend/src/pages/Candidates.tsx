import { useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { useSelector } from 'react-redux';
import { FileText, ShieldAlert, ShieldCheck, Search, ChevronRight, X, Trash2, ExternalLink, Filter, Sparkles, BrainCircuit, Target, Award, TrendingUp } from 'lucide-react';
import { io } from 'socket.io-client';
import axios from 'axios';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const Candidates = () => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [authenticityFilter, setAuthenticityFilter] = useState('ALL');

  // AI Summary State for Detail Modal
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);



  const token = useSelector((state: RootState) => state.auth.token);

  const fetchCandidates = async () => {
    try {
      const res = await axios.get(`${API_URL}/resumes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCandidates(res.data);
    } catch (error) {
      console.error("Failed to fetch candidates", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const socket = io(socketUrl);

    return () => { socket.disconnect(); };
  }, [token]);

  const handleDelete = async (id: string, e: MouseEvent) => {
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
    } catch (error) {
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
      } catch (err) {
        setSummary("Failed to generate AI Summary.");
      } finally {
        setLoadingSummary(false);
      }
    }
  };


  // Filter Logic
  const filteredCandidates = candidates.filter(c => {
    const nameMatch = c.candidateName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                      c.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      c.candidateEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const skillsMatch = c.parsedData?.skills?.some((s: string) => s.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSearch = nameMatch || skillsMatch;

    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

    let matchesAuthenticity = true;
    if (authenticityFilter !== 'ALL') {
      const score = c.aiAnalysis?.authenticity_score;
      if (authenticityFilter === 'HIGH') matchesAuthenticity = score >= 85;
      else if (authenticityFilter === 'MEDIUM') matchesAuthenticity = score >= 70 && score < 85;
      else if (authenticityFilter === 'LOW') matchesAuthenticity = score < 70;
    }

    return matchesSearch && matchesStatus && matchesAuthenticity;
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 relative">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Candidate Database</h2>
          <p className="text-slate-500 mt-1">Review all uploaded profiles, AI scores, and credential authenticity reports.</p>
        </div>
      </header>

      {/* Filter Toolbar */}
      <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-100 flex flex-col md:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-all"
            placeholder="Search candidates by name, email, or skill tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-[160px] py-3 px-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="PROCESSED">Processed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        {/* Authenticity Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={authenticityFilter}
            onChange={(e) => setAuthenticityFilter(e.target.value)}
            className="w-full md:w-[180px] py-3 px-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Authenticity levels</option>
            <option value="HIGH">High Authenticity (85+)</option>
            <option value="MEDIUM">Medium Authenticity (70-84)</option>
            <option value="LOW">Flagged / Low (&lt;70)</option>
          </select>
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <FileText size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No candidates found</h3>
          <p className="text-slate-500 mt-1">Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCandidates.map((candidate) => {
            const authScore = candidate.aiAnalysis?.authenticity_score;
            const isSuspicious = authScore !== undefined && authScore < 70;
            const hasScore = authScore !== undefined;

            return (
              <div
                key={candidate._id || candidate.id}
                onClick={() => openCandidate(candidate)}
                className="bg-white rounded-3xl border border-slate-100 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgb(0,0,0,0.06)] hover:border-slate-200 transition-all duration-300 cursor-pointer group flex flex-col justify-between space-y-6 relative overflow-hidden"
              >
                {/* Highlight line */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${isSuspicious ? 'bg-rose-500' : 'bg-blue-600'}`}></div>

                <div>
                  <div className="flex justify-between items-start">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-700 flex items-center justify-center font-extrabold border border-slate-100 shadow-sm text-base">
                      {candidate.candidateName?.substring(0, 2).toUpperCase() || 'UN'}
                    </div>
                    
                    {/* Status Badge */}
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      candidate.status === 'PROCESSED' ? 'bg-emerald-50 text-emerald-700' :
                      candidate.status === 'FAILED' ? 'bg-rose-50 text-rose-700' :
                      'bg-indigo-50 text-indigo-700 animate-pulse'
                    }`}>
                      {candidate.status}
                    </span>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                      {candidate.candidateName || candidate.filename}
                      {isSuspicious && (
                        <span title="Low Authenticity Score">
                          <ShieldAlert size={16} className="text-rose-500" />
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">{candidate.candidateEmail || 'No email parsed'}</p>
                  </div>

                  {/* Skills tags preview */}
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {candidate.parsedData?.skills?.slice(0, 4).map((skill: string) => (
                      <span key={skill} className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs rounded-lg border border-slate-100 capitalize">
                        {skill}
                      </span>
                    )) || <span className="text-xs text-slate-400 italic">No skills parsed yet</span>}
                    {candidate.parsedData?.skills?.length > 4 && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-lg font-medium">
                        +{candidate.parsedData.skills.length - 4} more
                      </span>
                    )}
                  </div>

                  {/* ATS Score + Grade Badges */}
                  {candidate.atsScores?.overall_score != null && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        candidate.atsScores.overall_score >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        candidate.atsScores.overall_score >= 60 ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        candidate.atsScores.overall_score >= 40 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        <Target size={12} /> ATS {candidate.atsScores.overall_score}
                      </span>
                      {candidate.candidateRanking?.grade && (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                          ['A+', 'A'].includes(candidate.candidateRanking.grade) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          ['B+', 'B'].includes(candidate.candidateRanking.grade) ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          ['C+', 'C'].includes(candidate.candidateRanking.grade) ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          <Award size={12} /> Grade {candidate.candidateRanking.grade}
                        </span>
                      )}
                      {candidate.candidateRanking?.hiring_priority && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold ${
                          candidate.candidateRanking.hiring_priority === 'Critical' ? 'bg-rose-50 text-rose-700' :
                          candidate.candidateRanking.hiring_priority === 'High' ? 'bg-emerald-50 text-emerald-700' :
                          candidate.candidateRanking.hiring_priority === 'Medium' ? 'bg-blue-50 text-blue-700' :
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {candidate.candidateRanking.hiring_priority}
                        </span>
                      )}
                    </div>
                  )}

                </div>

                <div className="flex justify-between items-center border-t border-slate-50 pt-4">
                  {/* Authenticity Score Indicator */}
                  {hasScore ? (
                    <div className="flex items-center gap-1.5">
                      {isSuspicious ? (
                        <ShieldAlert size={16} className="text-rose-500" />
                      ) : (
                        <ShieldCheck size={16} className="text-emerald-500" />
                      )}
                      <span className={`text-sm font-bold ${isSuspicious ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {authScore}% Authenticity
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Authenticity pending</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDelete(candidate._id || candidate.id, e)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      title="Delete Candidate"
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Candidate Profile Details Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-none sm:rounded-3xl max-w-4xl w-full h-full sm:h-auto max-h-[100dvh] sm:max-h-[85vh] overflow-y-auto shadow-2xl border-0 sm:border border-slate-100 flex flex-col relative animate-scale-in">
            
            {/* Header Area */}
            <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-100 p-4 sm:p-6 flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shadow-blue-500/10">
                  {selectedCandidate.candidateName?.substring(0, 2).toUpperCase() || 'UN'}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedCandidate.candidateName || selectedCandidate.filename}</h3>
                  <p className="text-slate-500 flex items-center gap-3 text-sm mt-1">
                    <span>{selectedCandidate.candidateEmail}</span>
                    {selectedCandidate.candidatePhone && (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        <span>{selectedCandidate.candidatePhone}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>




            {/* Body */}
            <div className="p-4 sm:p-8 space-y-8 flex-1">

              {/* Cloudinary Resume View Button */}
              {selectedCandidate.cloudinaryUrl && (
                <div className="flex justify-between items-center bg-blue-50/50 border border-blue-100/50 p-4 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <FileText className="text-blue-600" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Original Resume Document</h4>
                      <p className="text-xs text-slate-500">Securely hosted on Cloudinary</p>
                    </div>
                  </div>
                  <a
                    href={selectedCandidate.cloudinaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-xl text-sm transition-colors"
                  >
                    <span>Open Resume</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {/* Status specific view */}
              {selectedCandidate.status !== 'PROCESSED' ? (
                <div className="text-center py-10 space-y-3">
                  <div className="animate-pulse flex flex-col items-center justify-center space-y-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 flex items-center justify-center rounded-2xl border border-indigo-100">
                      <BrainCircuit size={24} className="animate-spin" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-800">Candidate Pipeline active</h4>
                      <p className="text-slate-500 text-sm mt-1">This candidate's status is currently: {selectedCandidate.status}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* ATS Score Breakdown */}
                  {selectedCandidate.atsScores && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100/50 shadow-sm mb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <Target size={18} className="text-blue-600" />
                        <h4 className="font-bold text-slate-800 text-base">ATS Score Breakdown</h4>
                        <span className={`ml-auto px-3 py-1 rounded-full text-sm font-bold ${
                          selectedCandidate.atsScores.overall_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                          selectedCandidate.atsScores.overall_score >= 60 ? 'bg-blue-100 text-blue-700' :
                          selectedCandidate.atsScores.overall_score >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {selectedCandidate.atsScores.overall_score}/100
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
                            <div className="w-full bg-white/60 rounded-full h-2.5">
                              <div className={`h-2.5 rounded-full transition-all duration-500 ${
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
                    <div className="bg-gradient-to-br from-cyan-50 to-teal-50 rounded-2xl p-6 border border-cyan-100/50 shadow-sm mb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <Award size={18} className="text-cyan-600" />
                        <h4 className="font-bold text-slate-800 text-base">Candidate Ranking</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="bg-white/60 rounded-xl p-3 text-center border border-cyan-100/50">
                          <div className={`text-3xl font-black ${
                            ['A+', 'A'].includes(selectedCandidate.candidateRanking.grade) ? 'text-emerald-600' :
                            ['B+', 'B'].includes(selectedCandidate.candidateRanking.grade) ? 'text-blue-600' :
                            ['C+', 'C'].includes(selectedCandidate.candidateRanking.grade) ? 'text-amber-600' :
                            'text-rose-600'
                          }`}>{selectedCandidate.candidateRanking.grade}</div>
                          <div className="text-xs text-slate-500 font-medium mt-1">Grade</div>
                        </div>
                        <div className="bg-white/60 rounded-xl p-3 text-center border border-cyan-100/50">
                          <div className={`text-sm font-bold px-2 py-1 rounded-lg mx-auto inline-block ${
                            selectedCandidate.candidateRanking.tier === 'Exceptional' ? 'bg-emerald-100 text-emerald-700' :
                            selectedCandidate.candidateRanking.tier === 'Strong' ? 'bg-blue-100 text-blue-700' :
                            selectedCandidate.candidateRanking.tier === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>{selectedCandidate.candidateRanking.tier}</div>
                          <div className="text-xs text-slate-500 font-medium mt-1">Tier</div>
                        </div>
                        <div className="bg-white/60 rounded-xl p-3 text-center border border-cyan-100/50">
                          <div className={`text-sm font-bold px-2 py-1 rounded-lg mx-auto inline-block ${
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

                  {/* Grid section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Left: AI Summarization & Skills */}
                    <div className="space-y-6">
                      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative">
                        <div className="absolute top-4 right-4 text-indigo-600 animate-pulse">
                          <Sparkles size={18} />
                        </div>
                        <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                          <BrainCircuit size={18} className="text-indigo-600" />
                          AI Recruiter Copilot Summary
                        </h4>
                        
                        {loadingSummary ? (
                          <div className="mt-4 space-y-2">
                            <div className="h-4 bg-slate-200 rounded animate-pulse w-full"></div>
                            <div className="h-4 bg-slate-200 rounded animate-pulse w-[90%]"></div>
                            <div className="h-4 bg-slate-200 rounded animate-pulse w-[75%]"></div>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-600 leading-relaxed mt-3">{summary}</p>
                        )}
                      </div>

                      {/* Skills parsed list */}
                      <div className="space-y-3">
                        <h4 className="font-bold text-slate-800 text-sm">Extracted Capabilities</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedCandidate.parsedData?.skills?.map((skill: string) => (
                            <span key={skill} className="px-3 py-1.5 bg-blue-50/50 text-blue-700 font-medium text-xs rounded-xl border border-blue-100/20 capitalize">
                              {skill}
                            </span>
                          )) || <p className="text-xs text-slate-500 italic">No skills extracted</p>}
                        </div>
                      </div>
                    </div>

                    {/* Right: Authenticity & Trust Report */}
                    <div className="space-y-6">
                      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-6">
                        <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                          <ShieldCheck size={18} className="text-emerald-600" />
                          Authenticity & Trust Profile
                        </h4>

                        {/* Ring score breakdown */}
                        <div className="flex items-center gap-6">
                          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-white border border-slate-100 shadow-sm shrink-0">
                            <span className={`text-2xl font-black ${
                              (selectedCandidate.aiAnalysis?.authenticity_score || 0) >= 85 ? 'text-emerald-600' :
                              (selectedCandidate.aiAnalysis?.authenticity_score || 0) >= 70 ? 'text-amber-500' :
                              'text-rose-600'
                            }`}>
                              {selectedCandidate.aiAnalysis?.authenticity_score || 0}%
                            </span>
                          </div>
                          <div>
                            <h5 className="font-bold text-slate-800 text-sm">Resume Authenticity Score</h5>
                            <p className="text-slate-500 text-xs mt-1">
                              Based on timeline analysis, candidate statement cross-referencing, and potential keyword stuffing.
                            </p>
                          </div>
                        </div>

                        {/* Specific metrics */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200/60 pt-4">
                          <div>
                            <span className="text-xs text-slate-400">AI Generated Likelihood</span>
                            <p className="text-base font-bold text-slate-800 mt-0.5">
                              {selectedCandidate.aiAnalysis?.ai_generated_probability || 0}%
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-400">Technical Depth Rating</span>
                            <p className="text-base font-bold text-slate-800 mt-0.5">
                              {selectedCandidate.aiAnalysis?.technical_depth_score || 0}/100
                            </p>
                          </div>
                        </div>

                        {/* Red flags */}
                        <div className="border-t border-slate-200/60 pt-4 space-y-2">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Flags & Alerts</span>
                          {selectedCandidate.aiAnalysis?.red_flags?.length > 0 ? (
                            <ul className="space-y-1.5">
                              {selectedCandidate.aiAnalysis.red_flags.map((flag: string, idx: number) => (
                                <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                                  <span>{flag}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                              <ShieldCheck size={14} />
                              No major compliance red flags detected!
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Phase 2C-B: Fraud Risk & Consistency Analysis */}
                      {selectedCandidate.fraudAnalysis && (
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                              <ShieldAlert size={18} className={
                                selectedCandidate.fraudAnalysis.fraudRisk === 'HIGH' ? 'text-rose-600' :
                                selectedCandidate.fraudAnalysis.fraudRisk === 'MEDIUM' ? 'text-amber-500' :
                                'text-emerald-600'
                              } />
                              Fraud & Consistency Analysis
                            </h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                selectedCandidate.fraudAnalysis.fraudRisk === 'HIGH' ? 'bg-rose-100 text-rose-700' :
                                selectedCandidate.fraudAnalysis.fraudRisk === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                                'bg-emerald-100 text-emerald-700'
                            }`}>
                              {selectedCandidate.fraudAnalysis.fraudRisk} RISK
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Trust Score</div>
                              <div className={`text-xl font-black mt-1 ${
                                selectedCandidate.fraudAnalysis.trustScore >= 80 ? 'text-emerald-600' :
                                selectedCandidate.fraudAnalysis.trustScore >= 50 ? 'text-amber-600' :
                                'text-rose-600'
                              }`}>{selectedCandidate.fraudAnalysis.trustScore}/100</div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Consistency</div>
                              <div className={`text-xl font-black mt-1 ${
                                selectedCandidate.fraudAnalysis.consistencyScore >= 80 ? 'text-emerald-600' :
                                selectedCandidate.fraudAnalysis.consistencyScore >= 50 ? 'text-amber-600' :
                                'text-rose-600'
                              }`}>{selectedCandidate.fraudAnalysis.consistencyScore}/100</div>
                            </div>
                          </div>
                          
                          {selectedCandidate.fraudAnalysis.recruiterAlert && (
                            <div className="mb-4 bg-rose-50 text-rose-700 p-3 rounded-xl text-sm border border-rose-100">
                              <strong>Alert:</strong> {selectedCandidate.fraudAnalysis.recruiterAlert}
                            </div>
                          )}

                          <div className="space-y-4 text-sm">
                            {selectedCandidate.fraudAnalysis.suspiciousClaims?.length > 0 && (
                              <div>
                                <h5 className="font-bold text-slate-700 mb-2">Suspicious Claims</h5>
                                <div className="space-y-2">
                                  {selectedCandidate.fraudAnalysis.suspiciousClaims.map((c: any, i: number) => (
                                    <div key={i} className="bg-rose-50 p-3 rounded-lg border border-rose-100">
                                      <div className="font-medium text-rose-800">Claim: {c.claim}</div>
                                      <div className="text-rose-600 text-xs mt-1">Evidence: {c.evidence} (Conf: {c.confidence}%)</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {selectedCandidate.fraudAnalysis.verifiedClaims?.length > 0 && (
                              <div>
                                <h5 className="font-bold text-slate-700 mb-2">Verified Claims</h5>
                                <div className="space-y-2">
                                  {selectedCandidate.fraudAnalysis.verifiedClaims.map((c: any, i: number) => (
                                    <div key={i} className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                                      <div className="font-medium text-emerald-800">Claim: {c.claim}</div>
                                      <div className="text-emerald-600 text-xs mt-1">Evidence: {c.evidence} (Conf: {c.confidence}%)</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {selectedCandidate.fraudAnalysis.contradictions?.length > 0 && (
                              <div>
                                <h5 className="font-bold text-slate-700 mb-2">Contradictions Found</h5>
                                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                  {selectedCandidate.fraudAnalysis.contradictions.map((c: string, i: number) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            <div className="bg-slate-50 p-3 rounded-lg mt-2 border border-slate-200">
                                <div className="font-bold text-slate-700">Final Assessment</div>
                                <div className="text-slate-600 mt-1">{selectedCandidate.fraudAnalysis.finalAssessment}</div>
                                <div className="mt-2 flex gap-4 text-xs font-medium">
                                    <span className="text-slate-500">Impact: <span className="text-slate-800">{selectedCandidate.fraudAnalysis.hiringImpact}</span></span>
                                    <span className="text-slate-500">Decision: <span className="text-slate-800">{selectedCandidate.fraudAnalysis.recruiterDecision}</span></span>
                                </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Phase 2C-C: Skill Gap Intelligence & Career Development */}
                      {selectedCandidate.skillGapAnalysis && (
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                              <BrainCircuit size={18} className="text-indigo-600" />
                              Career Intelligence Report
                            </h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                selectedCandidate.skillGapAnalysis.hiringReadinessScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                selectedCandidate.skillGapAnalysis.hiringReadinessScore >= 50 ? 'bg-amber-100 text-amber-700' :
                                'bg-rose-100 text-rose-700'
                            }`}>
                              {selectedCandidate.skillGapAnalysis.hiringReadinessScore}% READY
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Hiring Readiness</div>
                              <div className={`text-xl font-black mt-1 ${
                                selectedCandidate.skillGapAnalysis.hiringReadinessScore >= 80 ? 'text-emerald-600' :
                                selectedCandidate.skillGapAnalysis.hiringReadinessScore >= 50 ? 'text-amber-600' :
                                'text-rose-600'
                              }`}>{selectedCandidate.skillGapAnalysis.hiringReadinessScore}/100</div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Growth Potential</div>
                              <div className="text-xl font-black mt-1 text-indigo-600">
                                {selectedCandidate.skillGapAnalysis.growthPotentialScore}/100
                              </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Learning Agility</div>
                              <div className="text-xl font-black mt-1 text-blue-600">
                                {selectedCandidate.skillGapAnalysis.learningAgilityScore}/100
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {selectedCandidate.skillGapAnalysis.strengths?.length > 0 && (
                              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                <h5 className="font-bold text-emerald-800 text-sm mb-2">Core Strengths</h5>
                                <ul className="list-disc pl-4 space-y-1 text-xs text-emerald-700">
                                  {selectedCandidate.skillGapAnalysis.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {selectedCandidate.skillGapAnalysis.weaknesses?.length > 0 && (
                              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                                <h5 className="font-bold text-rose-800 text-sm mb-2">Areas for Improvement</h5>
                                <ul className="list-disc pl-4 space-y-1 text-xs text-rose-700">
                                  {selectedCandidate.skillGapAnalysis.weaknesses.map((w: string, i: number) => <li key={i}>{w}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>

                          {selectedCandidate.skillGapAnalysis.missingSkills?.length > 0 && (
                            <div className="mb-4">
                              <h5 className="font-bold text-slate-700 text-sm mb-2">Missing Skills & Technologies</h5>
                              <div className="flex flex-wrap gap-2">
                                {selectedCandidate.skillGapAnalysis.missingSkills.concat(selectedCandidate.skillGapAnalysis.missingTechnologies || []).map((skill: string, idx: number) => (
                                  <span key={idx} className="px-2 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-4">
                            {selectedCandidate.skillGapAnalysis.thirtyDayPlan?.length > 0 && (
                              <div>
                                <h5 className="font-bold text-slate-700 text-sm mb-1">30-Day Plan</h5>
                                <ul className="list-decimal pl-4 space-y-1 text-xs text-slate-600">
                                  {selectedCandidate.skillGapAnalysis.thirtyDayPlan.map((item: string, i: number) => <li key={i}>{item}</li>)}
                                </ul>
                              </div>
                            )}
                            {selectedCandidate.skillGapAnalysis.recommendedProjects?.length > 0 && (
                              <div>
                                <h5 className="font-bold text-slate-700 text-sm mb-1">Recommended Projects</h5>
                                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600">
                                  {selectedCandidate.skillGapAnalysis.recommendedProjects.map((item: string, i: number) => <li key={i}>{item}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Phase 2C-D: Predictive Hiring & Workforce Intelligence */}
                      {selectedCandidate.predictiveHiring && (
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                              <TrendingUp size={18} className="text-purple-600" />
                              Workforce Intelligence Report
                            </h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                selectedCandidate.predictiveHiring.successScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                selectedCandidate.predictiveHiring.successScore >= 50 ? 'bg-amber-100 text-amber-700' :
                                'bg-rose-100 text-rose-700'
                            }`}>
                              {selectedCandidate.predictiveHiring.successScore}% SUCCESS PROBABILITY
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Retention Risk</div>
                              <div className={`text-lg font-black mt-1 ${
                                selectedCandidate.predictiveHiring.retentionRisk === 'LOW' ? 'text-emerald-600' :
                                selectedCandidate.predictiveHiring.retentionRisk === 'MEDIUM' ? 'text-amber-600' :
                                'text-rose-600'
                              }`}>{selectedCandidate.predictiveHiring.retentionRisk}</div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Leadership</div>
                              <div className={`text-lg font-black mt-1 ${
                                ['HIGH', 'EXCEPTIONAL'].includes(selectedCandidate.predictiveHiring.leadershipPotential) ? 'text-purple-600' :
                                'text-slate-700'
                              }`}>{selectedCandidate.predictiveHiring.leadershipPotential}</div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Team Fit</div>
                              <div className="text-lg font-black mt-1 text-blue-600">
                                {selectedCandidate.predictiveHiring.teamFitScore}/100
                              </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div className="text-xs text-slate-500 font-medium">Onboarding</div>
                              <div className="text-lg font-black mt-1 text-slate-700">
                                {selectedCandidate.predictiveHiring.onboardingDifficulty}
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <h5 className="font-bold text-slate-800 text-sm">Final Hiring Recommendation</h5>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    selectedCandidate.predictiveHiring.hiringDecision === 'Strong Hire' ? 'bg-emerald-100 text-emerald-700' :
                                    selectedCandidate.predictiveHiring.hiringDecision === 'Hire' ? 'bg-blue-100 text-blue-700' :
                                    selectedCandidate.predictiveHiring.hiringDecision === 'Conditional Hire' ? 'bg-amber-100 text-amber-700' :
                                    'bg-rose-100 text-rose-700'
                                }`}>
                                    {selectedCandidate.predictiveHiring.hiringDecision}
                                </span>
                            </div>
                            <p className="text-slate-600 text-sm">{selectedCandidate.predictiveHiring.explanation}</p>
                            <div className="mt-3 text-xs text-slate-500 font-medium">
                                Confidence Score: {selectedCandidate.predictiveHiring.hiringConfidence}/100
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
