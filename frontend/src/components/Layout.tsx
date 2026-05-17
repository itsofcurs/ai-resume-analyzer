import type { ReactNode } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import { LayoutDashboard, Users, FileText, BrainCircuit, LogOut } from 'lucide-react';
import { logout } from '../store/authSlice';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
};

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const dispatch = useDispatch();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 animate-fade-in">
        <div className="p-6">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center gap-2">
            <BrainCircuit className="text-blue-600" />
            TalentAI
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <Link 
            to="/" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
              isActive('/') 
                ? 'bg-blue-50 text-blue-600 shadow-sm shadow-blue-500/5' 
                : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </Link>
          <Link 
            to="/candidates" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
              isActive('/candidates') 
                ? 'bg-blue-50 text-blue-600 shadow-sm shadow-blue-500/5' 
                : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
            }`}
          >
            <Users size={18} />
            Candidates
          </Link>
          <Link 
            to="/jobs" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
              isActive('/jobs') 
                ? 'bg-blue-50 text-blue-600 shadow-sm shadow-blue-500/5' 
                : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
            }`}
          >
            <FileText size={18} />
            Job Roles
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-200">
          <button 
            onClick={() => dispatch(logout())}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50 relative">
        <div className="absolute top-0 w-full h-64 bg-gradient-to-b from-blue-50 to-slate-50 -z-10"></div>
        {children}
      </main>
    </div>
  );
};
