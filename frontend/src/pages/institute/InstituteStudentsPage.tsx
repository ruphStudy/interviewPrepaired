import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  InstituteStudent,
  InstituteCourse,
  InstituteBranch,
  InstituteBatch,
  InstituteEntityStatus,
  StudentPayload,
  BulkCreateStudentsResult,
  BulkAssignStudentsResult,
  PeopleImportPreviewResult,
  PeopleImportCommitResult,
} from '../../api/instituteApi';
import {
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Link2,
  Upload,
  Users,
  FileUp,
  Download,
  X,
} from 'lucide-react';

const PAGE_LIMIT = 20;
const MAX_BULK_ROWS = 200;

const EMPTY_STUDENT_FORM: StudentPayload = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  enrollmentNumber: '',
  graduationYear: null,
  batchId: '',
  courseId: '',
  branchId: '',
};

interface BulkRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  enrollmentNumber: string;
  graduationYear: string;
}

function parseBulkText(text: string): BulkRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_BULK_ROWS)
    .map((line) => {
      const [firstName = '', lastName = '', email = '', phone = '', enrollmentNumber = '', graduationYear = ''] = line
        .split(',')
        .map((v) => v.trim());
      return { firstName, lastName, email, phone, enrollmentNumber, graduationYear };
    });
}

const PEOPLE_IMPORT_ROW_STATUS_LABEL: Record<string, string> = {
  valid_new_user: 'New account',
  valid_existing_user: 'Existing account',
  already_existed: 'Already exists',
  conflict: 'Conflict',
  duplicate_in_file: 'Duplicate in file',
  invalid: 'Invalid',
};

interface PeopleFileImportModalProps {
  organizationId: string;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Trainer + Student bulk CSV/XLSX import — stateless on the frontend too:
 * the same selected `File` object is re-sent for both preview and commit,
 * matching the backend's own "each call independently re-parses" design
 * (no server-side "confirm this preview" session to expire/race).
 */
const PeopleFileImportModal: React.FC<PeopleFileImportModalProps> = ({ organizationId, onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PeopleImportPreviewResult | null>(null);
  const [result, setResult] = useState<PeopleImportCommitResult | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const blob = await instituteApi.downloadPeopleImportTemplate(organizationId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'institute-people-import-template.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download template');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    setResult(null);
    try {
      const response = await instituteApi.previewPeopleImport(organizationId, file);
      setPreview(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to preview import');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setCommitting(true);
    setError(null);
    try {
      const response = await instituteApi.commitPeopleImport(organizationId, file);
      setResult(response.data);
      onImported();
    } catch (err: any) {
      setError(err.message || 'Failed to import');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title text-lg">Import Trainers &amp; Students</h2>
          <button onClick={onClose} className="text-mentor-text-muted hover:text-mentor-text" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <button type="button" onClick={handleDownloadTemplate} className="btn btn-secondary mb-4">
          <Download size={16} />
          Download Template
        </button>

        <div className="mb-4">
          <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="input w-full" />
          <p className="text-xs text-mentor-text-muted mt-1.5">
            Columns: name, email, userType (TRAINER or STUDENT). Up to 200 rows per file.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{error}</p>
          </div>
        )}

        {!result && (
          <div className="flex justify-end gap-2 mb-4">
            <button type="button" onClick={handlePreview} disabled={!file || previewing} className="btn btn-secondary">
              {previewing ? 'Previewing...' : 'Preview'}
            </button>
            {preview && (
              <button type="button" onClick={handleCommit} disabled={committing || preview.validRows === 0} className="btn btn-primary">
                {committing ? 'Importing...' : `Confirm Import (${preview.validRows} row${preview.validRows === 1 ? '' : 's'})`}
              </button>
            )}
          </div>
        )}

        {preview && !result && (
          <div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 text-center">
              {[
                ['Total', preview.totalRows],
                ['Valid', preview.validRows],
                ['Invalid', preview.invalidRows],
                ['New users', preview.newUsers],
                ['Existing users', preview.existingUsers],
                ['Duplicates', preview.duplicateRows],
                ['Trainers', preview.trainersCount],
                ['Students', preview.studentsCount],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-mentor-border px-2 py-2">
                  <div className="text-lg font-semibold text-mentor-text">{value}</div>
                  <div className="text-[11px] text-mentor-text-muted">{label}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto border border-mentor-border rounded-lg max-h-64 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-mentor-border bg-mentor-surface dark:bg-future-elevated">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-mentor-text-muted">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-mentor-text-muted">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-mentor-text-muted">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-mentor-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {preview.rows.map((row) => (
                    <tr key={row.index}>
                      <td className="px-3 py-1.5 text-mentor-text">{row.name}</td>
                      <td className="px-3 py-1.5 text-mentor-text-secondary">{row.email}</td>
                      <td className="px-3 py-1.5 text-mentor-text-secondary">{row.userType || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`badge ${
                            row.status === 'valid_new_user' || row.status === 'valid_existing_user'
                              ? 'badge-success'
                              : row.status === 'already_existed'
                              ? 'badge-info'
                              : 'badge-neutral'
                          }`}
                          title={row.reason}
                        >
                          {PEOPLE_IMPORT_ROW_STATUS_LABEL[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 text-center">
              {[
                ['Total', result.total],
                ['Created', result.created],
                ['Linked', result.linkedExisting],
                ['Invited', result.invited],
                ['Already existed', result.alreadyExisted],
                ['Conflicts', result.conflict],
                ['Failed', result.failed],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-mentor-border px-2 py-2">
                  <div className="text-lg font-semibold text-mentor-text">{value}</div>
                  <div className="text-[11px] text-mentor-text-muted">{label}</div>
                </div>
              ))}
            </div>
            {(result.failed > 0 || result.conflict > 0) && (
              <p className="text-xs text-mentor-text-muted mb-3">
                Failed/conflicting rows were not imported. Fix and re-upload the corrected rows — successfully imported rows will not be
                duplicated.
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InstituteStudentsPage: React.FC = () => {
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

  const [students, setStudents] = useState<InstituteStudent[]>([]);
  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [branches, setBranches] = useState<InstituteBranch[]>([]);
  const [batches, setBatches] = useState<InstituteBatch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InstituteEntityStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<StudentPayload>(EMPTY_STUDENT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showFileImport, setShowFileImport] = useState(false);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkCreateStudentsResult | null>(null);

  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ batchId: '', courseId: '', branchId: '' });
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<BulkAssignStudentsResult | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canEdit = hasPermission('organization:update') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const courseName = (id?: string) => courses.find((c) => c.id === id)?.name;
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name;
  const batchName = (id?: string) => batches.find((b) => b.id === id)?.name;
  const selectedBatch = batches.find((b) => b.id === form.batchId);

  const fetchOptions = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [coursesResponse, branchesResponse, batchesResponse] = await Promise.all([
        instituteApi.listCourses(organizationId, { limit: 100 }),
        instituteApi.listBranches(organizationId, { limit: 100 }),
        instituteApi.listBatches(organizationId, { limit: 100 }),
      ]);
      setCourses(coursesResponse.data.courses);
      setBranches(branchesResponse.data.branches);
      setBatches(batchesResponse.data.batches);
    } catch {
      // Non-fatal — filter/form option labels just won't populate.
    }
  }, [organizationId]);

  const fetchStudents = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listStudents(organizationId, {
        page,
        limit: PAGE_LIMIT,
        search: search || undefined,
        status: statusFilter || undefined,
        branchId: branchFilter || undefined,
        courseId: courseFilter || undefined,
        batchId: batchFilter || undefined,
      });
      setStudents(response.data.students);
      setTotal(response.data.pagination.total);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, search, statusFilter, branchFilter, courseFilter, batchFilter]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') {
      fetchOptions();
      fetchStudents();
    }
  }, [isSyncing, activeOrganization, fetchOptions, fetchStudents]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  const handleBatchChangeInForm = (batchId: string) => {
    const batch = batches.find((b) => b.id === batchId);
    setForm((f) => ({
      ...f,
      batchId,
      courseId: batch ? batch.courseId : f.courseId,
      branchId: batch ? batch.branchId || f.branchId : f.branchId,
    }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!form.firstName?.trim()) {
      setFormError('First name is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload: StudentPayload = {
      ...form,
      lastName: form.lastName || null,
      email: form.email || null,
      phone: form.phone || null,
      enrollmentNumber: form.enrollmentNumber || null,
      graduationYear: form.graduationYear || null,
      batchId: form.batchId || null,
      courseId: form.courseId || null,
      branchId: form.branchId || null,
    };
    try {
      await instituteApi.createStudent(organizationId, payload);
      setShowCreate(false);
      setForm(EMPTY_STUDENT_FORM);
      setPage(1);
      fetchStudents();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (student: InstituteStudent) => {
    if (!organizationId) return;
    if (!window.confirm(`Deactivate ${student.firstName} ${student.lastName || ''}?`.trim() + '?')) return;
    setActionError(null);
    try {
      await instituteApi.deactivateStudent(organizationId, student.id);
      fetchStudents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to deactivate student');
    }
  };

  /** Institute-scoped only — never touches the student's global EnterSkill account. */
  const handleReactivate = async (student: InstituteStudent) => {
    if (!organizationId) return;
    setActionError(null);
    try {
      await instituteApi.reactivateStudent(organizationId, student.id);
      fetchStudents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reactivate student');
    }
  };

  const bulkRows = useMemo(() => parseBulkText(bulkText), [bulkText]);

  const handleBulkImport = async () => {
    if (!organizationId) return;
    if (bulkRows.length === 0) {
      setBulkError('Enter at least one row');
      return;
    }
    setBulkSubmitting(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const response = await instituteApi.bulkCreateStudents(
        organizationId,
        bulkRows.map((row) => ({
          firstName: row.firstName,
          lastName: row.lastName || undefined,
          email: row.email || undefined,
          phone: row.phone || undefined,
          enrollmentNumber: row.enrollmentNumber || undefined,
          graduationYear: row.graduationYear ? Number(row.graduationYear) : undefined,
        }))
      );
      setBulkResult(response.data);
      fetchStudents();
    } catch (err: any) {
      setBulkError(err.message || 'Failed to bulk import students');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!assignForm.batchId && !assignForm.courseId && !assignForm.branchId) {
      setAssignError('Select at least one of batch, course, or branch');
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    setAssignResult(null);
    try {
      const response = await instituteApi.bulkAssignStudents(organizationId, {
        studentIds: Array.from(selectedIds),
        batchId: assignForm.batchId || undefined,
        courseId: assignForm.courseId || undefined,
        branchId: assignForm.branchId || undefined,
      });
      setAssignResult(response.data);
      fetchStudents();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to assign students');
    } finally {
      setAssignSubmitting(false);
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

  if (activeOrganization.type !== 'institute') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Students are only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Manage the student roster for {activeOrganization.name}.</p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mentor-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, enrollment #"
              className="input pl-9 w-64"
            />
          </div>
          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={batchFilter}
            onChange={(e) => {
              setBatchFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as InstituteEntityStatus | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>

          {canEdit && (
            <div className="flex items-center gap-2 ml-auto">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAssign((v) => !v);
                    setAssignResult(null);
                  }}
                  className="btn btn-secondary"
                >
                  <Users size={16} />
                  Assign Selected ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowBulk((v) => !v);
                  setBulkResult(null);
                }}
                className="btn btn-secondary"
              >
                <Upload size={16} />
                Bulk Add Students
              </button>
              <button type="button" onClick={() => setShowFileImport(true)} className="btn btn-secondary">
                <FileUp size={16} />
                Import File (CSV/XLSX)
              </button>
              <button type="button" onClick={() => setShowCreate((v) => !v)} className="btn btn-primary">
                <Plus size={16} />
                Add Student
              </button>
            </div>
          )}
        </form>

        {showFileImport && organizationId && (
          <PeopleFileImportModal
            organizationId={organizationId}
            onClose={() => setShowFileImport(false)}
            onImported={() => {
              fetchStudents();
            }}
          />
        )}

        {showCreate && (
          <form onSubmit={handleCreateSubmit} className="card mb-4 space-y-4">
            {formError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{formError}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">First Name</label>
                <input
                  type="text"
                  value={form.firstName || ''}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="input"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="label">Last Name (optional)</label>
                <input
                  type="text"
                  value={form.lastName || ''}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="input"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Email (optional)</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="input"
                  maxLength={254}
                />
              </div>
              <div>
                <label className="label">Phone (optional)</label>
                <input
                  type="text"
                  value={form.phone || ''}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="input"
                  maxLength={30}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Enrollment Number (optional)</label>
                <input
                  type="text"
                  value={form.enrollmentNumber || ''}
                  onChange={(e) => setForm((f) => ({ ...f, enrollmentNumber: e.target.value }))}
                  className="input"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="label">Graduation Year (optional)</label>
                <input
                  type="number"
                  value={form.graduationYear ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, graduationYear: e.target.value === '' ? null : Number(e.target.value) }))
                  }
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Batch (optional)</label>
                <select value={form.batchId || ''} onChange={(e) => handleBatchChangeInForm(e.target.value)} className="input">
                  <option value="">No batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Course {selectedBatch ? '(set by batch)' : '(optional)'}</label>
                <select
                  value={form.courseId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                  disabled={!!selectedBatch}
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
                <label className="label">Branch {selectedBatch?.branchId ? '(set by batch)' : '(optional)'}</label>
                <select
                  value={form.branchId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                  disabled={!!selectedBatch?.branchId}
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
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Creating...' : 'Create Student'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}

        {showBulk && (
          <div className="card mb-4 space-y-4">
            <div>
              <h3 className="section-title mb-1.5">Bulk Add Students</h3>
              <p className="helper-text">
                One student per line: <code>firstName,lastName,email,phone,enrollmentNumber,graduationYear</code> — only
                firstName is required, leave others blank between commas. Max {MAX_BULK_ROWS} rows.
              </p>
            </div>
            {bulkError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{bulkError}</p>
              </div>
            )}
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="input font-mono text-xs"
              rows={6}
              placeholder={'Jane,Doe,jane@example.com,9876543210,ENR001,2026\nJohn,,john@example.com,,,2027'}
            />
            <p className="helper-text">{bulkRows.length} row(s) parsed{bulkText && bulkRows.length >= MAX_BULK_ROWS ? ' (max reached)' : ''}.</p>

            {bulkResult && (
              <div className="surface-muted p-4">
                <p className="text-sm font-medium text-mentor-text mb-2">
                  {bulkResult.created} created, {bulkResult.failed} failed of {bulkResult.total}
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {bulkResult.results.map((row) => (
                    <div key={row.index} className="flex items-center gap-2 text-xs">
                      <span className={`badge ${row.status === 'created' ? 'badge-success' : 'badge-warning'}`}>
                        Row {row.index + 1}: {row.status}
                      </span>
                      {row.error && <span className="text-mentor-error">{row.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={handleBulkImport} disabled={bulkSubmitting} className="btn btn-primary">
                {bulkSubmitting ? 'Importing...' : 'Import Students'}
              </button>
              <button onClick={() => setShowBulk(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        )}

        {showAssign && (
          <form onSubmit={handleAssign} className="card mb-4 space-y-4">
            <p className="helper-text">
              Assign {selectedIds.size} selected student(s) to a batch/course/branch. At least one target is required;
              anything left blank keeps that student's current value.
            </p>
            {assignError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{assignError}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Batch</label>
                <select
                  value={assignForm.batchId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, batchId: e.target.value }))}
                  className="input"
                >
                  <option value="">Leave unchanged</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Course</label>
                <select
                  value={assignForm.courseId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, courseId: e.target.value }))}
                  className="input"
                >
                  <option value="">Leave unchanged</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Branch</label>
                <select
                  value={assignForm.branchId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, branchId: e.target.value }))}
                  className="input"
                >
                  <option value="">Leave unchanged</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {assignResult && (
              <div className="surface-muted p-4">
                <p className="text-sm font-medium text-mentor-text mb-2">
                  {assignResult.assigned} assigned, {assignResult.failed} failed of {assignResult.total}
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {assignResult.results.map((row) => (
                    <div key={row.studentId} className="flex items-center gap-2 text-xs">
                      <span className={`badge ${row.status === 'assigned' ? 'badge-success' : 'badge-warning'}`}>
                        {row.status}
                      </span>
                      {row.error && <span className="text-mentor-error">{row.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" disabled={assignSubmitting} className="btn btn-primary">
                {assignSubmitting ? 'Assigning...' : 'Assign'}
              </button>
              <button type="button" onClick={() => setShowAssign(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </form>
        )}

        {actionError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
          </div>
        )}

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading students...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load students</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchStudents} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : students.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No students match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    {canEdit && <th className="px-4 py-3 w-8"></th>}
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Enrollment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Course / Batch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Account
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                    {canEdit && (
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-mentor-surface dark:hover:bg-future-elevated">
                      {canEdit && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(student.id)}
                            onChange={() => toggleSelected(student.id)}
                          />
                        </td>
                      )}
                      <td
                        className="px-6 py-3 cursor-pointer"
                        onClick={() => navigate(`/organizations/${organizationId}/institute/students/${student.id}`)}
                      >
                        <div className="text-sm font-medium text-mentor-text">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="text-xs text-mentor-text-muted">{student.email || student.phone || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {student.enrollmentNumber || '—'}
                        {student.graduationYear ? ` · ${student.graduationYear}` : ''}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {courseName(student.courseId) || '—'}
                        {student.batchId ? ` · ${batchName(student.batchId) || '—'}` : ''}
                        {student.branchId ? ` · ${branchName(student.branchId) || '—'}` : ''}
                      </td>
                      <td className="px-6 py-3">
                        {student.accountLinked ? (
                          <span className="badge badge-info">
                            <Link2 size={11} />
                            Linked
                          </span>
                        ) : (
                          <span className="badge badge-neutral">Not linked</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${student.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                          {student.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-6 py-3 text-right">
                          {student.status === 'active' ? (
                            <button
                              onClick={() => handleDeactivate(student)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                              aria-label="Deactivate student"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(student)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                              aria-label="Reactivate student"
                            >
                              Reactivate
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

          {!loading && !error && total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
              <p className="text-xs text-mentor-text-muted">
                Page {page} of {totalPages} &middot; {total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteStudentsPage;
