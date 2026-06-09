import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { logout } from '../store/authSlice';
import { HeaderSearch } from './SemanticSearchWidget';
import { CopilotPanel } from './CopilotPanel';
import { LayoutDashboard, Users, FileText, BrainCircuit, LogOut, PanelLeftClose, PanelLeftOpen, Network, Menu, Activity } from 'lucide-react';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
};

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/candidates', label: 'Candidates', icon: Users },
  { path: '/jobs', label: 'Job Roles', icon: FileText },
  { path: '/interview-prep', label: 'Interview Prep', icon: BrainCircuit },
  { path: '/adaptive-interview', label: 'Adaptive Interview', icon: BrainCircuit },
  { path: '/agents-pipeline', label: 'AI Pipeline', icon: Network },
  { path: '/analytics', label: 'Intelligence', icon: Activity },
];

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  const isActive = (path: string) => location.pathname === path;

  const pageTitle = NAV_ITEMS.find(i => i.path === location.pathname)?.label || 'Dashboard';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-slate-200/80 flex-col shadow-sm z-50 shrink-0 fixed md:relative md:flex inset-y-0 left-0 transform ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          width: collapsed ? 72 : 256,
          transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 h-16 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
            <BrainCircuit className="text-white" size={20} />
          </div>
          {!collapsed && (
            <span className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-600 whitespace-nowrap overflow-hidden">
              TalentAI
            </span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 group ${
                isActive(path)
                  ? 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-500/5'
                  : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={19} className="shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{label}</span>}
            </Link>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="px-3 py-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={19} className="shrink-0" /> : <PanelLeftClose size={19} className="shrink-0" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>

        {/* Sign out */}
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => dispatch(logout())}
            title={collapsed ? 'Sign Out' : undefined}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-sm font-medium"
          >
            <LogOut size={19} className="shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="h-16 bg-white/80 backdrop-blur-lg border-b border-slate-200/60 flex items-center justify-between px-4 md:px-6 shrink-0 z-20">
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              className="md:hidden p-2 -ml-2 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">{pageTitle}</h2>
          </div>

          {/* Semantic Search — wired */}
          <div className="flex-1 max-w-lg mx-2 md:mx-8">
            <HeaderSearch />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              R
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-slate-50 relative">
          <div className="absolute top-0 w-full h-48 bg-gradient-to-b from-blue-50/50 to-transparent -z-10 pointer-events-none"></div>
          {children}
        </main>
      </div>

      {/* Global Floating Copilot */}
      <CopilotPanel />
    </div>
  );
};
