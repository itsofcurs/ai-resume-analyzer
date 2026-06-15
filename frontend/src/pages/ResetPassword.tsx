import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { KeyRound, ArrowRight, AlertCircle, Shield, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';

export const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const getPasswordStrength = () => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };
  const strength = getPasswordStrength();
  const strengthLabels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const strengthColors = ['bg-red-500', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600'];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setError(null);
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { email, otp, newPassword: password });
      navigate('/login?reset=success');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center border border-slate-100">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Invalid Request</h2>
          <p className="text-slate-500 mt-2">Email address is missing from the request.</p>
          <Link to="/forgot-password" className="mt-6 inline-block font-medium text-blue-600">Request a new code</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <KeyRound size={24} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Set New Password</h2>
          <p className="text-slate-500 mb-6">Enter the 6-digit code sent to {email} and your new password.</p>
          
          {error && (
            <div className="p-3 mb-6 bg-red-50 text-red-700 text-sm font-medium rounded-xl flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">6-Digit Code</label>
              <input 
                type="text" 
                required 
                maxLength={6} 
                value={otp} 
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white text-center tracking-[0.5em] font-mono text-xl" 
                placeholder="000000" 
                disabled={isLoading} 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white pr-10" 
                  placeholder="••••••••" 
                  disabled={isLoading} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              
              {password && (
                <div className="mt-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-slate-500">Password strength:</span>
                    <span className={`text-xs font-bold ${strength >= 4 ? 'text-green-600' : 'text-slate-600'}`}>{strengthLabels[strength]}</span>
                  </div>
                  <div className="flex gap-1 h-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div key={level} className={`flex-1 rounded-full ${strength >= level ? strengthColors[strength] : 'bg-slate-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Shield size={12} /> Needs 8+ chars, upper, lower, number, and symbol.
                  </p>
                </div>
              )}
            </div>
            
            <button type="submit" disabled={isLoading || strength < 5 || otp.length !== 6} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 group disabled:opacity-50 mt-4">
              {isLoading ? "Resetting..." : "Reset Password"}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
