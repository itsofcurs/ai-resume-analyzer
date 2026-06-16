import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Key, Monitor, Clock, FileText } from 'lucide-react';

interface SecurityEvent {
  id: string;
  action: string;
  resource: string;
  severity: string;
  riskScore: string;
  timestamp: string;
  user: {
    name: string;
    email: string;
  };
}

const SecurityCenter: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [kpis, setKpis] = useState({ activeSessions: 0, mfaAdoption: 0, mfaUsers: 0, totalUsers: 0 });

  useEffect(() => {
    fetchKpis();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [filterSeverity, filterRisk]);

  const fetchKpis = async () => {
    try {
      setKpiLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/security/kpis', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setKpis(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setKpiLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const url = new URL('/api/security/events', window.location.origin);
      if (filterSeverity !== 'ALL') url.searchParams.append('severity', filterSeverity);
      if (filterRisk !== 'ALL') url.searchParams.append('riskScore', filterRisk);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch events');

      const data = await res.json();
      setEvents(data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'WARNING': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getRiskScoreColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'text-red-400';
      case 'MEDIUM': return 'text-yellow-400';
      default: return 'text-green-400';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-500" />
            Security Center
          </h1>
          <p className="text-gray-400 mt-2">Monitor authentication events, active sessions, and enterprise security posture.</p>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-700 transition flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Export GDPR Logs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Threat Level</h3>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-white">Low</div>
          <p className="text-xs text-gray-500 mt-1">Normal baseline activity</p>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Failed Logins (24h)</h3>
            <Key className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-white">
            {events.filter(e => e.action === 'LOGIN_FAILED' || e.action === 'LOGIN_LOCKED').length}
          </div>
          <p className="text-xs text-gray-500 mt-1">Below threshold</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Active Sessions</h3>
            <Monitor className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-white">{kpiLoading ? '--' : kpis.activeSessions}</div>
          <p className="text-xs text-gray-500 mt-1">Across all users</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">MFA Adoption</h3>
            <Shield className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-white">{kpiLoading ? '--' : kpis.mfaAdoption}%</div>
          <p className="text-xs text-gray-500 mt-1">{kpis.mfaUsers} / {kpis.totalUsers} Enterprise-wide</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Audit Log
          </h2>
          <div className="flex gap-4">
            <div className="flex gap-2">
              <span className="text-xs text-gray-500 flex items-center">Severity:</span>
              {['ALL', 'INFO', 'WARNING', 'HIGH', 'CRITICAL'].map(level => (
                <button
                  key={level}
                  onClick={() => setFilterSeverity(level)}
                  className={`px-3 py-1 text-xs rounded-full border ${filterSeverity === level ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-transparent text-gray-400 border-slate-700 hover:bg-slate-800'}`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="flex gap-2 border-l border-slate-700 pl-4">
              <span className="text-xs text-gray-500 flex items-center">Risk:</span>
              {['ALL', 'LOW', 'MEDIUM', 'HIGH'].map(level => (
                <button
                  key={level}
                  onClick={() => setFilterRisk(level)}
                  className={`px-3 py-1 text-xs rounded-full border ${filterRisk === level ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-transparent text-gray-400 border-slate-700 hover:bg-slate-800'}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-slate-900/50">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Severity</th>
                <th className="px-6 py-4 font-medium">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Loading security events...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No security events found.
                  </td>
                </tr>
              ) : (
                events.map(event => (
                  <tr key={event.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{event.user?.name || 'System'}</div>
                      <div className="text-xs text-gray-500">{event.user?.email || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs bg-slate-800 px-2 py-1 rounded text-gray-300">
                        {event.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getSeverityColor(event.severity)}`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${getRiskScoreColor(event.riskScore)}`}>
                        {event.riskScore}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SecurityCenter;
