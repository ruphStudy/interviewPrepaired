import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EmployerCollaborationNotificationItem } from '../../api/employerApi';
import { AlertCircle, Loader2, Bell } from 'lucide-react';

const formatDateTime = (value: string) => new Date(value).toLocaleString();

const notificationLabel = (n: EmployerCollaborationNotificationItem): string => {
  const name = n.actor.displayName || 'Someone';
  return n.type === 'note_mention' ? `${name} mentioned you in an internal note` : `${name} added you as a collaborator`;
};

/**
 * "Notifications" (24C) — in-app-only employer collaboration event inbox.
 * No email/SMS/push. Distinct from the 24B Mentions page: this is a
 * read/unread event log, not a note-content list.
 */
const EmployerNotificationsPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [notifications, setNotifications] = useState<EmployerCollaborationNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');

  const fetchNotifications = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.getEmployerCollaborationNotifications(organizationId, 1, 50, tab === 'unread');
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [organizationId, tab]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchNotifications();
    }
  }, [isSyncing, activeOrganization, canView, fetchNotifications]);

  const handleOpen = async (n: EmployerCollaborationNotificationItem) => {
    if (!organizationId) return;
    if (!n.read) {
      try {
        await employerApi.markEmployerNotificationRead(organizationId, n.id);
        setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // best-effort — navigation proceeds regardless
      }
    }
    navigate(`/organizations/${organizationId}/employer/applications/${n.applicationId}`);
  };

  const handleMarkAllRead = async () => {
    if (!organizationId) return;
    setMarkingAllRead(true);
    try {
      await employerApi.markAllEmployerNotificationsRead(organizationId);
      await fetchNotifications();
    } catch {
      // best-effort
    } finally {
      setMarkingAllRead(false);
    }
  };

  if (isSyncing || contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading organization...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (contextError || !activeOrganization) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Couldn't load organization</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">
              {contextError || "You don't have access to this organization, or it no longer exists."}
            </p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Notifications are only available for company organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view notifications.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h1 className="page-title flex items-center gap-2">
            <Bell size={20} className="text-mentor-text-muted" />
            Notifications
          </h1>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} disabled={markingAllRead} className="btn btn-secondary">
              {markingAllRead ? 'Marking...' : 'Mark all as read'}
            </button>
          )}
        </div>
        <p className="text-sm text-mentor-text-secondary mb-4">Employer collaboration events — in-app only.</p>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('all')} className={`btn ${tab === 'all' ? 'btn-primary' : 'btn-secondary'}`}>
            All
          </button>
          <button onClick={() => setTab('unread')} className={`btn ${tab === 'unread' ? 'btn-primary' : 'btn-secondary'}`}>
            Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        </div>

        <div className="card">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
              <p className="text-sm text-mentor-text-secondary mb-4">{error}</p>
              <button onClick={fetchNotifications} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-mentor-text-secondary text-center py-8">
              {tab === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-mentor-border">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleOpen(n)}
                    className={`w-full text-left py-3 px-2 -mx-2 rounded transition-colors hover:bg-mentor-surface ${
                      !n.read ? 'bg-mentor-aqua/40 dark:bg-future-elevated' : ''
                    }`}
                  >
                    <p className="text-sm text-mentor-text">{notificationLabel(n)}</p>
                    <p className="text-xs text-mentor-text-muted mt-1">
                      {n.candidate.firstName ? `${n.candidate.firstName} ${n.candidate.lastName}` : 'Candidate'} &middot;{' '}
                      {formatDateTime(n.createdAt)}
                      {!n.read && <span className="badge badge-info ml-2">New</span>}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-mentor-text-muted mt-4">
          Looking for the note itself? Visit <Link to={`/organizations/${organizationId}/employer/mentions`} className="hover:underline">Mentions</Link>.
        </p>
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerNotificationsPage;
