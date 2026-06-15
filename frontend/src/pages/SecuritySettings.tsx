import { useState, useEffect } from 'react';
import { Shield, KeyRound, MonitorSmartphone, LogOut, AlertCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

interface Session {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
}

export const SecuritySettings = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const token = useSelector((state: RootState) => state.auth.token);

  const fetchSessions = async () => {
    try {
      const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
      const res = await axios.get(`${API_URL}/auth/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [token]);

  const handleRevoke = async (id: string) => {
    try {
      const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
      await axios.post(`${API_URL}/auth/sessions/${id}/revoke`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(sessions.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to revoke session');
    }
  };

  const handleRevokeAll = async () => {
    try {
      const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
      await axios.post(`${API_URL}/auth/sessions/revoke-all`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSessions();
    } catch (err) {
      alert('Failed to revoke other sessions');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Security & Access</h1>
        <p className="text-slate-500 mt-1">Manage your security preferences, passwords, and active sessions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
              <KeyRound size={20} />
            </div>
            <h3 className="font-bold text-slate-800">Password</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">Update your account password securely.</p>
            <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">Change password &rarr;</Link>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-4">
              <Shield size={20} />
            </div>
            <h3 className="font-bold text-slate-800">Two-Factor Auth</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">Add an extra layer of security to your account.</p>
            <Link to="/mfa-setup" className="text-sm font-medium text-green-600 hover:text-green-500">Manage 2FA &rarr;</Link>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MonitorSmartphone size={20} className="text-slate-400" />
                Active Sessions
              </h3>
              <p className="text-sm text-slate-500 mt-1">These are the devices that have logged into your account. Revoke any that you do not recognize.</p>
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-700 text-sm flex gap-2 border-b border-red-100">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {isLoading ? (
                <div className="p-8 flex justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No active sessions found.</div>
              ) : (
                sessions.map(session => (
                  <div key={session.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                        {session.device}
                      </h4>
                      <p className="text-sm text-slate-500 mt-1">IP: {session.ip}</p>
                      <p className="text-xs text-slate-400 mt-1">Logged in: {new Date(session.createdAt).toLocaleString()}</p>
                    </div>
                    <button 
                      onClick={() => handleRevoke(session.id)}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <LogOut size={16} />
                      Revoke
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button onClick={handleRevokeAll} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Sign out of all other devices
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
