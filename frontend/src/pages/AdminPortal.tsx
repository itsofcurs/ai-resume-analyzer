import React, { useState, useEffect } from 'react';
import { Shield, Key, Users, Settings, Activity } from 'lucide-react';
import axios from 'axios';

export function AdminPortal() {
  const [activeTab, setActiveTab] = useState('keys');
  const [complianceScore, setComplianceScore] = useState(100);

  useEffect(() => {
    // Mock fetch compliance score
    axios.get('http://localhost:8000/api/reports/compliance')
      .then(res => setComplianceScore(res.data.complianceScore))
      .catch(e => console.error(e));
  }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-white flex items-center gap-3">
        <Shield className="text-purple-400" /> Enterprise Administration
      </h1>

      <div className="flex border-b border-gray-800 mb-6">
        <button onClick={() => setActiveTab('keys')} className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'keys' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-white'}`}>API Keys & Webhooks</button>
        <button onClick={() => setActiveTab('compliance')} className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'compliance' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-white'}`}>Compliance Center</button>
        <button onClick={() => setActiveTab('users')} className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'users' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-white'}`}>User Management</button>
      </div>

      {activeTab === 'keys' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">API Key Management</h2>
                <p className="text-sm text-gray-400">Manage keys for programmatic access to the TalentAI API.</p>
              </div>
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                Generate New Key
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <Key className="text-gray-400" />
                  <div>
                    <div className="text-white font-medium">Production API Key</div>
                    <div className="text-xs text-gray-500">Created on Jun 1, 2026 • Last used 2m ago</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm bg-black px-3 py-1 rounded text-gray-300">sk_live_...9f4a</span>
                  <button className="text-red-400 hover:underline text-sm">Revoke</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center py-10 shadow-lg">
              <div className="text-5xl font-bold text-green-400 mb-2">{complianceScore}%</div>
              <div className="text-gray-400">Security & Compliance Score</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg col-span-2">
              <h3 className="text-white font-bold mb-4">Active Certifications</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <Shield className="text-green-400" size={20} /> <span className="text-sm text-gray-300">SOC2 Type II (Valid)</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <Shield className="text-green-400" size={20} /> <span className="text-sm text-gray-300">GDPR Compliant</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <Shield className="text-green-400" size={20} /> <span className="text-sm text-gray-300">HIPAA Compliant</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <Shield className="text-green-400" size={20} /> <span className="text-sm text-gray-300">ISO 27001</span>
                </div>
              </div>
              <button className="mt-4 text-sm text-purple-400 hover:underline">Download Security Pack</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
