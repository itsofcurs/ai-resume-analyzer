import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { BrainCircuit, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';
import { login } from '../store/authSlice';

export const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [message, setMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);
  
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    
    try {
      const res = await axios.post(`${API_URL}/auth/verify-otp`, { 
        email, 
        otp,
        device: navigator.userAgent,
        browser: 'Web',
        os: navigator.platform
      });
      
      dispatch(login({ token: res.data.accessToken, role: res.data.user.role }));
      navigate('/');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Verification failed.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setResendCooldown(60);
    setMessage(null);
    
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    try {
      await axios.post(`${API_URL}/auth/resend-otp`, { email });
      setMessage({ type: 'success', text: 'A new 6-digit code has been sent.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to resend code.' });
      setResendCooldown(0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg mb-4">
            <KeyRound size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Verify Email</h1>
          <p className="text-slate-500 mt-2">Enter the 6-digit code sent to your email.</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          
          {message && (
            <div className={`p-4 mb-6 rounded-xl flex gap-3 ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            {!emailParam && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white" placeholder="you@company.com" disabled={isLoading} />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 text-center">6-Digit Code</label>
              <input 
                type="text" 
                required 
                maxLength={6} 
                value={otp} 
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white text-center tracking-[1em] font-mono text-2xl" 
                placeholder="000000" 
                disabled={isLoading} 
                autoFocus
              />
            </div>
            
            <button type="submit" disabled={isLoading || otp.length !== 6 || !email} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed">
              {isLoading ? "Verifying..." : "Verify & Sign In"}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={handleResend}
              disabled={resendCooldown > 0 || !email}
              className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't receive a code? Resend"}
            </button>
          </div>
        </div>
        
        <p className="text-center text-sm text-slate-500 mt-8">
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">Back to login</Link>
        </p>
      </div>
    </div>
  );
};
