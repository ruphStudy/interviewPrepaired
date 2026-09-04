import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { CompanyProfile, COMPANY_SIZES } from '../../api/employerApi';
import { AlertCircle, Loader2, Archive, CheckCircle2, Pencil } from 'lucide-react';

const EMPTY_PROFILE: CompanyProfile = {};

/**
 * Employer Profile (16A) — company/hiring-specific metadata, distinct from
 * the generic Organization Profile page (tenant name/slug/type/status,
 * which stays untouched and still applies to companies too). Institute
 * profile fields/API/UI are completely unaffected by this page.
 */
const EmployerProfilePage: React.FC = () => {
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

  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<CompanyProfile>(EMPTY_PROFILE);
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
      const response = await employerApi.getCompanyProfile(organizationId);
      setProfile(response.data.profile);
      setForm(response.data.profile);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load company profile');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company') fetchProfile();
  }, [isSyncing, activeOrganization, fetchProfile]);

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await employerApi.updateCompanyProfile(organizationId, form);
      setProfile(response.data.profile);
      setForm(response.data.profile);
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update company profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(profile);
    setSaveError(null);
    setIsEditing(false);
  };

  const field = (key: keyof CompanyProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const numberField = (key: keyof CompanyProfile, value: string) => {
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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">
              The employer profile is only available for company organizations.
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
            <h1 className="page-title">Employer Profile</h1>
            <p className="page-subtitle">Company and hiring information for {activeOrganization.name}.</p>
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
              This organization is archived. Its employer profile is read-only.
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
              <h3 className="section-title mb-1.5">Couldn't load employer profile</h3>
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
                  <p className="text-sm text-mentor-success">Employer profile saved.</p>
                </div>
              )}

              {isEditing ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div>
                      <label className="label">Company Code</label>
                      <input
                        type="text"
                        value={form.companyCode || ''}
                        onChange={(e) => field('companyCode', e.target.value)}
                        className="input"
                        maxLength={50}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Industry</label>
                      <input
                        type="text"
                        value={form.industry || ''}
                        onChange={(e) => field('industry', e.target.value)}
                        className="input"
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className="label">Company Size</label>
                      <select value={form.companySize || ''} onChange={(e) => field('companySize', e.target.value)} className="input">
                        <option value="">Select size</option>
                        {COMPANY_SIZES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
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
                      <label className="label">Headquarters</label>
                      <input
                        type="text"
                        value={form.headquarters || ''}
                        onChange={(e) => field('headquarters', e.target.value)}
                        className="input"
                        maxLength={200}
                        placeholder="e.g. Bengaluru, India"
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Website</label>
                      <input
                        type="text"
                        value={form.website || ''}
                        onChange={(e) => field('website', e.target.value)}
                        className="input"
                        maxLength={300}
                        placeholder="https://example.com"
                      />
                    </div>
                    <div>
                      <label className="label">Careers Page</label>
                      <input
                        type="text"
                        value={form.careersUrl || ''}
                        onChange={(e) => field('careersUrl', e.target.value)}
                        className="input"
                        maxLength={300}
                        placeholder="https://example.com/careers"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">LinkedIn URL</label>
                    <input
                      type="text"
                      value={form.linkedinUrl || ''}
                      onChange={(e) => field('linkedinUrl', e.target.value)}
                      className="input"
                      maxLength={300}
                      placeholder="https://linkedin.com/company/example"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Hiring Email</label>
                      <input
                        type="email"
                        value={form.hiringEmail || ''}
                        onChange={(e) => field('hiringEmail', e.target.value)}
                        className="input"
                        maxLength={254}
                      />
                    </div>
                    <div>
                      <label className="label">Hiring Phone</label>
                      <input
                        type="text"
                        value={form.hiringPhone || ''}
                        onChange={(e) => field('hiringPhone', e.target.value)}
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
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Official Name</dt>
                    <dd className="text-sm text-mentor-text">{profile.officialName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Company Code</dt>
                    <dd className="text-sm text-mentor-text">{profile.companyCode || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Industry</dt>
                    <dd className="text-sm text-mentor-text">{profile.industry || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Company Size</dt>
                    <dd className="text-sm text-mentor-text">
                      {COMPANY_SIZES.find((s) => s.value === profile.companySize)?.label || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Established Year</dt>
                    <dd className="text-sm text-mentor-text">{profile.establishedYear ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Headquarters</dt>
                    <dd className="text-sm text-mentor-text">{profile.headquarters || '—'}</dd>
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
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Careers Page</dt>
                    <dd className="text-sm text-mentor-text break-all">{profile.careersUrl || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">LinkedIn</dt>
                    <dd className="text-sm text-mentor-text break-all">{profile.linkedinUrl || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Hiring Email</dt>
                    <dd className="text-sm text-mentor-text break-all">{profile.hiringEmail || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Hiring Phone</dt>
                    <dd className="text-sm text-mentor-text">{profile.hiringPhone || '—'}</dd>
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

export default EmployerProfilePage;
