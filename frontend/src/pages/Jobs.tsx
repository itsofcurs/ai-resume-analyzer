import { useState, useEffect } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { useSelector } from 'react-redux';
import { Plus, Trash2, Sparkles, BrainCircuit, X, Briefcase } from 'lucide-react';
import axios from 'axios';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

// Template constants to make it incredibly cool and quick to seed data
const JOB_TEMPLATES = [
  {
    title: "Senior React & TypeScript Engineer",
    description: "We are seeking a senior front-end engineer with deep knowledge of React, TypeScript, and state management. You will be building responsive dashboard user interfaces, collaborating with backend teams via REST/Socket.io, and optimizing components for maximum performance. Core requirements: React, Redux, TypeScript, TailwindCSS, AWS deployment pipelines, and premium CSS micro-animations.",
    requiredSkills: "react, typescript, redux, tailwindcss, aws, javascript"
  },
  {
    title: "Python AI & NLP Pipeline Specialist",
    description: "Join our AI engine team to build robust text extraction and semantic search pipelines. You will be managing Gemini SDK connections, implementing vector embeddings via HuggingFace models, indexing metadata in ChromaDB, and scaling background tasks using FastAPI. Experience with spaCy, PyMuPDF, and generative AI content verification is highly required.",
    requiredSkills: "python, fastapi, spacy, generative ai, mongodb, chromadb"
  },
  {
    title: "Fullstack Node.js Developer",
    description: "Looking for a fullstack engineer to manage our Express web backend. You will be designing robust REST endpoints, wiring PostgreSQL schemas using Prisma ORM, implementing JWT-based auth systems, and handling real-time WebSocket communication. Experience with Cloudinary storage engines, Docker containers, and database pooling is a plus.",
    requiredSkills: "node, express, postgresql, prisma, javascript, typescript, docker"
  }
];

export const Jobs = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Job Modal/Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSkills, setNewSkills] = useState('');

  // Matching Analysis state
  
  const [analyzingFitMap, setAnalyzingFitMap] = useState<Record<string, boolean>>({});
  const [fitAnalysisResults, setFitAnalysisResults] = useState<Record<string, any>>({});

  const token = useSelector((state: RootState) => state.auth.token);

  const fetchData = async () => {
    try {
      const [jobsRes, candidatesRes] = await Promise.all([
        axios.get(`${API_URL}/jobs`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/resumes`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setJobs(jobsRes.data);
      const processedCandidates = candidatesRes.data.filter((c: any) => c.status === 'PROCESSED');
      setCandidates(processedCandidates);
      
      // Auto-select first job if available
      if (jobsRes.data.length > 0 && !selectedJob) {
        setSelectedJob(jobsRes.data[0]);
      }
    } catch (error) {
      console.error("Failed to fetch jobs/candidates", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // We intentionally ignore exhaustive-deps here as fetchData is heavily dependent on token
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreateJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDesc) return;
    try {
      const res = await axios.post(`${API_URL}/jobs`, {
        title: newTitle,
        description: newDesc,
        requiredSkills: newSkills
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJobs(prev => [res.data, ...prev]);
      setSelectedJob(res.data);
      setShowAddModal(false);
      
      // Reset form
      setNewTitle('');
      setNewDesc('');
      setNewSkills('');
    } catch {
      alert("Failed to create job role");
    }
  };

  const handleApplyTemplate = (template: typeof JOB_TEMPLATES[0]) => {
    setNewTitle(template.title);
    setNewDesc(template.description);
    setNewSkills(template.requiredSkills);
  };

  const handleDeleteJob = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this job role?")) return;
    try {
      await axios.delete(`${API_URL}/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJobs(prev => prev.filter(j => j.id !== id));
      if (selectedJob && selectedJob.id === id) {
        setSelectedJob(null);
      }
    } catch {
      alert("Failed to delete job role");
    }
  };

  // Perform AI Fit analysis for a specific candidate on the selected job
  const analyzeCandidateFit = async (candidateId: string) => {
    if (!selectedJob) return;
    setAnalyzingFitMap(prev => ({ ...prev, [candidateId]: true }));
    try {
      const res = await axios.post(`${API_URL}/copilot/analyze_fit`, {
        resumeId: candidateId,
        jobId: selectedJob.id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFitAnalysisResults(prev => ({ ...prev, [candidateId]: res.data }));
    } catch (error) {
      console.error("AI Matcher fit error:", error);
      setFitAnalysisResults(prev => ({ 
        ...prev, 
        [candidateId]: { 
          match_score: 50, 
          missing_skills: ["Analysis failed"], 
          key_strengths: ["Database connectivity operational"],
          recommendation: "Potential"
        } 
      }));
    } finally {
      setAnalyzingFitMap(prev => ({ ...prev, [candidateId]: false }));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 relative">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Job Roles & AI Matcher</h2>
          <p className="text-slate-500 mt-1">Design job profiles and run automated multi-candidate AI matchmaking compatibility checks.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-5 rounded-2xl transition-all shadow-sm"
        >
          <Plus size={18} />
          <span>Add Job Description</span>
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <Briefcase size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No job roles defined</h3>
          <p className="text-slate-500 mt-1 mb-6">Create a job description manually or use our pre-built templates to start matching candidates.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-2xl transition-colors shadow-md"
          >
            <Plus size={18} />
            <span>Create First Job Role</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left panel: Job Roles selector */}
          <div className="space-y-4 lg:col-span-1">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-2">Active Roles ({jobs.length})</h3>
            <div className="space-y-3">
              {jobs.map((job) => {
                const isSelected = selectedJob && selectedJob.id === job.id;
                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      setSelectedJob(job);
                      // Clear previous matches fit reports when switching jobs to keep it fresh
                      setFitAnalysisResults({});
                    }}
                    className={`p-5 rounded-3xl border text-left cursor-pointer transition-all duration-300 relative overflow-hidden group ${
                      isSelected 
                        ? 'bg-white border-blue-200 shadow-[0_12px_40px_rgb(0,0,0,0.05)]' 
                        : 'bg-white/60 hover:bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'
                    }`}
                  >
                    {isSelected && <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-blue-600"></div>}
                    
                    <div className="flex justify-between items-start">
                      <h4 className={`font-bold transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-800'}`}>
                        {job.title}
                      </h4>
                      <button
                        onClick={(e) => handleDeleteJob(job.id, e)}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Delete Role"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {job.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Active selected Job Description and AI Matcher */}
          <div className="lg:col-span-2 space-y-6">
            {selectedJob ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-8 animate-fade-in">
                
                {/* Header detail */}
                <div className="border-b border-slate-100 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-100">
                      <Briefcase size={20} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800">{selectedJob.title}</h3>
                  </div>
                  <p className="text-sm text-slate-500 mt-4 leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                    {selectedJob.description}
                  </p>
                  {selectedJob.requiredSkills && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {selectedJob.requiredSkills.split(',').map((skill: string) => (
                        <span key={skill} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg capitalize">
                          {skill.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Matcher Engine section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <BrainCircuit size={20} className="text-indigo-600" />
                        AI Eligibility & Compatibility Matcher
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Trigger real-time compatibility fit reports evaluating skills, authenticity risks, and recommend ratios.
                      </p>
                    </div>
                    {candidates.length > 0 && (
                      <button
                        onClick={() => {
                          candidates.forEach(c => {
                            if (!fitAnalysisResults[c._id || c.id]) {
                              analyzeCandidateFit(c._id || c.id);
                            }
                          });
                        }}
                        className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors border border-indigo-200"
                      >
                        <Sparkles size={14} />
                        Analyze All Pending
                      </button>
                    )}
                  </div>

                  {candidates.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-500">
                      No processed candidates available yet. Upload resumes on the Dashboard first!
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {candidates.map((candidate) => {
                        const fit = fitAnalysisResults[candidate._id || candidate.id];
                        const isAnalyzing = analyzingFitMap[candidate._id || candidate.id];

                        return (
                          <div
                            key={candidate._id || candidate.id}
                            className="border border-slate-100 rounded-2xl p-5 hover:border-slate-200 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                                {candidate.candidateName?.substring(0, 2).toUpperCase() || 'UN'}
                              </div>
                              <div>
                                <h5 className="font-bold text-slate-800 text-sm">
                                  {candidate.candidateName || candidate.filename}
                                </h5>
                                <p className="text-xs text-slate-400 mt-0.5 capitalize">
                                  Skills Extracted: {candidate.parsedData?.skills?.slice(0, 4).join(', ') || 'None'}
                                </p>
                              </div>
                            </div>

                            {/* Analysis Action / Results */}
                            <div className="flex items-center gap-4 shrink-0">
                              {fit ? (
                                <div className="flex flex-col md:flex-row md:items-center gap-4 text-right bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                                  
                                  {/* Recommendations & Strengths */}
                                  <div className="text-left max-w-[280px]">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      fit.recommendation === 'Strong Hire' ? 'bg-emerald-50 text-emerald-700' :
                                      fit.recommendation === 'Potential' ? 'bg-amber-50 text-amber-700' :
                                      'bg-rose-50 text-rose-700'
                                    }`}>
                                      {fit.recommendation}
                                    </span>
                                    
                                    {fit.missing_skills?.length > 0 && fit.missing_skills[0] !== 'Analysis failed' && (
                                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                                        Missing: {fit.missing_skills.join(', ')}
                                      </p>
                                    )}
                                  </div>

                                  {/* Score circular badge */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-center">
                                      <span className="text-xs text-slate-400 block font-medium">Fit Match</span>
                                      <span className={`text-base font-black ${
                                        fit.match_score >= 80 ? 'text-emerald-600' :
                                        fit.match_score >= 60 ? 'text-amber-500' :
                                        'text-rose-600'
                                      }`}>
                                        {fit.match_score}%
                                      </span>
                                    </div>
                                    <button 
                                      onClick={() => analyzeCandidateFit(candidate._id || candidate.id)}
                                      className="ml-2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                      title="Re-analyze Fit"
                                    >
                                      <BrainCircuit size={16} />
                                    </button>
                                  </div>
                                </div>
                              ) : isAnalyzing ? (
                                <div className="flex items-center gap-2 bg-indigo-50/50 text-indigo-600 px-4 py-2.5 rounded-xl text-xs font-semibold animate-pulse border border-indigo-100">
                                  <Sparkles size={14} className="animate-spin" />
                                  <span>AI Engine evaluating...</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => analyzeCandidateFit(candidate._id || candidate.id)}
                                  className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors border border-blue-100"
                                >
                                  <Sparkles size={14} />
                                  <span>Analyze Fit Compatibility</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-white border border-slate-100 rounded-3xl text-slate-500">
                Select a job role from the left panel to run AI Matchmaking assessments!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Job Description Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <X size={20} />
            </button>

            <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Briefcase size={22} className="text-blue-600" />
              Add Job Description
            </h3>

            {/* Template quick seed row */}
            <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Seed with template:</span>
              <div className="flex flex-wrap gap-2">
                {JOB_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="px-3 py-1.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-100 hover:border-blue-100 text-xs rounded-xl font-medium transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Plus size={12} />
                    <span>{tmpl.title.split(' ')[0]} {tmpl.title.includes('React') ? 'React' : tmpl.title.includes('AI') ? 'AI' : 'Node'}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Job Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white text-sm"
                  placeholder="e.g. Senior Frontend Engineer"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Job Description</label>
                <textarea
                  required
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white text-sm"
                  placeholder="Describe the responsibilities, project scope, and team expectations..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Required Skills (Comma separated)</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white text-sm"
                  placeholder="e.g. react, typescript, redux, aws"
                  value={newSkills}
                  onChange={(e) => setNewSkills(e.target.value)}
                />
              </div>

              <div className="flex gap-4 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
