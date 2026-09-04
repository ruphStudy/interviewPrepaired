import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi from '../api/organizationApi';
import { Building2, GraduationCap, AlertCircle, Loader2, Pencil, Archive } from 'lucide-react';

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'active':
      return 'badge-success';
    case 'suspended':
      return 'badge-warning';
    case 'archived':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
};

const OrganizationProfilePage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    refreshActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  useEffect(() => {
    if (activeOrganization && activeOrganizationId === organizationId) {
      setName(activeOrganization.name);
      setDescription(activeOrganization.description || '');
      setWebsite(activeOrganization.website || '');
      setContactEmail(activeOrganization.contactEmail || '');
      setContactPhone(activeOrganization.contactPhone || '');
    }
  }, [activeOrganization, activeOrganizationId, organizationId]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canEdit = hasPermission('organization:update') && activeOrganization?.status !== 'archived';

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Organization name is required';
    else if (name.trim().length > 120) errors.name = 'Name must be 120 characters or fewer';
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) errors.contactEmail = 'Enter a valid email address';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!organizationId || !validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await organizationApi.updateOrganization(organizationId, {
        name: name.trim(),
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      await refreshActiveOrganization();
      setIsEditing(false);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (activeOrganization) {
      setName(activeOrganization.name);
      setDescription(activeOrganization.description || '');
      setWebsite(activeOrganization.website || '');
      setContactEmail(activeOrganization.contactEmail || '');
      setContactPhone(activeOrganization.contactPhone || '');
    }
    setFieldErrors({});
    setSaveError(null);
    setIsEditing(false);
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

  const org = activeOrganization;
  const TypeIcon = org.type === 'institute' ? GraduationCap : Building2;

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Organization Profile</h1>
            <p className="page-subtitle">View and manage your organization's basic information.</p>
          </div>
          {canEdit && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="btn btn-secondary shrink-0">
              <Pencil size={16} />
              Edit
            </button>
          )}
        </div>

        {org.status === 'archived' && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
            <Archive size={18} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-future-warning">
              This organization is archived. Its information is read-only.
            </p>
          </div>
        )}

        <div className="card">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-mentor-border">
            <div className="w-14 h-14 rounded-xl bg-mentor-soft dark:bg-future-elevated flex items-center justify-center shrink-0">
              <TypeIcon size={26} className="text-primary-600 dark:text-future-violet" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-mentor-text truncate">{org.name}</h2>
              <p className="text-sm text-mentor-text-muted">/{org.slug}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className={`badge ${getStatusBadgeClass(org.status)} capitalize`}>{org.status}</span>
              <span className="text-xs text-mentor-text-muted capitalize">{org.type}</span>
            </div>
          </div>

          {saveError && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-5">
              <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
              <p className="text-sm text-mentor-error">{saveError}</p>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-5">
              <div>
                <label htmlFor="edit-name" className="label">
                  Organization Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`input ${fieldErrors.name ? 'input-error' : ''}`}
                  maxLength={120}
                />
                {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
              </div>
              <div>
                <label htmlFor="edit-description" className="label">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input"
                  rows={3}
                  maxLength={1000}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-website" className="label">
                    Website
                  </label>
                  <input
                    id="edit-website"
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="input"
                    maxLength={300}
                  />
                </div>
                <div>
                  <label htmlFor="edit-contactEmail" className="label">
                    Contact Email
                  </label>
                  <input
                    id="edit-contactEmail"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={`input ${fieldErrors.contactEmail ? 'input-error' : ''}`}
                    maxLength={254}
                  />
                  {fieldErrors.contactEmail && <p className="field-error">{fieldErrors.contactEmail}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="edit-contactPhone" className="label">
                  Contact Phone
                </label>
                <input
                  id="edit-contactPhone"
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="input"
                  maxLength={30}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={handleCancelEdit} disabled={saving} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-mentor-text-muted mb-1">Description</dt>
                <dd className="text-sm text-mentor-text">{org.description || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-mentor-text-muted mb-1">Website</dt>
                <dd className="text-sm text-mentor-text break-all">{org.website || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-mentor-text-muted mb-1">Contact Email</dt>
                <dd className="text-sm text-mentor-text break-all">{org.contactEmail || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-mentor-text-muted mb-1">Contact Phone</dt>
                <dd className="text-sm text-mentor-text">{org.contactPhone || '—'}</dd>
              </div>
            </dl>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default OrganizationProfilePage;
