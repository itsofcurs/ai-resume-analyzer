import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Target, X, Command } from 'lucide-react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const HeaderSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const token = useSelector((state: RootState) => state.auth.token);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const response = await axios.post(`${API_URL}/copilot/search`, { query: searchQuery, top_k: 5 }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResults(response.data.matches || []);
    } catch (error) {
      console.error("Semantic search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      <form onSubmit={handleSubmit} className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              setResults([]);
              setHasSearched(false);
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search candidates..."
          className="w-full bg-slate-100/80 border border-slate-200/60 rounded-xl pl-10 pr-20 py-2 text-sm text-slate-700 placeholder:text-slate-400 hover:bg-slate-100 hover:border-slate-300 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setHasSearched(false); }}
              className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-200/80 text-slate-500 text-[10px] font-medium rounded border border-slate-300/50">
            <Command size={10} />K
          </kbd>
        </div>
      </form>

      {/* Dropdown results */}
      {isOpen && (query.trim() || hasSearched) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden z-50 animate-slide-down">
          {isSearching && (
            <div className="p-4 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
              Searching candidates...
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="p-4 text-center text-sm text-slate-500">
              No candidates found for "{query}"
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100">
                {results.length} result{results.length > 1 ? 's' : ''} found
              </div>
              {results.map((match, idx) => (
                <div
                  key={idx}
                  className="px-4 py-3 hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-50 last:border-0"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800">{match.metadata?.name || 'Unknown'}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{match.metadata?.filename}</p>
                    </div>
                    <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold shrink-0">
                      <Target size={11} />
                      {(match.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  {match.metadata?.skills && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {match.metadata.skills.slice(0, 4).map((skill: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">{skill}</span>
                      ))}
                      {match.metadata.skills.length > 4 && (
                        <span className="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded text-[10px]">+{match.metadata.skills.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="p-4 text-center text-sm text-slate-400">
              Type a query and press Enter to search
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Keep the old widget export for backward compatibility, but it now just re-exports
export const SemanticSearchWidget = HeaderSearch;
