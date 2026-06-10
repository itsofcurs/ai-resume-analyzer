import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { LineChart, BarChart, Calendar, AlertTriangle, TrendingUp, Users, Clock } from 'lucide-react';
import type { RootState } from '../store';

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

export const HiringForecastDashboard = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.post(`${API_URL}/forecast/hiring`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch forecast data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (loading) return <div className="h-48 flex items-center justify-center text-slate-500">Loading Forecasts...</div>;
  if (!data) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <LineChart className="text-indigo-600" />
          Hiring Forecasts (90 Days)
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3">
          <Clock className="text-indigo-500" size={32} />
          <div>
            <div className="text-sm font-medium text-indigo-600 mb-1">Predicted Time To Fill</div>
            <div className="text-3xl font-black text-indigo-900">{data.predictedTimeToFill} days</div>
          </div>
        </div>
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
          <TrendingUp className="text-emerald-500" size={32} />
          <div>
            <div className="text-sm font-medium text-emerald-600 mb-1">Offer Acceptance Forecast</div>
            <div className="text-3xl font-black text-emerald-900">{data.offerAcceptanceForecast}%</div>
          </div>
        </div>
        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
          <Users className="text-blue-500" size={32} />
          <div>
            <div className="text-sm font-medium text-blue-600 mb-1">Funnel Health Forecast</div>
            <div className="text-3xl font-black text-blue-900">{data.funnelHealthForecast}/100</div>
          </div>
        </div>
        <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 flex items-center gap-3">
          <LineChart className="text-purple-500" size={32} />
          <div>
            <div className="text-sm font-medium text-purple-600 mb-1">Hiring Velocity Forecast</div>
            <div className="text-3xl font-black text-purple-900">{data.hiringVelocityForecast} hires/mo</div>
          </div>
        </div>
      </div>
    </div>
  );
};

