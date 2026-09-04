import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  InstituteStudent,
  InstituteCourse,
  InstituteBranch,
  InstituteBatch,
  StudentPayload,
} from '../../api/instituteApi';
import { AlertCircle, Loader2, ArrowLeft, CheckCircle2, Link2, Unlink, Trash2 } from 'lucide-react';

const InstituteStudentDetailPage: React.FC = () => {
  const { organizationId, studentId } = useParams<{ organizationId: string; studentId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [student, setStudent] = useState<InstituteStudent | null>(null);
  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [branches, setBranches] = useState<InstituteBranch[]>([]);
  const [batches, setBatches] = useState<InstituteBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<StudentPayload>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [linkUserId, setLinkUserId] = useState('');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canEdit = hasPermission('organization:update') && activeOrganization?.status !== 'archived';
  const selectedBatch = batches.find((b) => b.id === form.batchId);

  const applyStudent = (s: InstituteStudent) => {
    setStudent(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName || '',
      email: s.email || '',
      phone: s.phone || '',
      enrollmentNumber: s.enrollmentNumber || '',
      graduationYear: s.graduationYear ?? null,
      batchId: s.batchId || '',
      courseId: s.courseId || '',
      branchId: s.branchId || '',
    });
  };

  const fetchAll = useCallback(async () => {
    if (!organizationId || !studentId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [studentResponse, coursesResponse, branchesResponse, batchesResponse] = await Promise.all([
        instituteApi.getStudent(organizationId, studentId),
        instituteApi.listCourses(organizationId, { limit: 100 }),
        instituteApi.listBranches(organizationId, { limit: 100 }),
        instituteApi.listBatches(organizationId, { limit: 100 }),
      ]);
      applyStudent(studentResponse.data.student);
      setCourses(coursesResponse.data.courses);
      setBranches(branchesResponse.data.branches);
      setBatches(batchesResponse.data.batches);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load student');
    } finally {
      setLoading(false);
    }
  }, [organizationId, studentId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') fetchAll();
  }, [isSyncing, activeOrganization, fetchAll]);

  const handleBatchChange = (batchId: string) => {
    const batch = batches.find((b) => b.id === batchId);
    setForm((f) => ({
      ...f,
      batchId,
      courseId: batch ? batch.courseId : f.courseId,
      branchId: batch ? batch.branchId || f.branchId : f.branchId,
    }));
  };

  const handleSave = async () => {
    if (!organizationId || !studentId) return;
    if (!form.firstName?.trim()) {
      setSaveError('First name is required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await instituteApi.updateStudent(organizationId, studentId, {
        ...form,
        lastName: form.lastName || null,
        email: form.email || null,
        phone: form.phone || null,
        enrollmentNumber: form.enrollmentNumber || null,
        graduationYear: form.graduationYear || null,
        batchId: form.batchId || null,
        courseId: form.courseId || null,
        branchId: form.branchId || null,
      });
      applyStudent(response.data.student);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update student');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!organizationId || !studentId || !student) return;
    if (!window.confirm(`Deactivate ${student.firstName} ${student.lastName || ''}`.trim() + '?')) return;
    setSaveError(null);
    try {
      await instituteApi.deactivateStudent(organizationId, studentId);
      fetchAll();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to deactivate student');
    }
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !studentId) return;
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      const response = await instituteApi.linkStudentUser(organizationId, studentId, linkUserId.trim() || undefined);
      applyStudent(response.data.student);
      setLinkUserId('');
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link user account');
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleUnlink = async () => {
    if (!organizationId || !studentId) return;
    if (!window.confirm('Unlink this student from their user account?')) return;
    setLinkError(null);
    try {
      const response = await instituteApi.unlinkStudentUser(organizationId, studentId);
      applyStudent(response.data.student);
    } catch (err: any) {
      setLinkError(err.message || 'Failed to unlink user account');
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
          onClick={() => navigate(`/organizations/${organizationId}/institute/students`)}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ArrowLeft size={16} />
          Back to Students
        </button>

        {loading ? (
          <div className="card p-10 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading student...</p>
          </div>
        ) : loadError || !student ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load student</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{loadError || 'Student not found'}</p>
            <button onClick={fetchAll} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="page-header flex items-center justify-between gap-4">
              <div>
                <h1 className="page-title">
                  {student.firstName} {student.lastName}
                </h1>
                <p className="page-subtitle">Student details for {activeOrganization.name}.</p>
              </div>
              <span className={`badge ${student.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                {student.status}
              </span>
            </div>

            <div className="card mb-6">
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-5">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{saveError}</p>
                </div>
              )}
              {saved && (
                <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-5">
                  <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-success">Student saved.</p>
                </div>
              )}

              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">First Name</label>
                    <input
                      type="text"
                      value={form.firstName || ''}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      disabled={!canEdit}
                      className="input"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="label">Last Name</label>
                    <input
                      type="text"
                      value={form.lastName || ''}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      disabled={!canEdit}
                      className="input"
                      maxLength={100}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      value={form.email || ''}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      disabled={!canEdit}
                      className="input"
                      maxLength={254}
                    />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input
                      type="text"
                      value={form.phone || ''}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      disabled={!canEdit}
                      className="input"
                      maxLength={30}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Enrollment Number</label>
                    <input
                      type="text"
                      value={form.enrollmentNumber || ''}
                      onChange={(e) => setForm((f) => ({ ...f, enrollmentNumber: e.target.value }))}
                      disabled={!canEdit}
                      className="input"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="label">Graduation Year</label>
                    <input
                      type="number"
                      value={form.graduationYear ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, graduationYear: e.target.value === '' ? null : Number(e.target.value) }))
                      }
                      disabled={!canEdit}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Batch</label>
                    <select
                      value={form.batchId || ''}
                      onChange={(e) => handleBatchChange(e.target.value)}
                      disabled={!canEdit}
                      className="input"
                    >
                      <option value="">No batch</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Course {selectedBatch ? '(set by batch)' : ''}</label>
                    <select
                      value={form.courseId || ''}
                      onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                      disabled={!canEdit || !!selectedBatch}
                      className="input"
                    >
                      <option value="">No course</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Branch {selectedBatch?.branchId ? '(set by batch)' : ''}</label>
                    <select
                      value={form.branchId || ''}
                      onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                      disabled={!canEdit || !!selectedBatch?.branchId}
                      className="input"
                    >
                      <option value="">No branch</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    {student.status === 'active' && (
                      <button onClick={handleDeactivate} className="btn btn-secondary">
                        <Trash2 size={16} />
                        Deactivate Student
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Account linking */}
            <div className="card">
              <h2 className="section-title mb-4">User Account</h2>

              {linkError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{linkError}</p>
                </div>
              )}

              {student.accountLinked ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-info">
                      <Link2 size={11} />
                      Linked
                    </span>
                    <span className="text-sm text-mentor-text-secondary">User ID: {student.userId}</span>
                  </div>
                  {canEdit && (
                    <button onClick={handleUnlink} className="btn btn-secondary">
                      <Unlink size={16} />
                      Unlink Account
                    </button>
                  )}
                </div>
              ) : canEdit ? (
                <form onSubmit={handleLink} className="space-y-3">
                  <p className="helper-text">
                    Link this student to an existing, active user account. Provide the account's User ID, or leave blank
                    to try matching by the student's email on file{student.email ? ` (${student.email})` : ''}.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={linkUserId}
                      onChange={(e) => setLinkUserId(e.target.value)}
                      placeholder="User ID (optional if email matches)"
                      className="input flex-1"
                    />
                    <button type="submit" disabled={linkSubmitting} className="btn btn-primary shrink-0">
                      {linkSubmitting ? 'Linking...' : 'Link Account'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-mentor-text-secondary">Not linked to a user account.</p>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteStudentDetailPage;
