import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  Trainer,
  TrainerProfilePayload,
  TrainerAssignment,
  InstituteCourse,
  InstituteBatch,
} from '../../api/instituteApi';
import { AlertCircle, Loader2, ArrowLeft, CheckCircle2, Plus, Trash2 } from 'lucide-react';

const InstituteTrainerDetailPage: React.FC = () => {
  const { organizationId, membershipId } = useParams<{ organizationId: string; membershipId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<TrainerProfilePayload & { specializationText?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [assignments, setAssignments] = useState<TrainerAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [batches, setBatches] = useState<InstituteBatch[]>([]);

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignTarget, setAssignTarget] = useState<'course' | 'batch'>('course');
  const [assignId, setAssignId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canManage = hasPermission('members:manage') && activeOrganization?.status !== 'archived';
  const courseName = (id?: string) => courses.find((c) => c.id === id)?.name;
  const batchName = (id?: string) => batches.find((b) => b.id === id)?.name;

  const applyTrainer = (t: Trainer) => {
    setTrainer(t);
    setForm({
      employeeCode: t.profile?.employeeCode || '',
      designation: t.profile?.designation || '',
      department: t.profile?.department || '',
      specializationText: t.profile?.specialization?.join(', ') || '',
      bio: t.profile?.bio || '',
    });
  };

  const fetchTrainer = useCallback(async () => {
    if (!organizationId || !membershipId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await instituteApi.getTrainer(organizationId, membershipId);
      applyTrainer(response.data.trainer);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load trainer');
    } finally {
      setLoading(false);
    }
  }, [organizationId, membershipId]);

  const fetchAssignments = useCallback(async () => {
    if (!organizationId || !membershipId) return;
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const [assignmentsResponse, coursesResponse, batchesResponse] = await Promise.all([
        instituteApi.listTrainerAssignments(organizationId, membershipId, { limit: 100 }),
        instituteApi.listCourses(organizationId, { limit: 100 }),
        instituteApi.listBatches(organizationId, { limit: 100 }),
      ]);
      setAssignments(assignmentsResponse.data.assignments);
      setCourses(coursesResponse.data.courses);
      setBatches(batchesResponse.data.batches);
    } catch (err: any) {
      setAssignmentsError(err.message || 'Failed to load teaching assignments');
    } finally {
      setAssignmentsLoading(false);
    }
  }, [organizationId, membershipId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') {
      fetchTrainer();
      fetchAssignments();
    }
  }, [isSyncing, activeOrganization, fetchTrainer, fetchAssignments]);

  const handleSave = async () => {
    if (!organizationId || !membershipId) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const specialization = (form.specializationText || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const response = await instituteApi.updateTrainerProfile(organizationId, membershipId, {
        employeeCode: form.employeeCode || undefined,
        designation: form.designation || undefined,
        department: form.department || undefined,
        specialization: specialization.length > 0 ? specialization : undefined,
        bio: form.bio || undefined,
      });
      applyTrainer(response.data.trainer);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update trainer profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !membershipId) return;
    if (!assignId) {
      setAssignError(`Select a ${assignTarget}`);
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      await instituteApi.createTrainerAssignment(organizationId, membershipId, {
        courseId: assignTarget === 'course' ? assignId : undefined,
        batchId: assignTarget === 'batch' ? assignId : undefined,
      });
      setShowAssignForm(false);
      setAssignId('');
      fetchAssignments();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to create teaching assignment');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleDeleteAssignment = async (assignment: TrainerAssignment) => {
    if (!organizationId || !membershipId) return;
    const label = assignment.courseId ? courseName(assignment.courseId) : batchName(assignment.batchId);
    if (!window.confirm(`Remove teaching assignment for "${label || 'this target'}"?`)) return;
    setAssignmentsError(null);
    try {
      await instituteApi.deleteTrainerAssignment(organizationId, membershipId, assignment.assignmentId);
      fetchAssignments();
    } catch (err: any) {
      setAssignmentsError(err.message || 'Failed to delete teaching assignment');
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

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <button
          onClick={() => navigate(`/organizations/${organizationId}/institute/trainers`)}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ArrowLeft size={16} />
          Back to Trainers
        </button>

        {loading ? (
          <div className="card p-10 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading trainer...</p>
          </div>
        ) : loadError || !trainer ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load trainer</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{loadError || 'Trainer not found'}</p>
            <button onClick={fetchTrainer} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="page-header flex items-center justify-between gap-4">
              <div>
                <h1 className="page-title">{trainer.user?.name || 'Unknown user'}</h1>
                <p className="page-subtitle">{trainer.user?.email || '—'}</p>
              </div>
              <span className={`badge ${trainer.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                {trainer.status}
              </span>
            </div>

            <div className="card mb-6">
              <h2 className="section-title mb-4">Trainer Profile</h2>
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-5">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{saveError}</p>
                </div>
              )}
              {saved && (
                <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-5">
                  <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-success">Profile saved.</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Employee Code</label>
                    <input
                      type="text"
                      value={form.employeeCode || ''}
                      onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
                      disabled={!canManage}
                      className="input"
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label className="label">Designation</label>
                    <input
                      type="text"
                      value={form.designation || ''}
                      onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                      disabled={!canManage}
                      className="input"
                      maxLength={150}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Department</label>
                    <input
                      type="text"
                      value={form.department || ''}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                      disabled={!canManage}
                      className="input"
                      maxLength={150}
                    />
                  </div>
                  <div>
                    <label className="label">Specialization (comma-separated)</label>
                    <input
                      type="text"
                      value={form.specializationText || ''}
                      onChange={(e) => setForm((f) => ({ ...f, specializationText: e.target.value }))}
                      disabled={!canManage}
                      className="input"
                      placeholder="e.g. React, System Design"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Bio</label>
                  <textarea
                    value={form.bio || ''}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    disabled={!canManage}
                    className="input"
                    rows={3}
                    maxLength={1000}
                  />
                </div>
                {canManage && (
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                )}
              </div>
            </div>

            {/* Teaching Assignments */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Teaching Assignments</h2>
                {canManage && trainer.status === 'active' && (
                  <button onClick={() => setShowAssignForm((v) => !v)} className="btn btn-primary">
                    <Plus size={16} />
                    Add Assignment
                  </button>
                )}
              </div>

              {showAssignForm && (
                <form onSubmit={handleCreateAssignment} className="surface-muted p-4 mb-4 space-y-3">
                  {assignError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{assignError}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={assignTarget === 'course'}
                        onChange={() => {
                          setAssignTarget('course');
                          setAssignId('');
                        }}
                      />
                      Course
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={assignTarget === 'batch'}
                        onChange={() => {
                          setAssignTarget('batch');
                          setAssignId('');
                        }}
                      />
                      Batch
                    </label>
                  </div>
                  <select value={assignId} onChange={(e) => setAssignId(e.target.value)} className="input">
                    <option value="">Select {assignTarget}</option>
                    {(assignTarget === 'course' ? courses : batches).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={assignSubmitting} className="btn btn-primary">
                      {assignSubmitting ? 'Adding...' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setShowAssignForm(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {assignmentsError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{assignmentsError}</p>
                </div>
              )}

              {assignmentsLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : assignments.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No teaching assignments yet.</p>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {assignments.map((assignment) => (
                    <div key={assignment.assignmentId} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <span className="badge badge-info">{assignment.courseId ? 'Course' : 'Batch'}</span>
                        <span className="text-sm text-mentor-text ml-2">
                          {assignment.courseId ? courseName(assignment.courseId) : batchName(assignment.batchId)}
                        </span>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => handleDeleteAssignment(assignment)}
                          className="btn btn-secondary px-3 py-1.5 text-xs"
                          aria-label="Remove assignment"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteTrainerDetailPage;
