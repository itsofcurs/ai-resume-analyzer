import React, { useState } from 'react';
import { LifeBuoy, MessageSquare, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export function CustomerSuccess() {
  const [tickets] = useState([
    { id: 'TKT-1042', subject: 'Integration with Workday', status: 'OPEN', priority: 'HIGH', date: '2h ago' },
    { id: 'TKT-1041', subject: 'LLM Timeout on batch upload', status: 'RESOLVED', priority: 'MEDIUM', date: '1d ago' },
    { id: 'TKT-1039', subject: 'How to configure custom prompts', status: 'RESOLVED', priority: 'LOW', date: '3d ago' },
  ]);

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <LifeBuoy className="text-blue-400" /> Support & Customer Success
        </h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          New Ticket
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2">Customer Health Score</h3>
          <div className="text-4xl font-bold text-green-400 mb-1">98/100</div>
          <p className="text-xs text-gray-500">Excellent Platform Adoption</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-gray-400 font-medium mb-2">Open Tickets</h3>
          <div className="text-4xl font-bold text-white mb-1">1</div>
          <p className="text-xs text-blue-400">Average response: 14m</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg md:col-span-2 flex items-center justify-between">
          <div>
            <h3 className="text-gray-400 font-medium mb-2">Dedicated Success Manager</h3>
            <div className="text-xl font-bold text-white">Sarah Jenkins</div>
            <p className="text-sm text-gray-500">sarah.j@talentai.com</p>
          </div>
          <button className="bg-gray-800 hover:bg-gray-700 p-3 rounded-full"><MessageSquare size={20} className="text-blue-400"/></button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">Support Tickets</h2>
        </div>
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase bg-gray-800/50">
            <tr>
              <th className="px-6 py-4">Ticket ID</th>
              <th className="px-6 py-4">Subject</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Priority</th>
              <th className="px-6 py-4">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer">
                <td className="px-6 py-4 font-mono text-white">{t.id}</td>
                <td className="px-6 py-4">{t.subject}</td>
                <td className="px-6 py-4">
                  {t.status === 'OPEN' ? <span className="flex items-center gap-1 text-blue-400"><Clock size={14}/> Open</span> : <span className="flex items-center gap-1 text-green-400"><CheckCircle size={14}/> Resolved</span>}
                </td>
                <td className="px-6 py-4">
                  {t.priority === 'HIGH' ? <span className="text-red-400 flex items-center gap-1"><AlertCircle size={14}/> High</span> : t.priority}
                </td>
                <td className="px-6 py-4">{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
