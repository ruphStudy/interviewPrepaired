import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { InstituteProfile, INSTITUTE_KINDS } from '../../api/instituteApi';
import { AlertCircle, Loader2, Archive, CheckCircle2, Pencil } from 'lucide-react';

const EMPTY_PROFILE: InstituteProfile = {};

const InstituteProfilePage: React.FC = () => {
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

  const [profile, setProfile] = useState<InstituteProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<InstituteProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canEdit = hasPermission('organization:update') && activeOrganization?.status !== 'archived';

  const fetchProfile = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await instituteApi.getInstituteProfile(organizationId);
      setProfile(response.data.profile);
      setForm(response.data.profile);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load institute profile');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') fetchProfile();
  }, [isSyncing, activeOrganization, fetchProfile]);

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await instituteApi.updateInstituteProfile(organizationId, form);
      setProfile(response.data.profile);
      setForm(response.data.profile);
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update institute profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(profile);
    setSaveError(null);
    setIsEditing(false);
  };

  const field = (key: keyof InstituteProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const numberField = (key: keyof InstituteProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value === '' ? undefined : Number(value) }));
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

  if (activeOrganization.type !== 'institute') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">
              The institute profile is only available for institute organizations.
            </p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Institute Profile</h1>
            <p className="page-subtitle">Detailed institute information for {activeOrganization.name}.</p>
          </div>
          {canEdit && !isEditing && !loading && (
            <button onClick={() => setIsEditing(true)} className="btn btn-secondary shrink-0">
              <Pencil size={16} />
              Edit
            </button>
          )}
        </div>

        {activeOrganization.status === 'archived' && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
            <Archive size={18} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-future-warning">
              This organization is archived. Its institute profile is read-only.
            </p>
          </div>
        )}

        <div className="card">
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading profile...</p>
            </div>
          ) : loadError ? (
            <div className="p-10 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load institute profile</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{loadError}</p>
              <button onClick={fetchProfile} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : (
            <>
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-5">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{saveError}</p>
                </div>
              )}
              {saved && (
                <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-5">
                  <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-success">Institute profile saved.</p>
                </div>
              )}

              {isEditing ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Institute Type</label>
                      <select
                        value={form.instituteKind || ''}
                        onChange={(e) => field('instituteKind', e.target.value)}
                        className="input"
                      >
                        <option value="">Select type</option>
                        {INSTITUTE_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Institute Code</label>
                      <input
                        type="text"
                        value={form.instituteCode || ''}
                        onChange={(e) => field('instituteCode', e.target.value)}
                        className="input"
                        maxLength={50}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Official Name</label>
                    <input
                      type="text"
                      value={form.officialName || ''}
                      onChange={(e) => field('officialName', e.target.value)}
                      className="input"
                      maxLength={200}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Affiliation</label>
                      <input
                        type="text"
                        value={form.affiliation || ''}
                        onChange={(e) => field('affiliation', e.target.value)}
                        className="input"
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <label className="label">Accreditation</label>
                      <input
                        type="text"
                        value={form.accreditation || ''}
                        onChange={(e) => field('accreditation', e.target.value)}
                        className="input"
                        maxLength={200}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">University Name</label>
                    <input
                      type="text"
                      value={form.universityName || ''}
                      onChange={(e) => field('universityName', e.target.value)}
                      className="input"
                      maxLength={200}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Established Year</label>
                      <input
                        type="number"
                        value={form.establishedYear ?? ''}
                        onChange={(e) => numberField('establishedYear', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Student Count</label>
                      <input
                        type="number"
                        min={0}
                        value={form.studentCount ?? ''}
                        onChange={(e) => numberField('studentCount', e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Description</label>
                    <textarea
                      value={form.description || ''}
                      onChange={(e) => field('description', e.target.value)}
                      className="input"
                      rows={3}
                      maxLength={1500}
                    />
                  </div>

                  <div>
                    <label className="label">Website</label>
                    <input
                      type="text"
                      value={form.website || ''}
                      onChange={(e) => field('website', e.target.value)}
                      className="input"
                      maxLength={300}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Placement Email</label>
                      <input
                        type="email"
                        value={form.placementEmail || ''}
                        onChange={(e) => field('placementEmail', e.target.value)}
                        className="input"
                        maxLength={254}
                      />
                    </div>
                    <div>
                      <label className="label">Placement Phone</label>
                      <input
                        type="text"
                        value={form.placementPhone || ''}
                        onChange={(e) => field('placementPhone', e.target.value)}
                        className="input"
                        maxLength={30}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={handleCancel} disabled={saving} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Institute Type</dt>
                    <dd className="text-sm text-mentor-text capitalize">
                      {INSTITUTE_KINDS.find((k) => k.value === profile.instituteKind)?.label || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Institute Code</dt>
                    <dd className="text-sm text-mentor-text">{profile.instituteCode || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Official Name</dt>
                    <dd className="text-sm text-mentor-text">{profile.officialName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Affiliation</dt>
                    <dd className="text-sm text-mentor-text">{profile.affiliation || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Accreditation</dt>
                    <dd className="text-sm text-mentor-text">{profile.accreditation || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">University Name</dt>
                    <dd className="text-sm text-mentor-text">{profile.universityName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Established Year</dt>
                    <dd className="text-sm text-mentor-text">{profile.establishedYear ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Student Count</dt>
                    <dd className="text-sm text-mentor-text">{profile.studentCount ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Description</dt>
                    <dd className="text-sm text-mentor-text">{profile.description || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Website</dt>
                    <dd className="text-sm text-mentor-text break-all">{profile.website || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Placement Email</dt>
                    <dd className="text-sm text-mentor-text break-all">{profile.placementEmail || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Placement Phone</dt>
                    <dd className="text-sm text-mentor-text">{profile.placementPhone || '—'}</dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteProfilePage;
