import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi, { InvitationPreview } from '../api/organizationApi';
import { Mail, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

/**
 * Fully public page (not wrapped in ProtectedRoute) — mirrors the backend's
 * own split: GET .../:token (preview) is public, POST .../:token/accept
 * requires auth. An unauthenticated visitor sees the preview and is pointed
 * at login/register; there is no redirect-after-login mechanism in this
 * app today, so they're asked to return to this same link afterward rather
 * than inventing new auth-flow plumbing.
 */
const AcceptInvitationPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { setActiveOrganization, addJoinedOrganization } = useOrganization();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

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
      addJoinedOrganization({ id: organization.id, name: organization.name, slug: organization.slug, type: organization.type });
      await setActiveOrganization(organization.id);
      setAccepted(true);
      setTimeout(() => navigate(`/organizations/${organization.id}/profile`), 1200);
    } catch (err: any) {
      setAcceptError(err.message || 'Failed to accept invitation');
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
                <p className="text-sm text-mentor-error">{acceptError}</p>
              </div>
            )}

            {isAuthenticated ? (
              <button onClick={handleAccept} disabled={accepting} className="btn btn-primary w-full justify-center">
                {accepting ? 'Accepting...' : 'Accept Invitation'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-mentor-text-muted">
                  Log in or create an account with the invited email, then return to this link to accept.
                </p>
                <div className="flex gap-3">
                  <Link to="/login" className="btn btn-primary flex-1 justify-center">
                    Log In
                  </Link>
                  <Link to="/register" className="btn btn-secondary flex-1 justify-center">
                    Register
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
