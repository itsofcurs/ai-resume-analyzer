import { useState } from 'react';
import { Search, Loader2, Target } from 'lucide-react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const SemanticSearchWidget = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const token = useSelector((state: RootState) => state.auth.token);

  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const response = await axios.post(`${API_URL}/copilot/search`, { query, top_k: 3 }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResults(response.data.matches || []);
    } catch (error) {
      console.error("Semantic search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 bg-slate-50">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Search size={18} className="text-indigo-600" />
          Semantic Search
        </h3>
        <p className="text-xs text-slate-500 mt-1">Find candidates using natural language (e.g. "Backend engineer with Node")</p>
      </div>
      
      <div className="p-4">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim() === '') {
                setResults([]);
                setHasSearched(false);
              }
            }}
            placeholder="Type your search here..."
            className="w-full bg-slate-100 border-transparent focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 rounded-lg pl-4 pr-10 py-2 text-sm transition-all"
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 disabled:opacity-50"
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </button>
        </form>

        {hasSearched && !isSearching && results.length === 0 && (
          <div className="mt-4 p-4 text-center text-slate-500 text-sm bg-slate-50 rounded-lg border border-slate-100">
            No candidates found matching this query.
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4 space-y-3">
            {results.map((match, idx) => (
              <div key={idx} className="p-3 border border-slate-100 rounded-lg hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-slate-800 text-sm">{match.metadata?.name || 'Unknown Candidate'}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 truncate w-48">{match.metadata?.filename}</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                    <Target size={12} />
                    {(match.score * 100).toFixed(0)}% Match
                  </div>
                </div>
                {match.metadata?.skills && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {match.metadata.skills.slice(0, 3).map((skill: string, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{skill}</span>
                    ))}
                    {match.metadata.skills.length > 3 && (
                      <span className="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded text-[10px]">+{match.metadata.skills.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
