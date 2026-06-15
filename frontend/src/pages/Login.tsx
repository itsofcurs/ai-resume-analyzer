import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../store/authSlice';
import { BrainCircuit, ArrowRight, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import type { RootState } from '../store';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [tempUserId, setTempUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = () => {
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    window.location.href = `${API_URL}/auth/google`;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    
    try {
      if (mfaRequired) {
        const res = await axios.post(`${API_URL}/auth/verify-mfa-login`, { 
          userId: tempUserId, token: mfaToken,
          device: navigator.userAgent,
          browser: 'Web',
          os: navigator.platform
        });
        dispatch(login({ token: res.data.accessToken, role: res.data.user.role }));
        navigate('/');
      } else {
        const res = await axios.post(`${API_URL}/auth/login`, { 
          email, password,
          device: navigator.userAgent,
          browser: 'Web',
          os: navigator.platform
        });
        
        if (res.data.mfaRequired) {
          setMfaRequired(true);
          setTempUserId(res.data.userId);
        } else {
          dispatch(login({ token: res.data.accessToken, role: res.data.user.role }));
          navigate('/');
        }
      }
    } catch (err: any) {
      if (err.response?.data?.unverified) {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        setError(err.response?.data?.error || "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg mb-4">
            <BrainCircuit size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome Back</h1>
          <p className="text-slate-500 mt-2">Sign in to TalentAI Enterprise</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          {!mfaRequired ? (
            <>
              <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-3 mb-6"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              <div className="relative flex py-2 items-center mb-6">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">or sign in with email</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>
            </>
          ) : (
            <div className="text-center mb-6">
              <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                <KeyRound size={24} />
              </div>
              <h3 className="font-bold text-slate-800">Two-Factor Authentication</h3>
              <p className="text-sm text-slate-500">Enter the code from your authenticator app.</p>
            </div>
          )}

          {error && (
            <div className="p-4 mb-6 rounded-xl flex gap-3 bg-red-50 text-red-700">
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {!mfaRequired ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white" placeholder="you@company.com" disabled={isLoading} />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700">Password</label>
                    <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">Forgot password?</Link>
                  </div>
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
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">6-Digit Auth Code</label>
                <input type="text" required maxLength={6} value={mfaToken} onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white text-center tracking-widest font-mono text-xl" placeholder="000000" disabled={isLoading} />
              </div>
            )}
            
            <button type="submit" disabled={isLoading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 group mt-2 disabled:opacity-70">
              {isLoading ? "Authenticating..." : mfaRequired ? "Verify Code" : "Sign In"}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
        
        {!mfaRequired && (
          <p className="text-center text-sm text-slate-500 mt-8">
            Don't have an account? <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">Register your org</Link>
          </p>
        )}
      </div>
    </div>
  );
};
