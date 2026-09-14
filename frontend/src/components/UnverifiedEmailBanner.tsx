import { useState } from 'react';
import axios from 'axios';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api.config';

/**
 * Shown on every authenticated page for a signed-in user whose email is
 * not yet verified (PR-AUTH-1/5). Never blocks navigation — some actions
 * are separately gated server-side (EMAIL_NOT_VERIFIED) with their own CTA.
 */
export default function UnverifiedEmailBanner() {
  const { user, token } = useAuth();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'cooldown' | 'error'>('idle');

  if (!user || user.isVerified) {
    return null;
  }

  const handleResend = async () => {
    if (!token) return;
    setStatus('sending');
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/resend-verification`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const resultStatus = response.data?.data?.status;
      setStatus(resultStatus === 'cooldown' ? 'cooldown' : 'sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0" />
          <span>Please verify your email to unlock all EnterSkill features.</span>
        </div>
        <div className="flex items-center gap-3">
          {status === 'sent' && <span className="text-xs text-amber-700">Verification email sent — check your inbox.</span>}
          {status === 'cooldown' && <span className="text-xs text-amber-700">A verification email was just sent.</span>}
          {status === 'error' && <span className="text-xs text-amber-700">Couldn't send right now — please try again.</span>}
          <button
            onClick={handleResend}
            disabled={status === 'sending'}
            className="text-xs font-medium text-amber-900 underline hover:no-underline disabled:opacity-60"
          >
            {status === 'sending' ? 'Sending...' : 'Resend verification email'}
          </button>
        </div>
      </div>
    </div>
  );
}
