import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BrainCircuit, ArrowRight, Shield, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';

export const Register = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
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

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    try {
      const res = await axios.post(`${API_URL}/auth/register`, { 
        email, password, name, organizationName: orgName 
      });
      setMessage({ type: 'success', text: res.data.message });
      setTimeout(() => navigate(`/verify-email?email=${encodeURIComponent(email)}`), 1500);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Registration failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
    window.location.href = `${API_URL}/auth/google`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg mb-4">
            <BrainCircuit size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Create Account</h1>
          <p className="text-slate-500 mt-2">Join TalentAI's Enterprise Platform</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          
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
            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">or register with email</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {message && (
            <div className={`p-4 mb-6 rounded-xl flex gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white" placeholder="John Doe" disabled={isLoading} />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Work Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white" placeholder="john@company.com" disabled={isLoading} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Organization Name</label>
              <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white" placeholder="Acme Corp" disabled={isLoading} />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
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

            <div className="pt-2">
              <label className="flex items-start gap-2">
                <input type="checkbox" required className="mt-1 rounded text-blue-600 focus:ring-blue-500" disabled={isLoading} />
                <span className="text-xs text-slate-600">I accept the Terms of Service, Privacy Policy, and Data Processing Agreement.</span>
              </label>
            </div>
            
            <button type="submit" disabled={isLoading || strength < 5} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 group mt-4 disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? "Creating Account..." : "Create Account"}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
        
        <p className="text-center text-sm text-slate-500 mt-8">
          Already have an account? <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">Sign in instead</Link>
        </p>
      </div>
    </div>
  );
};
