import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login } from '../store/authSlice';
import { BrainCircuit, ArrowRight } from 'lucide-react';
import axios from 'axios';
import type { RootState } from '../store';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { email, password });
      dispatch(login({ token: response.data.token, role: response.data.role }));
      navigate('/');
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Auto-register for demo purposes
        try {
          const defaultName = email.split('@')[0];
          await axios.post('http://localhost:5000/api/auth/register', { 
            email, 
            password, 
            name: defaultName,
            organizationName: `${defaultName} Org`
          });
          const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
          dispatch(login({ token: res.data.token, role: res.data.role }));
          navigate('/');
        } catch {
          alert("Login/Registration failed");
        }
      } else {
        alert("Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg mb-4">
            <BrainCircuit size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">TalentAI</h1>
          <p className="text-slate-500 mt-2">Intelligent Recruitment Copilot</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Sign in to your account</h2>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white"
                placeholder="you@company.com"
                disabled={isLoading}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button type="button" onClick={() => alert("Password recovery not configured in demo mode.")} className="text-sm font-medium text-blue-600 hover:text-blue-500">Forgot password?</button>
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white"
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
            
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 group mt-2 disabled:opacity-70"
            >
              {isLoading ? "Signing in..." : "Sign In"}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
        
        <p className="text-center text-sm text-slate-500 mt-8">
          Don't have an account? <button type="button" onClick={() => alert("Registration is handled automatically upon first login.")} className="font-medium text-blue-600 hover:text-blue-500">Request access</button>
        </p>
      </div>
    </div>
  );
};
