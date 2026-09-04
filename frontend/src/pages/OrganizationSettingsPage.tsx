import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi, {
  OrganizationSettingsDetail,
  OrganizationDateFormat,
  OrganizationTimeFormat,
  ORGANIZATION_DATE_FORMATS,
  ORGANIZATION_TIME_FORMATS,
} from '../api/organizationApi';
import { SUPPORTED_LANGUAGES } from '../config/languages';
import { AlertCircle, Loader2, Archive, CheckCircle2 } from 'lucide-react';

const OrganizationSettingsPage: React.FC = () => {
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

  const [settings, setSettings] = useState<OrganizationSettingsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState('');
  const [locale, setLocale] = useState('');
  const [dateFormat, setDateFormat] = useState<OrganizationDateFormat>('DD/MM/YYYY');
  const [timeFormat, setTimeFormat] = useState<OrganizationTimeFormat>('12h');
  const [defaultInterviewLanguage, setDefaultInterviewLanguage] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canEdit = hasPermission('organization:update') && activeOrganization?.status !== 'archived';

  const applySettings = (s: OrganizationSettingsDetail) => {
    setSettings(s);
    setTimezone(s.timezone);
    setLocale(s.locale);
    setDateFormat(s.dateFormat);
    setTimeFormat(s.timeFormat);
    setDefaultInterviewLanguage(s.defaultInterviewLanguage);
  };

  const fetchSettings = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await organizationApi.getSettings(organizationId);
      applySettings(response.data.settings);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load organization settings');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing) fetchSettings();
  }, [isSyncing, fetchSettings]);

  const isDirty =
    !!settings &&
    (timezone !== settings.timezone ||
      locale !== settings.locale ||
      dateFormat !== settings.dateFormat ||
      timeFormat !== settings.timeFormat ||
      defaultInterviewLanguage !== settings.defaultInterviewLanguage);

  // Simple unsaved-changes guard for a tab close/refresh — no package needed.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!timezone.trim()) errors.timezone = 'Timezone is required';
    if (!locale.trim()) errors.locale = 'Locale is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!organizationId || !validate()) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await organizationApi.updateSettings(organizationId, {
        timezone: timezone.trim(),
        locale: locale.trim(),
        dateFormat,
        timeFormat,
        defaultInterviewLanguage,
      });
      applySettings(response.data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update organization settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    if (settings) applySettings(settings);
    setFieldErrors({});
    setSaveError(null);
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

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-2xl">
        <div className="page-header">
          <h1 className="page-title">Organization Settings</h1>
          <p className="page-subtitle">Regional and display preferences for {activeOrganization.name}.</p>
        </div>

        {activeOrganization.status === 'archived' && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
            <Archive size={18} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-future-warning">
              This organization is archived. Settings are read-only.
            </p>
          </div>
        )}

        {!canEdit && activeOrganization.status !== 'archived' && (
          <div className="flex items-start gap-2.5 bg-mentor-surface dark:bg-future-elevated border border-mentor-border dark:border-future-border rounded-lg p-4 mb-6">
            <AlertCircle size={18} className="text-mentor-text-muted mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-text-secondary">
              You don't have permission to change these settings. Showing current values.
            </p>
          </div>
        )}

        <div className="card">
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading settings...</p>
            </div>
          ) : loadError ? (
            <div className="p-10 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load settings</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{loadError}</p>
              <button onClick={fetchSettings} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{saveError}</p>
                </div>
              )}
              {saved && (
                <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3">
                  <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-success">Settings saved.</p>
                </div>
              )}

              <div>
                <label htmlFor="timezone" className="label">
                  Timezone
                </label>
                <input
                  id="timezone"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!canEdit}
                  className={`input ${fieldErrors.timezone ? 'input-error' : ''}`}
                  placeholder="e.g. Asia/Kolkata"
                />
                {fieldErrors.timezone && <p className="field-error">{fieldErrors.timezone}</p>}
              </div>

              <div>
                <label htmlFor="locale" className="label">
                  Locale
                </label>
                <input
                  id="locale"
                  type="text"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  disabled={!canEdit}
                  className={`input ${fieldErrors.locale ? 'input-error' : ''}`}
                  placeholder="e.g. en-IN"
                />
                {fieldErrors.locale && <p className="field-error">{fieldErrors.locale}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dateFormat" className="label">
                    Date Format
                  </label>
                  <select
                    id="dateFormat"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value as OrganizationDateFormat)}
                    disabled={!canEdit}
                    className="input"
                  >
                    {ORGANIZATION_DATE_FORMATS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="timeFormat" className="label">
                    Time Format
                  </label>
                  <select
                    id="timeFormat"
                    value={timeFormat}
                    onChange={(e) => setTimeFormat(e.target.value as OrganizationTimeFormat)}
                    disabled={!canEdit}
                    className="input"
                  >
                    {ORGANIZATION_TIME_FORMATS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="defaultInterviewLanguage" className="label">
                  Default Interview Language
                </label>
                <select
                  id="defaultInterviewLanguage"
                  value={defaultInterviewLanguage}
                  onChange={(e) => setDefaultInterviewLanguage(e.target.value)}
                  disabled={!canEdit}
                  className="input"
                >
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </div>

              {canEdit && (
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={handleSave} disabled={saving || !isDirty} className="btn btn-primary">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={handleReset} disabled={saving || !isDirty} className="btn btn-secondary">
                    Reset
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default OrganizationSettingsPage;
