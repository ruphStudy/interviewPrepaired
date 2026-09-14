import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api.config';
import { useAuth } from '../contexts/AuthContext';

type VerifyState = 'verifying' | 'verified' | 'already_verified' | 'expired' | 'invalid' | 'error';

const VerifyEmailPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, refreshUser } = useAuth();
  const [state, setState] = useState<VerifyState>('verifying');

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (!token) {
        setState('invalid');
        return;
      }
      try {
        const response = await axios.get(`${API_BASE_URL}/auth/verify-email/${token}`);
        if (cancelled) return;
        const status = response.data?.data?.status;
        setState(status === 'already_verified' ? 'already_verified' : 'verified');
        if (isAuthenticated) {
          await refreshUser();
        }
      } catch (err: any) {
        if (cancelled) return;
        const code = err.response?.data?.code;
        if (code === 'EMAIL_VERIFICATION_EXPIRED') setState('expired');
        else if (code === 'EMAIL_VERIFICATION_INVALID') setState('invalid');
        else setState('error');
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const content: Record<VerifyState, { icon: React.ReactNode; title: string; body: string }> = {
    verifying: {
      icon: <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />,
      title: 'Verifying your email...',
      body: 'Please wait a moment.',
    },
    verified: {
      icon: <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />,
      title: 'Email verified!',
      body: 'Your email has been verified successfully.',
    },
    already_verified: {
      icon: <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />,
      title: 'Already verified',
      body: 'This email address is already verified.',
    },
    expired: {
      icon: <AlertCircle className="w-12 h-12 text-amber-600 mx-auto" />,
      title: 'Link expired',
      body: 'This verification link has expired. Sign in and request a new one from your account.',
    },
    invalid: {
      icon: <AlertCircle className="w-12 h-12 text-red-600 mx-auto" />,
      title: 'Invalid link',
      body: 'This verification link is invalid or has already been used.',
    },
    error: {
      icon: <AlertCircle className="w-12 h-12 text-red-600 mx-auto" />,
      title: 'Something went wrong',
      body: "We couldn't verify your email right now. Please try again shortly.",
    },
  };

  const current = content[state];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          {current.icon}
          <h2 className="text-2xl font-bold text-gray-900">{current.title}</h2>
          <p className="text-sm text-gray-600">{current.body}</p>

          <div className="pt-2">
            {isAuthenticated ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex justify-center py-2.5 px-5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Go to Dashboard
              </button>
            ) : (
              <Link
                to="/login"
                className="inline-flex justify-center py-2.5 px-5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
