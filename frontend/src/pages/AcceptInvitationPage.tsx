import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi, { InvitationPreview } from '../api/organizationApi';
import { Mail, AlertCircle, Loader2, CheckCircle2, KeyRound } from 'lucide-react';

const MIN_ACTIVATION_PASSWORD_LENGTH = 8;

/**
 * Fully public page (not wrapped in ProtectedRoute) — mirrors the backend's
 * own split: GET .../:token (preview) is public, POST .../:token/accept
 * requires auth. An unauthenticated visitor sees the preview and is pointed
 * at login/register; there is no redirect-after-login mechanism in this
 * app today, so they're asked to return to this same link afterward rather
 * than inventing new auth-flow plumbing.
 *
 * D2/PR-PEOPLE-1-3 exception: ANY invitation role (Owner, Trainer,
 * Recruiter — any org-scoped role a brand-new account might be invited
 * with) may belong to a brand-new account with an unknown,
 * never-disclosed password — an unauthenticated visitor on ANY invite is
 * offered a "set your password" form here, which calls the public
 * activation endpoint and logs them straight in. The backend's
 * `pendingPasswordActivation` flag is the real, ONLY security gate (never
 * this page's own role check): if this invitation actually belongs to an
 * EXISTING account that already has a real password, activation is
 * refused with a clear message pointing them at login instead — this page
 * never has to know in advance which case it is, for any role.
 */
const AcceptInvitationPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, loginWithToken } = useAuth();
  const { setActiveOrganization, refreshOrganizations } = useOrganization();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const [activationPassword, setActivationPassword] = useState('');
  const [activationPasswordConfirm, setActivationPasswordConfirm] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await organizationApi.getInvitationPreview(token);
      setPreview(response.data);
    } catch (err: any) {
      setError(err.message || 'This invitation link is invalid or no longer available');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const response = await organizationApi.acceptInvitation(token);
      const { organization } = response.data;
      // The backend now reflects this membership immediately — no
      // client-side cache needed to make it show up in the switcher.
      await refreshOrganizations();
      await setActiveOrganization(organization.id);
      setAccepted(true);
      setTimeout(() => navigate(`/organizations/${organization.id}/dashboard`), 1200);
    } catch (err: any) {
      // The backend's own email-identity check ("This invitation was sent
      // to a different email address") is the real, authoritative gate —
      // §3's "require correct account identity" — this just surfaces a
      // recovery action (switch account) rather than a dead-end error.
      setAcceptError(err.message || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    setAcceptError(null);
  };

  const isWrongAccountError = !!acceptError && /different email address/i.test(acceptError);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setActivationError(null);

    if (activationPassword.length < MIN_ACTIVATION_PASSWORD_LENGTH) {
      setActivationError(`Password must be at least ${MIN_ACTIVATION_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (activationPassword !== activationPasswordConfirm) {
      setActivationError('Passwords do not match.');
      return;
    }

    setActivating(true);
    try {
      const response = await organizationApi.activateOwnerAccount(token, activationPassword);
      const { token: sessionToken, user, organization } = response.data;
      loginWithToken(sessionToken, user as any);
      await refreshOrganizations();
      await setActiveOrganization(organization.id);
      setAccepted(true);
      setTimeout(() => navigate(`/organizations/${organization.id}/dashboard`), 1200);
    } catch (err: any) {
      // The backend refuses (400) here if this invitation actually belongs
      // to an existing owner who already has a real password (D3) — its
      // message already points the visitor at logging in instead.
      setActivationError(err.message || 'Failed to activate your account');
    } finally {
      setActivating(false);
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
        ) : error || !preview ? (
          <>
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Invitation unavailable</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">{error || 'Invitation not found'}</p>
            <Link to="/dashboard" className="btn btn-primary">
              Go to Dashboard
            </Link>
          </>
        ) : accepted ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-mentor-success mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Invitation accepted</h2>
            <p className="text-sm text-mentor-text-secondary">Taking you to {preview.organization.name}...</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
              <Mail size={22} className="text-primary-600" />
            </div>
            <h2 className="section-title text-lg mb-2">You've been invited</h2>
            <p className="text-sm text-mentor-text-secondary mb-1">
              Join <strong className="text-mentor-text">{preview.organization.name}</strong> as a{' '}
              <span className="capitalize">{preview.role}</span>.
            </p>
            <p className="text-xs text-mentor-text-muted mb-6">
              Invited email: {preview.email} &middot; Expires {new Date(preview.expiresAt).toLocaleDateString()}
            </p>

            {acceptError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4 text-left">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-mentor-error">{acceptError}</p>
                  {isWrongAccountError && (
                    <p className="text-xs text-mentor-text-muted mt-1">
                      {user?.email ? `You're signed in as ${user.email}. ` : ''}
                      <button type="button" onClick={handleSwitchAccount} className="text-primary-600 hover:underline">
                        Log out and switch account
                      </button>
                    </p>
                  )}
                </div>
              </div>
            )}

            {isAuthenticated ? (
              <button onClick={handleAccept} disabled={accepting} className="btn btn-primary w-full justify-center">
                {accepting ? 'Accepting...' : 'Accept Invitation'}
              </button>
            ) : (
              <form onSubmit={handleActivate} className="space-y-3 text-left">
                <div className="flex items-center gap-2 text-xs text-mentor-text-muted mb-1">
                  <KeyRound size={14} />
                  <span>New here? Set a password to activate your account.</span>
                </div>

                {activationError && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 text-left">
                    <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-error">{activationError}</p>
                  </div>
                )}

                <input
                  type="password"
                  className="input w-full"
                  placeholder="New password"
                  value={activationPassword}
                  onChange={(e) => setActivationPassword(e.target.value)}
                  minLength={MIN_ACTIVATION_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  required
                />
                <input
                  type="password"
                  className="input w-full"
                  placeholder="Confirm password"
                  value={activationPasswordConfirm}
                  onChange={(e) => setActivationPasswordConfirm(e.target.value)}
                  minLength={MIN_ACTIVATION_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  required
                />
                <button type="submit" disabled={activating} className="btn btn-primary w-full justify-center">
                  {activating ? 'Activating...' : 'Set Password & Activate'}
                </button>

                <p className="text-xs text-mentor-text-muted text-center pt-2">
                  Already have an account with this email?{' '}
                  <Link to="/login" className="text-primary-600 hover:underline">
                    Log in
                  </Link>{' '}
                  and return to this link.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
