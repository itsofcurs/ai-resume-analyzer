import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    const verify = async () => {
      const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;
      try {
        await axios.post(`${API_URL}/auth/verify-email`, { token });
        setStatus('success');
      } catch (err) {
        setStatus('error');
      }
    };
    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 text-center">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Verifying Email...</h2>
            <p className="text-slate-500 mt-2">Please wait while we confirm your address.</p>
          </div>
        )}
        {status === 'success' && (
          <div className="flex flex-col items-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Email Verified!</h2>
            <p className="text-slate-500 mt-2">Your account is now fully active.</p>
            <Link to="/login" className="mt-6 inline-flex w-full justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm">
              Proceed to Login
            </Link>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center">
            <XCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Verification Failed</h2>
            <p className="text-slate-500 mt-2">The link may be expired or invalid.</p>
            <Link to="/login" className="mt-6 inline-flex w-full justify-center bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm">
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
