import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerIntegrationConnection,
  EmployerIntegrationType,
  EmployerIntegrationProvider,
  EmployerIntegrationDelivery,
} from '../../api/employerApi';
import { AlertCircle, Loader2, Plug, Plus, X } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = { active: 'badge-success', disabled: 'badge-neutral', error: 'badge-warning' };

const PROVIDERS_BY_TYPE: Record<EmployerIntegrationType, EmployerIntegrationProvider[]> = {
  webhook: ['generic'],
  ats: ['custom', 'greenhouse', 'lever', 'workday'],
  calendar: ['google_calendar', 'microsoft_calendar'],
};
const SUPPORTED_PROVIDERS: EmployerIntegrationProvider[] = ['generic', 'custom'];

const EVENT_TYPE_OPTIONS = [
  'application_status_changed',
  'interview_invited',
  'interview_completed',
  'interview_finalized',
  'report_ready',
  'coding_completed',
  'scenario_completed',
];

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

/**
 * Organization-scoped external integration settings (31D/31E) —
 * provider-neutral. Only `webhook`/`generic` and `ats`/`custom` are
 * genuinely functional; every other provider is clearly shown as not yet
 * implemented. Never displays a stored secret.
 */
const EmployerIntegrationsPage: React.FC = () => {
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

  const [connections, setConnections] = useState<EmployerIntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<EmployerIntegrationType>('webhook');
  const [formProvider, setFormProvider] = useState<EmployerIntegrationProvider>('generic');
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formEventTypes, setFormEventTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newSecretByConnectionId, setNewSecretByConnectionId] = useState<Record<string, string>>({});

  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionErrorById, setActionErrorById] = useState<Record<string, string>>({});

  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null);
  const [deliveriesByConnection, setDeliveriesByConnection] = useState<Record<string, EmployerIntegrationDelivery[]>>({});
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('organization:update') && activeOrganization?.status !== 'archived';

  const fetchConnections = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.listEmployerIntegrationConnections(organizationId);
      setConnections(response.data.connections);
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchConnections();
    }
  }, [isSyncing, activeOrganization, canView, fetchConnections]);

  const resetForm = () => {
    setFormType('webhook');
    setFormProvider('generic');
    setFormName('');
    setFormBaseUrl('');
    setFormEventTypes([]);
    setSaveError(null);
  };

  const handleChangeType = (type: EmployerIntegrationType) => {
    setFormType(type);
    setFormProvider(PROVIDERS_BY_TYPE[type][0]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await employerApi.createEmployerIntegrationConnection(organizationId, {
        type: formType,
        provider: formProvider,
        name: formName,
        config: {
          baseUrl: formBaseUrl || undefined,
          enabledEventTypes: formEventTypes.length > 0 ? formEventTypes : undefined,
        },
      });
      if (response.data.signingSecret) {
        setNewSecretByConnectionId((prev) => ({ ...prev, [response.data.id]: response.data.signingSecret! }));
      }
      setShowForm(false);
      resetForm();
      fetchConnections();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to create integration');
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async (connectionId: string) => {
    if (!organizationId) return;
    setActionPendingId(connectionId);
    setActionErrorById((prev) => ({ ...prev, [connectionId]: '' }));
    try {
      await employerApi.validateEmployerIntegrationConnection(organizationId, connectionId);
      fetchConnections();
    } catch (err: any) {
      setActionErrorById((prev) => ({ ...prev, [connectionId]: err.message || 'Validation failed' }));
    } finally {
      setActionPendingId(null);
    }
  };

  const handleTest = async (connectionId: string) => {
    if (!organizationId) return;
    setActionPendingId(connectionId);
    setActionErrorById((prev) => ({ ...prev, [connectionId]: '' }));
    try {
      const response = await employerApi.testEmployerIntegrationConnection(organizationId, connectionId);
      if (!response.data.success) {
        setActionErrorById((prev) => ({ ...prev, [connectionId]: response.data.errorMessage || 'Test event failed' }));
      }
    } catch (err: any) {
      setActionErrorById((prev) => ({ ...prev, [connectionId]: err.message || 'Test event failed' }));
    } finally {
      setActionPendingId(null);
    }
  };

  const handleDisable = async (connectionId: string) => {
    if (!organizationId) return;
    if (!window.confirm('Disable this integration? It will stop receiving events.')) return;
    setActionPendingId(connectionId);
    try {
      await employerApi.disableEmployerIntegrationConnection(organizationId, connectionId);
      fetchConnections();
    } catch (err: any) {
      setActionErrorById((prev) => ({ ...prev, [connectionId]: err.message || 'Failed to disable' }));
    } finally {
      setActionPendingId(null);
    }
  };

  const handleToggleDeliveries = async (connectionId: string) => {
    if (expandedConnectionId === connectionId) {
      setExpandedConnectionId(null);
      return;
    }
    setExpandedConnectionId(connectionId);
    if (!organizationId || deliveriesByConnection[connectionId]) return;
    setDeliveriesLoading(true);
    try {
      const response = await employerApi.listEmployerIntegrationDeliveries(organizationId, connectionId);
      setDeliveriesByConnection((prev) => ({ ...prev, [connectionId]: response.data.deliveries }));
    } catch {
      // Non-critical — the connection card still renders without delivery history.
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleRetryDelivery = async (connectionId: string, deliveryId: string) => {
    if (!organizationId) return;
    try {
      await employerApi.retryEmployerIntegrationDelivery(organizationId, connectionId, deliveryId);
      const response = await employerApi.listEmployerIntegrationDeliveries(organizationId, connectionId);
      setDeliveriesByConnection((prev) => ({ ...prev, [connectionId]: response.data.deliveries }));
    } catch {
      // Surfaced via the delivery's own persisted status on next load.
    }
  };

  if (isSyncing || contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <Loader2 className="w-9 h-9 text-primary-600 animate-spin" />
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
            <p className="text-sm text-mentor-text-secondary mb-6">{contextError || "You don't have access to this organization."}</p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (activeOrganization.type !== 'company' || !canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <p className="text-sm text-mentor-text-secondary">You don't have access to integrations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  const sections: Array<{ type: EmployerIntegrationType; title: string }> = [
    { type: 'webhook', title: 'Webhooks' },
    { type: 'ats', title: 'ATS' },
    { type: 'calendar', title: 'Calendar' },
  ];

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h1 className="page-title flex items-center gap-2">
            <Plug size={20} className="text-mentor-text-muted" />
            Integrations
          </h1>
          {canManage && !showForm && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary">
              <Plus size={16} />
              Add Integration
            </button>
          )}
        </div>
        <p className="text-sm text-mentor-text-secondary mb-6">
          Connect hiring workflows to external webhooks, ATS, and calendar systems. Only generic webhooks and custom
          webhook-compatible ATS endpoints deliver today — other providers are shown as not yet implemented.
        </p>

        {showForm && (
          <form onSubmit={handleCreate} className="card mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base">Add Integration</h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-mentor-text-muted hover:text-mentor-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select value={formType} onChange={(e) => handleChangeType(e.target.value as EmployerIntegrationType)} className="input">
                  <option value="webhook">Webhook</option>
                  <option value="ats">ATS</option>
                  <option value="calendar">Calendar</option>
                </select>
              </div>
              <div>
                <label className="label">Provider</label>
                <select value={formProvider} onChange={(e) => setFormProvider(e.target.value as EmployerIntegrationProvider)} className="input">
                  {PROVIDERS_BY_TYPE[formType].map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, ' ')} {SUPPORTED_PROVIDERS.includes(p) ? '' : '(not yet implemented)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Name</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} className="input" maxLength={200} placeholder="e.g. Slack notifier" />
            </div>
            {SUPPORTED_PROVIDERS.includes(formProvider) && (
              <>
                <div>
                  <label className="label">Endpoint URL</label>
                  <input
                    value={formBaseUrl}
                    onChange={(e) => setFormBaseUrl(e.target.value)}
                    className="input"
                    maxLength={2048}
                    placeholder="https://example.com/webhooks/enterskill"
                  />
                </div>
                <div>
                  <label className="label mb-1.5">Event Types (leave empty for all)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {EVENT_TYPE_OPTIONS.map((et) => (
                      <label key={et} className="flex items-center gap-1.5 text-xs text-mentor-text">
                        <input
                          type="checkbox"
                          checked={formEventTypes.includes(et)}
                          onChange={(e) =>
                            setFormEventTypes((prev) => (e.target.checked ? [...prev, et] : prev.filter((x) => x !== et)))
                          }
                        />
                        {et.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
            {saveError && <p className="text-sm text-mentor-error">{saveError}</p>}
            <button type="submit" disabled={saving || !formName.trim()} className="btn btn-primary">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
            <p className="text-sm text-mentor-text-secondary mb-4">{error}</p>
            <button onClick={fetchConnections} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          sections.map(({ type, title }) => {
            const typeConnections = connections.filter((c) => c.type === type);
            return (
              <div key={type} className="card mb-6">
                <h2 className="section-title mb-3">{title}</h2>
                {typeConnections.length === 0 ? (
                  <p className="text-sm text-mentor-text-secondary text-center py-4">No {title.toLowerCase()} connections yet.</p>
                ) : (
                  <div className="space-y-3">
                    {typeConnections.map((c) => {
                      const isSupported = SUPPORTED_PROVIDERS.includes(c.provider);
                      const isWebhookCapable = (c.type === 'webhook' && c.provider === 'generic') || (c.type === 'ats' && c.provider === 'custom');
                      return (
                        <div key={c.id} className="surface-muted p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <div>
                              <p className="text-sm font-medium text-mentor-text">{c.name}</p>
                              <p className="text-xs text-mentor-text-muted capitalize">
                                {c.provider.replace(/_/g, ' ')} {!isSupported && '· not yet implemented'}
                              </p>
                            </div>
                            <span className={`badge ${STATUS_BADGE[c.status] || 'badge-neutral'}`}>{c.status}</span>
                          </div>
                          {c.config.baseUrl && <p className="text-xs text-mentor-text-secondary break-all">{c.config.baseUrl}</p>}
                          <p className="text-xs text-mentor-text-muted mt-1">
                            Last validated: {formatDate(c.lastValidatedAt)}
                            {c.lastError && <span className="text-mentor-warning"> · {c.lastError}</span>}
                          </p>
                          {c.type === 'ats' && typeof c.mappingCount === 'number' && (
                            <p className="text-xs text-mentor-text-muted">{c.mappingCount} entity mapping(s)</p>
                          )}
                          {newSecretByConnectionId[c.id] && (
                            <div className="surface-muted p-2 mt-2 text-xs">
                              <p className="font-medium text-mentor-warning mb-1">
                                Signing secret (shown once — copy it now, it cannot be retrieved again):
                              </p>
                              <code className="break-all">{newSecretByConnectionId[c.id]}</code>
                            </div>
                          )}
                          {actionErrorById[c.id] && <p className="text-xs text-mentor-error mt-1">{actionErrorById[c.id]}</p>}

                          {canManage && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-2">
                              <button
                                onClick={() => handleValidate(c.id)}
                                disabled={actionPendingId === c.id}
                                className="btn btn-secondary px-2 py-1 text-xs"
                              >
                                Validate
                              </button>
                              {isWebhookCapable && (
                                <button
                                  onClick={() => handleTest(c.id)}
                                  disabled={actionPendingId === c.id}
                                  className="btn btn-secondary px-2 py-1 text-xs"
                                >
                                  Test
                                </button>
                              )}
                              {c.status !== 'disabled' && (
                                <button
                                  onClick={() => handleDisable(c.id)}
                                  disabled={actionPendingId === c.id}
                                  className="btn btn-secondary px-2 py-1 text-xs"
                                >
                                  Disable
                                </button>
                              )}
                              {isWebhookCapable && (
                                <button onClick={() => handleToggleDeliveries(c.id)} className="btn btn-secondary px-2 py-1 text-xs">
                                  {expandedConnectionId === c.id ? 'Hide Deliveries' : 'Recent Deliveries'}
                                </button>
                              )}
                            </div>
                          )}

                          {expandedConnectionId === c.id && (
                            <div className="mt-3 pt-3 border-t border-mentor-border">
                              {deliveriesLoading ? (
                                <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                              ) : (deliveriesByConnection[c.id]?.length ?? 0) === 0 ? (
                                <p className="text-xs text-mentor-text-muted">No deliveries yet.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-mentor-text-muted border-b border-mentor-border">
                                        <th className="py-1 pr-2">Event</th>
                                        <th className="py-1 pr-2">Status</th>
                                        <th className="py-1 pr-2">Attempts</th>
                                        <th className="py-1 pr-2">HTTP</th>
                                        <th className="py-1 pr-2">Last Attempt</th>
                                        <th className="py-1 pr-2">Delivered</th>
                                        {canManage && <th className="py-1 pr-2" />}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {deliveriesByConnection[c.id]!.map((d) => (
                                        <tr key={d.id} className="border-b border-mentor-border last:border-0">
                                          <td className="py-1.5 pr-2 text-mentor-text">{d.eventType.replace(/_/g, ' ')}</td>
                                          <td className="py-1.5 pr-2">
                                            <span
                                              className={`badge ${d.status === 'delivered' ? 'badge-success' : d.status === 'pending' || d.status === 'processing' ? 'badge-neutral' : 'badge-warning'}`}
                                            >
                                              {d.status.replace(/_/g, ' ')}
                                            </span>
                                          </td>
                                          <td className="py-1.5 pr-2 text-mentor-text-secondary">{d.attemptCount}</td>
                                          <td className="py-1.5 pr-2 text-mentor-text-secondary">{d.responseStatus ?? '—'}</td>
                                          <td className="py-1.5 pr-2 text-mentor-text-secondary whitespace-nowrap">{formatDate(d.lastAttemptAt)}</td>
                                          <td className="py-1.5 pr-2 text-mentor-text-secondary whitespace-nowrap">{formatDate(d.deliveredAt)}</td>
                                          {canManage && (
                                            <td className="py-1.5 pr-2">
                                              {(d.status === 'failed' || d.status === 'dead_letter') && (
                                                <button
                                                  onClick={() => handleRetryDelivery(c.id, d.id)}
                                                  className="btn btn-secondary px-2 py-0.5 text-xs"
                                                >
                                                  Retry
                                                </button>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerIntegrationsPage;
