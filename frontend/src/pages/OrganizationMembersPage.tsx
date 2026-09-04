import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi, {
  OrganizationMember,
  OrganizationMemberRole,
  OrganizationMemberStatus,
  OrganizationInvitation,
  OrganizationInvitationStatus,
  ASSIGNABLE_MEMBER_ROLES,
} from '../api/organizationApi';
import {
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  Mail,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_LIMIT = 20;

const getMemberStatusBadgeClass = (status: OrganizationMemberStatus) =>
  status === 'active' ? 'badge-success' : 'badge-neutral';

const getInvitationStatusBadgeClass = (status: OrganizationInvitationStatus) => {
  switch (status) {
    case 'pending':
      return 'badge-warning';
    case 'accepted':
      return 'badge-success';
    case 'revoked':
    case 'expired':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

type TabKey = 'members' | 'invitations';

const OrganizationMembersPage: React.FC = () => {
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

  const [tab, setTab] = useState<TabKey>('members');

  // ---- Members state ----
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [membersPage, setMembersPage] = useState(1);
  const [membersTotal, setMembersTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState<OrganizationMemberRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<OrganizationMemberStatus | ''>('');
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<OrganizationMemberRole>('member');
  const [addMemberSubmitting, setAddMemberSubmitting] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);

  // ---- Invitations state ----
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [invitationsPage, setInvitationsPage] = useState(1);
  const [invitationsTotal, setInvitationsTotal] = useState(0);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationMemberRole>('member');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const membersTotalPages = Math.max(1, Math.ceil(membersTotal / PAGE_LIMIT));
  const invitationsTotalPages = Math.max(1, Math.ceil(invitationsTotal / PAGE_LIMIT));
  const canManageMembers = hasPermission('members:manage');
  const canViewMembers = hasPermission('members:view');
  const isMutable = activeOrganization?.status !== 'archived';

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;

  const fetchMembers = useCallback(async () => {
    if (!organizationId || !canViewMembers) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const response = await organizationApi.listMembers(organizationId, {
        page: membersPage,
        limit: PAGE_LIMIT,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setMembers(response.data.members);
      setMembersTotal(response.data.pagination.total);
    } catch (err: any) {
      setMembersError(err.message || 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  }, [organizationId, canViewMembers, membersPage, roleFilter, statusFilter]);

  const fetchInvitations = useCallback(async () => {
    if (!organizationId || !canManageMembers) return;
    setInvitationsLoading(true);
    setInvitationsError(null);
    try {
      const response = await organizationApi.listInvitations(organizationId, {
        page: invitationsPage,
        limit: PAGE_LIMIT,
      });
      setInvitations(response.data.invitations);
      setInvitationsTotal(response.data.pagination.total);
    } catch (err: any) {
      setInvitationsError(err.message || 'Failed to load invitations');
    } finally {
      setInvitationsLoading(false);
    }
  }, [organizationId, canManageMembers, invitationsPage]);

  useEffect(() => {
    if (!isSyncing) fetchMembers();
  }, [isSyncing, fetchMembers]);

  useEffect(() => {
    if (!isSyncing && tab === 'invitations') fetchInvitations();
  }, [isSyncing, tab, fetchInvitations]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!addMemberUserId.trim()) {
      setAddMemberError('User ID is required');
      return;
    }
    setAddMemberSubmitting(true);
    setAddMemberError(null);
    try {
      await organizationApi.addMember(organizationId, { userId: addMemberUserId.trim(), role: addMemberRole });
      setAddMemberUserId('');
      setAddMemberRole('member');
      setShowAddMember(false);
      setMembersPage(1);
      fetchMembers();
    } catch (err: any) {
      setAddMemberError(err.message || 'Failed to add member');
    } finally {
      setAddMemberSubmitting(false);
    }
  };

  const handleRoleChange = async (member: OrganizationMember, role: OrganizationMemberRole) => {
    if (!organizationId) return;
    setMemberActionError(null);
    try {
      await organizationApi.updateMember(organizationId, member.id, { role });
      fetchMembers();
    } catch (err: any) {
      setMemberActionError(err.message || 'Failed to update role');
    }
  };

  const handleReactivate = async (member: OrganizationMember) => {
    if (!organizationId) return;
    setMemberActionError(null);
    try {
      await organizationApi.updateMember(organizationId, member.id, { status: 'active' });
      fetchMembers();
    } catch (err: any) {
      setMemberActionError(err.message || 'Failed to reactivate member');
    }
  };

  const handleRemove = async (member: OrganizationMember) => {
    if (!organizationId) return;
    const label = member.user?.name || member.user?.email || 'this member';
    if (!window.confirm(`Remove ${label} from this organization?`)) return;
    setMemberActionError(null);
    try {
      await organizationApi.removeMember(organizationId, member.id);
      fetchMembers();
    } catch (err: any) {
      setMemberActionError(err.message || 'Failed to remove member');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!inviteEmail.trim()) {
      setInviteError('Email is required');
      return;
    }
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const response = await organizationApi.createInvitation(organizationId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setNewInviteLink(`${window.location.origin}/accept-invite/${response.data.token}`);
      setInviteEmail('');
      setInviteRole('member');
      setShowInvite(false);
      setInvitationsPage(1);
      fetchInvitations();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to create invitation');
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRevoke = async (invitation: OrganizationInvitation) => {
    if (!organizationId) return;
    if (!window.confirm(`Revoke the invitation sent to ${invitation.email}?`)) return;
    setInvitationsError(null);
    try {
      await organizationApi.revokeInvitation(organizationId, invitation.id);
      fetchInvitations();
    } catch (err: any) {
      setInvitationsError(err.message || 'Failed to revoke invitation');
    }
  };

  const handleCopyLink = async () => {
    if (!newInviteLink) return;
    try {
      await navigator.clipboard.writeText(newInviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions/insecure context) — the link text remains visible to copy manually.
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

  if (!canViewMembers) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">
              You don't have permission to view members of this organization.
            </p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Members</h1>
          <p className="page-subtitle">Manage who has access to {activeOrganization.name}.</p>
        </div>

        {canManageMembers && (
          <div className="tabs mb-6">
            <button className={`tab ${tab === 'members' ? 'tab-active' : ''}`} onClick={() => setTab('members')}>
              Members
            </button>
            <button className={`tab ${tab === 'invitations' ? 'tab-active' : ''}`} onClick={() => setTab('invitations')}>
              Invitations
            </button>
          </div>
        )}

        {newInviteLink && (
          <div className="card bg-mentor-mint dark:bg-future-card mb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="section-title mb-1">Invitation created</h3>
                <p className="text-sm text-mentor-text-secondary mb-3">
                  There's no email delivery yet — copy this link and share it with the invitee directly.
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white dark:bg-future-elevated px-3 py-2 rounded-lg border border-mentor-border dark:border-future-border truncate flex-1">
                    {newInviteLink}
                  </code>
                  <button onClick={handleCopyLink} className="btn btn-secondary shrink-0 px-3 py-2">
                    {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewInviteLink(null)}
                className="text-mentor-text-muted hover:text-mentor-text shrink-0"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {tab === 'members' ? (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as OrganizationMemberRole | '');
                  setMembersPage(1);
                }}
                className="input w-auto"
              >
                <option value="">All roles</option>
                <option value="owner">Owner</option>
                {ASSIGNABLE_MEMBER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as OrganizationMemberStatus | '');
                  setMembersPage(1);
                }}
                className="input w-auto"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {canManageMembers && isMutable && (
                <button onClick={() => setShowAddMember((v) => !v)} className="btn btn-primary ml-auto">
                  <Plus size={16} />
                  Add Member
                </button>
              )}
            </div>

            {showAddMember && (
              <form onSubmit={handleAddMember} className="card mb-4 space-y-4">
                <p className="text-sm text-mentor-text-secondary">
                  Add an existing, registered user by their <strong>User ID</strong>. To invite someone by email instead,
                  use the Invitations tab.
                </p>
                {addMemberError && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                    <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-error">{addMemberError}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="add-member-userid" className="label">
                      User ID
                    </label>
                    <input
                      id="add-member-userid"
                      type="text"
                      value={addMemberUserId}
                      onChange={(e) => setAddMemberUserId(e.target.value)}
                      className="input"
                      placeholder="Mongo user id"
                    />
                  </div>
                  <div>
                    <label htmlFor="add-member-role" className="label">
                      Role
                    </label>
                    <select
                      id="add-member-role"
                      value={addMemberRole}
                      onChange={(e) => setAddMemberRole(e.target.value as OrganizationMemberRole)}
                      className="input"
                    >
                      {ASSIGNABLE_MEMBER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={addMemberSubmitting} className="btn btn-primary">
                    {addMemberSubmitting ? 'Adding...' : 'Add Member'}
                  </button>
                  <button type="button" onClick={() => setShowAddMember(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {memberActionError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{memberActionError}</p>
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              {membersLoading ? (
                <div className="p-16 text-center">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
                  <p className="text-mentor-text-muted text-sm">Loading members...</p>
                </div>
              ) : membersError ? (
                <div className="p-16 text-center">
                  <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
                  <h3 className="section-title mb-1.5">Couldn't load members</h3>
                  <p className="text-sm text-mentor-text-secondary mb-5">{membersError}</p>
                  <button onClick={fetchMembers} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : members.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-sm text-mentor-text-secondary">No members match these filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-mentor-border">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Member
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Joined
                        </th>
                        {canManageMembers && (
                          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mentor-border">
                      {members.map((member) => {
                        const isOwner = member.role === 'owner';
                        return (
                          <tr key={member.id}>
                            <td className="px-6 py-3">
                              <div className="text-sm font-medium text-mentor-text">
                                {member.user?.name || 'Unknown user'}
                              </div>
                              <div className="text-xs text-mentor-text-muted">{member.user?.email || '—'}</div>
                            </td>
                            <td className="px-6 py-3">
                              {canManageMembers && !isOwner && isMutable ? (
                                <select
                                  value={member.role}
                                  onChange={(e) => handleRoleChange(member, e.target.value as OrganizationMemberRole)}
                                  className="input w-auto py-1.5 text-xs"
                                >
                                  {ASSIGNABLE_MEMBER_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                      {role.charAt(0).toUpperCase() + role.slice(1)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="badge badge-info capitalize">{member.role}</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <span className={`badge ${getMemberStatusBadgeClass(member.status)} capitalize`}>
                                {member.status}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                              {formatDate(member.joinedAt)}
                            </td>
                            {canManageMembers && (
                              <td className="px-6 py-3 text-right">
                                {!isOwner && isMutable && (
                                  <div className="flex items-center justify-end gap-2">
                                    {member.status === 'active' ? (
                                      <button
                                        onClick={() => handleRemove(member)}
                                        className="btn btn-secondary px-3 py-1.5 text-xs"
                                        aria-label="Remove member"
                                      >
                                        <Trash2 size={14} />
                                        Remove
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleReactivate(member)}
                                        className="btn btn-secondary px-3 py-1.5 text-xs"
                                        aria-label="Reactivate member"
                                      >
                                        <RotateCcw size={14} />
                                        Reactivate
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!membersLoading && !membersError && membersTotal > 0 && (
                <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
                  <p className="text-xs text-mentor-text-muted">
                    Page {membersPage} of {membersTotalPages} &middot; {membersTotal} total
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
                      disabled={membersPage <= 1}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setMembersPage((p) => Math.min(membersTotalPages, p + 1))}
                      disabled={membersPage >= membersTotalPages}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {isMutable && (
                <button onClick={() => setShowInvite((v) => !v)} className="btn btn-primary ml-auto">
                  <Mail size={16} />
                  Invite by Email
                </button>
              )}
            </div>

            {showInvite && (
              <form onSubmit={handleInvite} className="card mb-4 space-y-4">
                {inviteError && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                    <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-error">{inviteError}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="invite-email" className="label">
                      Email
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="input"
                      placeholder="person@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-role" className="label">
                      Role
                    </label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as OrganizationMemberRole)}
                      className="input"
                    >
                      {ASSIGNABLE_MEMBER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={inviteSubmitting} className="btn btn-primary">
                    {inviteSubmitting ? 'Sending...' : 'Create Invitation'}
                  </button>
                  <button type="button" onClick={() => setShowInvite(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="card p-0 overflow-hidden">
              {invitationsLoading ? (
                <div className="p-16 text-center">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
                  <p className="text-mentor-text-muted text-sm">Loading invitations...</p>
                </div>
              ) : invitationsError ? (
                <div className="p-16 text-center">
                  <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
                  <h3 className="section-title mb-1.5">Couldn't load invitations</h3>
                  <p className="text-sm text-mentor-text-secondary mb-5">{invitationsError}</p>
                  <button onClick={fetchInvitations} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : invitations.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-sm text-mentor-text-secondary">No invitations yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-mentor-border">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Expires
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Created
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mentor-border">
                      {invitations.map((invitation) => (
                        <tr key={invitation.id}>
                          <td className="px-6 py-3 text-sm text-mentor-text">{invitation.email}</td>
                          <td className="px-6 py-3">
                            <span className="badge badge-info capitalize">{invitation.role}</span>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`badge ${getInvitationStatusBadgeClass(invitation.status)} capitalize`}>
                              {invitation.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                            {formatDate(invitation.expiresAt)}
                          </td>
                          <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                            {formatDate(invitation.createdAt)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            {invitation.status === 'pending' && isMutable && (
                              <button
                                onClick={() => handleRevoke(invitation)}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                              >
                                <Trash2 size={14} />
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!invitationsLoading && !invitationsError && invitationsTotal > 0 && (
                <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
                  <p className="text-xs text-mentor-text-muted">
                    Page {invitationsPage} of {invitationsTotalPages} &middot; {invitationsTotal} total
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInvitationsPage((p) => Math.max(1, p - 1))}
                      disabled={invitationsPage <= 1}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setInvitationsPage((p) => Math.min(invitationsTotalPages, p + 1))}
                      disabled={invitationsPage >= invitationsTotalPages}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default OrganizationMembersPage;
