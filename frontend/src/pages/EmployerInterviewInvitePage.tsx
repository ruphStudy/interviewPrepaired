import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import publicEmployerInterviewInvitationApi, { PublicEmployerInterviewInvitation } from '../api/publicEmployerInterviewInvitationApi';
import { Briefcase, AlertCircle, Loader2, CheckCircle2, Clock3 } from 'lucide-react';

/**
 * Fully PUBLIC page (not wrapped in ProtectedRoute, no login required at
 * all) — 20D. The raw token lives only in this route's URL param and in
 * local component state for the duration of this page; it is never
 * written to localStorage/sessionStorage/cookies/global app state, and
 * never logged. This page only establishes secure candidate access and
 * explicit acceptance — it does NOT create an interview session, so there
 * is deliberately no "Start Interview" action here yet.
 */
const EmployerInterviewInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [invitation, setInvitation] = useState<PublicEmployerInterviewInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const fetchInvitation = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setIsExpired(false);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicEmployerInterviewInvitation(token);
      setInvitation(response.data.invitation);
    } catch (err: any) {
      const message = err.message || 'This invitation link is invalid or no longer available.';
      setIsExpired(/expired/i.test(message));
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.acceptPublicEmployerInterviewInvitation(token);
      setInvitation(response.data.invitation);
    } catch (err: any) {
      setAcceptError(err.message || 'Failed to accept this invitation.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-mentor-bg dark:bg-future-bg p-4">
      <div className="card max-w-md w-full text-center">
        {loading ? (
          <>
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading invitation...</p>
          </>
        ) : error || !invitation ? (
          <>
            {isExpired ? (
              <Clock3 className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            ) : (
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            )}
            <h2 className="section-title text-lg mb-2">{isExpired ? 'Invitation expired' : 'Invitation unavailable'}</h2>
            <p className="text-sm text-mentor-text-secondary">{error || 'This invitation link is invalid or no longer available.'}</p>
          </>
        ) : invitation.status === 'accepted' ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-mentor-success mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Invitation accepted</h2>
            <p className="text-sm text-mentor-text-secondary">Your interview is ready for the next step.</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
              <Briefcase size={22} className="text-primary-600" />
            </div>
            <h2 className="section-title text-lg mb-1">
              {invitation.invitedName ? `Hi ${invitation.invitedName.split(' ')[0]}, you` : "You"}'ve been invited to interview
            </h2>
            <p className="text-sm text-mentor-text-secondary mb-1">
              <strong className="text-mentor-text">{invitation.organization.name}</strong> invites you to interview for{' '}
              <strong className="text-mentor-text">{invitation.job.title}</strong>
              {invitation.job.jobCode ? ` (${invitation.job.jobCode})` : ''}.
            </p>

            <div className="surface-muted p-4 my-4 text-left space-y-1.5">
              <p className="text-sm text-mentor-text">{invitation.interview.blueprintTitle}</p>
              <p className="text-xs text-mentor-text-muted">
                ~{invitation.interview.estimatedDurationMinutes} min &middot; {invitation.interview.totalSections} sections &middot;{' '}
                {invitation.interview.totalPlannedQuestions} questions planned
              </p>
            </div>

            {invitation.message && <p className="text-sm text-mentor-text-secondary mb-4 italic">&ldquo;{invitation.message}&rdquo;</p>}

            <p className="text-xs text-mentor-text-muted mb-6">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>

            {acceptError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4 text-left">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{acceptError}</p>
              </div>
            )}

            <button onClick={handleAccept} disabled={accepting} className="btn btn-primary w-full justify-center">
              {accepting ? 'Accepting...' : 'Accept Interview Invitation'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EmployerInterviewInvitePage;
