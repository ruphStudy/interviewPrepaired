import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { TrainerReportAssignmentMeta, TrainerStudentRef } from '../../api/instituteApi';
import { InterviewReport } from '../../api/interviewApi';
import { AlertCircle, Loader2, ArrowLeft, CheckCircle2, XCircle, Lightbulb, GraduationCap } from 'lucide-react';

const getScoreColorClass = (score: number) => {
  if (score >= 8) return 'text-mentor-success';
  if (score >= 6) return 'text-primary-600';
  if (score >= 4) return 'text-mentor-warning';
  return 'text-mentor-error';
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

/**
 * Trainer-scoped interview report detail. Deliberately does NOT call the
 * personal `/interview/report/:interviewId` endpoint — the trainer does not
 * own that interview, so it uses the dedicated trainer-students report
 * endpoint (which itself re-verifies scope and calls
 * InterviewService.getInterviewReport server-side) as the sole source of
 * truth. Renders the same InterviewReport shape ReportDashboard uses, with
 * the same score-coloring convention, without duplicating its full
 * chart/tab UI.
 */
const TrainerStudentReportDetailPage: React.FC = () => {
  const { organizationId, studentId, assignmentId } = useParams<{
    organizationId: string;
    studentId: string;
    assignmentId: string;
  }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    activeRole,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [student, setStudent] = useState<TrainerStudentRef | null>(null);
  const [assignment, setAssignment] = useState<TrainerReportAssignmentMeta | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const isTrainer = activeRole === 'trainer';
  const canView = hasPermission('reports:view');

  const fetchDetail = useCallback(async () => {
    if (!organizationId || !studentId || !assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.getTrainerStudentReportDetail(organizationId, studentId, assignmentId);
      setStudent(response.data.student);
      setAssignment(response.data.assignment);
      setReport(response.data.report);
    } catch (err: any) {
      setError(err.message || 'Failed to load student report');
    } finally {
      setLoading(false);
    }
  }, [organizationId, studentId, assignmentId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && isTrainer && canView) {
      fetchDetail();
    }
  }, [isSyncing, activeOrganization, isTrainer, canView, fetchDetail]);

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
            <p className="text-sm text-mentor-text-secondary">The trainer portal is only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!isTrainer) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Trainer portal is available only to trainers</h2>
            <p className="text-sm text-mentor-text-secondary">Your role in {activeOrganization.name} does not have trainer access.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view student reports.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <button
          onClick={() => navigate(`/organizations/${organizationId}/trainer/students/${studentId}/reports`)}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ArrowLeft size={16} />
          Back to Reports
        </button>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading report...</p>
          </div>
        ) : error || !student || !assignment || !report ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load report</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'Report not available.'}</p>
            <button onClick={fetchDetail} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                    <GraduationCap size={18} className="text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg font-semibold text-mentor-text dark:text-future-text truncate">
                      {assignment.template?.name || 'Interview Report'}
                    </h1>
                    <p className="text-xs text-mentor-text-muted truncate">
                      {student.firstName} {student.lastName || ''}
                      {student.enrollmentNumber ? ` (${student.enrollmentNumber})` : ''} &middot; Completed{' '}
                      {formatDate(report.interview.completedAt)}
                    </p>
                  </div>
                </div>
                {report.finalReport && (
                  <div className="text-right shrink-0">
                    <div className={`text-3xl font-bold ${getScoreColorClass(report.finalReport.overallScore)}`}>
                      {report.finalReport.overallScore.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-mentor-text-muted">/ 10.0</div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="stat-tile">
                <div className="stat-tile-value">{report.statistics.averageScore.toFixed(1)}</div>
                <div className="stat-tile-label">Avg Score</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{report.statistics.completionRate}%</div>
                <div className="stat-tile-label">Completion</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">
                  {report.interview.answeredQuestions}/{report.interview.totalQuestions}
                </div>
                <div className="stat-tile-label">Questions</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{Math.round(report.statistics.totalDuration / 60)}m</div>
                <div className="stat-tile-label">Duration</div>
              </div>
            </div>

            {report.finalReport && (
              <div className="card">
                <h2 className="section-title mb-4">Summary</h2>
                <p className="text-sm text-mentor-text mb-5">{report.finalReport.summary}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-mentor-success mb-2">
                      <CheckCircle2 size={16} />
                      Strengths
                    </h3>
                    <ul className="space-y-1.5">
                      {report.finalReport.strengthsOverview.map((s, i) => (
                        <li key={i} className="text-sm text-mentor-text-secondary flex gap-2">
                          <span className="text-mentor-success">•</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-mentor-error mb-2">
                      <XCircle size={16} />
                      Weaknesses
                    </h3>
                    <ul className="space-y-1.5">
                      {report.finalReport.weaknessesOverview.map((w, i) => (
                        <li key={i} className="text-sm text-mentor-text-secondary flex gap-2">
                          <span className="text-mentor-error">•</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {report.finalReport.nextSteps.length > 0 && (
                  <div className="mt-6 surface-muted p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-mentor-text mb-2">
                      <Lightbulb size={16} className="text-primary-600" />
                      Recommendations
                    </h3>
                    <ul className="space-y-1.5">
                      {report.finalReport.nextSteps.map((step, i) => (
                        <li key={i} className="text-sm text-mentor-text-secondary flex gap-2">
                          <span className="text-primary-600">•</span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <h2 className="section-title mb-4">Question Evaluation</h2>
              <div className="divide-y divide-mentor-border">
                {report.questions.map((question, index) => (
                  <div key={index} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm font-medium text-mentor-text">
                        {index + 1}. {question.questionText}
                      </p>
                      {question.evaluation && (
                        <span className={`text-sm font-bold shrink-0 ${getScoreColorClass(question.evaluation.overallScore)}`}>
                          {question.evaluation.overallScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {question.evaluation?.dimensions && question.evaluation.dimensions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {question.evaluation.dimensions.map((dim) => (
                          <span key={dim.name} className="badge badge-neutral">
                            {dim.label}: {dim.score.toFixed(1)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default TrainerStudentReportDetailPage;
