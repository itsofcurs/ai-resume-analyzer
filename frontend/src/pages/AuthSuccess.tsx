import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { login } from '../store/authSlice';
import { Loader2 } from 'lucide-react';
import { jwtDecode } from 'jwt-decode';

export const AuthSuccess = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        dispatch(login({ token, role: decoded.role }));
        navigate('/');
      } catch (err) {
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [token, navigate, dispatch]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="flex flex-col items-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-900">Authenticating...</h2>
      </div>
    </div>
  );
};
