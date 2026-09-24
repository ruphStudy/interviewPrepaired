import { useState, useRef } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api.config';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

/**
 * Shown on every authenticated page for a signed-in user whose email is
 * not yet verified (PR-AUTH-1/5, extended for dual verification). Never
 * blocks navigation — some actions are separately gated server-side
 * (EMAIL_NOT_VERIFIED) with their own CTA.
 */
export default function UnverifiedEmailBanner() {
  const { user, token, refreshUser } = useAuth();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'cooldown' | 'error'>('idle');
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<'idle' | 'submitting' | 'error' | 'verified'>('idle');
  const [codeError, setCodeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      // A resend issues a brand-new code — any code the user was mid-typing
      // from the previous email is no longer valid.
      setCode('');
      setCodeState('idle');
      setCodeError(null);
    } catch {
      setStatus('error');
    }
  };

  const submitCode = async (submittedCode: string) => {
    if (!token || submittedCode.length !== 6 || codeState === 'submitting') return;
    setCodeState('submitting');
    setCodeError(null);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/verify-email-code`,
        { code: submittedCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const resultStatus = response.data?.data?.status;
      setCodeState('verified');
      void resultStatus;
      await refreshUser();
    } catch (err: any) {
      const apiCode = err.response?.data?.code;
      const messages: Record<string, string> = {
        EMAIL_VERIFICATION_CODE_EXPIRED: 'This code has expired. Request a new one.',
        EMAIL_VERIFICATION_CODE_LOCKED: 'Too many incorrect attempts. Request a new code.',
        EMAIL_VERIFICATION_CODE_INVALID: 'Incorrect code. Please check and try again.',
      };
      setCodeError(messages[apiCode] || "Couldn't verify that code — please try again.");
      setCodeState('error');
    }
  };

  const handleCodeChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digitsOnly);
    if (codeState === 'error') {
      setCodeState('idle');
      setCodeError(null);
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCode(code);
    }
  };

  if (codeState === 'verified') {
    return (
      <div className="bg-green-50 border-b border-green-200 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>Email verified successfully.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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
            <button
              onClick={() => {
                setShowCodeEntry((v) => !v);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="text-xs font-medium text-amber-900 underline hover:no-underline"
            >
              {showCodeEntry ? 'Hide code entry' : 'Enter code instead'}
            </button>
          </div>
        </div>

        {showCodeEntry && (
          <div className="flex items-center gap-3 flex-wrap pb-1">
            <label htmlFor="email-verification-code" className="sr-only">
              6-digit verification code
            </label>
            <input
              id="email-verification-code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d*"
              maxLength={6}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onKeyDown={handleCodeKeyDown}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (/\d/.test(pasted)) {
                  e.preventDefault();
                  handleCodeChange(pasted);
                }
              }}
              placeholder="123456"
              aria-label="6-digit verification code"
              aria-invalid={codeState === 'error'}
              aria-describedby={codeError ? 'email-verification-code-error' : undefined}
              className="w-32 tracking-[0.3em] text-center font-mono text-sm border border-amber-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
              disabled={codeState === 'submitting'}
            />
            <button
              onClick={() => submitCode(code)}
              disabled={code.length !== 6 || codeState === 'submitting'}
              className="text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3 py-1.5"
            >
              {codeState === 'submitting' ? 'Verifying...' : 'Verify code'}
            </button>
            {codeError && (
              <span id="email-verification-code-error" role="alert" className="text-xs text-red-700">
                {codeError}
              </span>
            )}
            <span className="text-xs text-amber-700">
              Sent to {maskEmail(user.email)}. Codes expire after 10 minutes — clicking the link in the email also works.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
