import React from 'react';
import { BookOpen, Search, FileText, Video, ChevronRight } from 'lucide-react';

export function KnowledgeBase() {
  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold text-white flex justify-center items-center gap-3">
          <BookOpen className="text-indigo-400" size={36}/> TalentAI Help Center
        </h1>
        <p className="text-gray-400 text-lg">Search our knowledge base, tutorials, and runbooks.</p>
        
        <div className="relative max-w-2xl mx-auto mt-6">
          <Search className="absolute left-4 top-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search for articles, e.g., 'How to configure ATS integration'" 
            className="w-full bg-gray-900 border border-gray-700 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-indigo-500 shadow-lg text-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group">
          <FileText className="text-indigo-400 mb-4" size={32} />
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400">Getting Started</h3>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Account Setup Wizard</li>
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Inviting Team Members</li>
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Connecting your ATS</li>
          </ul>
        </div>
        
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group">
          <Video className="text-pink-400 mb-4" size={32} />
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-pink-400">Video Tutorials</h3>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> AI Candidate Sourcing</li>
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Understanding AI Bias Metrics</li>
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Generating Interview Scripts</li>
          </ul>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group">
          <BookOpen className="text-emerald-400 mb-4" size={32} />
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400">API Documentation</h3>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Authentication Guide</li>
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> REST Endpoints Reference</li>
            <li className="hover:text-white flex items-center gap-1"><ChevronRight size={14}/> Webhooks Configuration</li>
          </ul>
        </div>
      </div>
      
      <div className="mt-12 bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-8 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Can't find what you're looking for?</h2>
        <p className="text-indigo-200 mb-6">Our enterprise support team is available 24/7 to assist you.</p>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-8 rounded-lg transition-colors">
          Contact Support
        </button>
      </div>
    </div>
  );
}
