import { useState } from 'react';
import { Shield, KeyRound, MonitorSmartphone, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

export const SecuritySettings = () => {
  // Mock data for UI demonstration since we don't have the GET /sessions endpoint fully wired in the frontend yet
  const [sessions] = useState([
    { id: '1', device: 'MacBook Pro', browser: 'Chrome', os: 'macOS', ipAddress: '192.168.1.1', lastSeen: 'Active now', isCurrent: true },
    { id: '2', device: 'iPhone 13', browser: 'Safari', os: 'iOS', ipAddress: '10.0.0.5', lastSeen: '2 hours ago', isCurrent: false },
  ]);

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
            <p className="text-sm text-slate-500 mt-1 mb-4">Last changed 3 months ago.</p>
            <Link to="/reset-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">Change password &rarr;</Link>
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
            <div className="divide-y divide-slate-100">
              {sessions.map(session => (
                <div key={session.id} className="p-6 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                      {session.device} - {session.browser}
                      {session.isCurrent && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">Current</span>}
                    </h4>
                    <p className="text-sm text-slate-500 mt-1">{session.os} • {session.ipAddress}</p>
                    <p className="text-xs text-slate-400 mt-1">Last seen: {session.lastSeen}</p>
                  </div>
                  {!session.isCurrent && (
                    <button className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
                      <LogOut size={16} />
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button className="text-sm font-medium text-slate-600 hover:text-slate-900">Sign out of all other devices</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
