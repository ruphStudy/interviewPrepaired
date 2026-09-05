import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import InterviewSetupPage from './pages/InterviewSetupPage';
import InterviewScreen from './pages/InterviewScreen';
import ReportDashboard from './pages/ReportDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PricingPage from './pages/PricingPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import HistoryPage from './pages/HistoryPage';
import AccountPage from './pages/AccountPage';
import CreditHistoryPage from './pages/CreditHistoryPage';
import CreateOrganizationPage from './pages/CreateOrganizationPage';
import OrganizationProfilePage from './pages/OrganizationProfilePage';
import OrganizationMembersPage from './pages/OrganizationMembersPage';
import OrganizationDashboardPage from './pages/OrganizationDashboardPage';
import OrganizationSettingsPage from './pages/OrganizationSettingsPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import EmployerInterviewInvitePage from './pages/EmployerInterviewInvitePage';
import InstituteProfilePage from './pages/institute/InstituteProfilePage';
import InstituteBranchesPage from './pages/institute/InstituteBranchesPage';
import InstituteCoursesPage from './pages/institute/InstituteCoursesPage';
import InstituteBatchesPage from './pages/institute/InstituteBatchesPage';
import InstituteStudentsPage from './pages/institute/InstituteStudentsPage';
import InstituteStudentDetailPage from './pages/institute/InstituteStudentDetailPage';
import InstituteTrainersPage from './pages/institute/InstituteTrainersPage';
import InstituteTrainerDetailPage from './pages/institute/InstituteTrainerDetailPage';
import InstituteTemplatesPage from './pages/institute/InstituteTemplatesPage';
import InstituteInterviewAssignmentsPage from './pages/institute/InstituteInterviewAssignmentsPage';
import EmployerProfilePage from './pages/employer/EmployerProfilePage';
import EmployerJobsPage from './pages/employer/EmployerJobsPage';
import EmployerJobFormPage from './pages/employer/EmployerJobFormPage';
import EmployerJobDetailPage from './pages/employer/EmployerJobDetailPage';
import EmployerJobDescriptionPage from './pages/employer/EmployerJobDescriptionPage';
import EmployerCandidatesPage from './pages/employer/EmployerCandidatesPage';
import EmployerCandidateFormPage from './pages/employer/EmployerCandidateFormPage';
import EmployerCandidateDetailPage from './pages/employer/EmployerCandidateDetailPage';
import EmployerApplicationDetailPage from './pages/employer/EmployerApplicationDetailPage';
import InstituteReadinessPage from './pages/institute/InstituteReadinessPage';
import InstituteBillingPage from './pages/institute/InstituteBillingPage';
import TrainerDashboardPage from './pages/institute/TrainerDashboardPage';
import TrainerStudentReportsPage from './pages/institute/TrainerStudentReportsPage';
import TrainerStudentReportDetailPage from './pages/institute/TrainerStudentReportDetailPage';
import TrainerBatchAnalyticsPage from './pages/institute/TrainerBatchAnalyticsPage';
import TrainerBatchSkillGapsPage from './pages/institute/TrainerBatchSkillGapsPage';
import TrainerBatchReadinessPage from './pages/institute/TrainerBatchReadinessPage';
import StudentDashboardPage from './pages/student/StudentDashboardPage';
import StudentAssignmentsPage from './pages/student/StudentAssignmentsPage';
import StudentAssignmentDetailPage from './pages/student/StudentAssignmentDetailPage';
import StudentAssignmentResultPage from './pages/student/StudentAssignmentResultPage';
import StudentHistoryPage from './pages/student/StudentHistoryPage';
import StudentReadinessPage from './pages/student/StudentReadinessPage';

function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Public — mirrors the backend's own public invitation-preview endpoint. Accepting still requires auth (handled inside the page). */}
          <Route path="/accept-invite/:token" element={<AcceptInvitationPage />} />
          {/* Fully public (20D) — no auth at all, unlike /accept-invite above. Candidate interview invitation access + explicit acceptance only; no interview session is created here. */}
          <Route path="/candidate/interview-invite/:token" element={<EmployerInterviewInvitePage />} />

          {/* Protected Routes */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/setup"
            element={
              <ProtectedRoute>
                <InterviewSetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/interview/:interviewId"
            element={
              <ProtectedRoute>
                <InterviewScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report/:interviewId"
            element={
              <ProtectedRoute>
                <ReportDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pricing"
            element={
              <ProtectedRoute>
                <PricingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <AccountPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account/credits"
            element={
              <ProtectedRoute>
                <CreditHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Organization Routes (UI-02/UI-03) */}
          <Route
            path="/organizations/new"
            element={
              <ProtectedRoute>
                <CreateOrganizationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/dashboard"
            element={
              <ProtectedRoute>
                <OrganizationDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/profile"
            element={
              <ProtectedRoute>
                <OrganizationProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/members"
            element={
              <ProtectedRoute>
                <OrganizationMembersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/settings"
            element={
              <ProtectedRoute>
                <OrganizationSettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Institute Management Routes (UI-04) — institute-only, guarded inside each page */}
          <Route
            path="/organizations/:organizationId/institute/profile"
            element={
              <ProtectedRoute>
                <InstituteProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/branches"
            element={
              <ProtectedRoute>
                <InstituteBranchesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/courses"
            element={
              <ProtectedRoute>
                <InstituteCoursesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/batches"
            element={
              <ProtectedRoute>
                <InstituteBatchesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/students"
            element={
              <ProtectedRoute>
                <InstituteStudentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/students/:studentId"
            element={
              <ProtectedRoute>
                <InstituteStudentDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Institute Trainers / Templates / Interview Assignments Routes (UI-05) — institute-only, guarded inside each page */}
          <Route
            path="/organizations/:organizationId/institute/trainers"
            element={
              <ProtectedRoute>
                <InstituteTrainersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/trainers/:membershipId"
            element={
              <ProtectedRoute>
                <InstituteTrainerDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/templates"
            element={
              <ProtectedRoute>
                <InstituteTemplatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/interview-assignments"
            element={
              <ProtectedRoute>
                <InstituteInterviewAssignmentsPage />
              </ProtectedRoute>
            }
          />

          {/* Employer / Company Profile Routes (Sprint 16A) — company-only, guarded inside the page */}
          <Route
            path="/organizations/:organizationId/employer/profile"
            element={
              <ProtectedRoute>
                <EmployerProfilePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/organizations/:organizationId/employer/jobs"
            element={
              <ProtectedRoute>
                <EmployerJobsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/employer/jobs/new"
            element={
              <ProtectedRoute>
                <EmployerJobFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/employer/jobs/:jobId"
            element={
              <ProtectedRoute>
                <EmployerJobDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/employer/jobs/:jobId/jd"
            element={
              <ProtectedRoute>
                <EmployerJobDescriptionPage />
              </ProtectedRoute>
            }
          />

          {/* Employer Candidates Routes (Sprint 18A) — company-only, guarded inside the page */}
          <Route
            path="/organizations/:organizationId/employer/candidates"
            element={
              <ProtectedRoute>
                <EmployerCandidatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/employer/candidates/new"
            element={
              <ProtectedRoute>
                <EmployerCandidateFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/employer/candidates/:candidateId"
            element={
              <ProtectedRoute>
                <EmployerCandidateDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Employer Job Applications Routes (Sprint 18D) — company-only, guarded inside the page. No sidebar nav — reached from Job/Candidate detail pages. */}
          <Route
            path="/organizations/:organizationId/employer/applications/:applicationId"
            element={
              <ProtectedRoute>
                <EmployerApplicationDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Institute Placement Readiness + Billing/Credits Routes (UI-08) — institute-only, guarded inside each page */}
          <Route
            path="/organizations/:organizationId/institute/readiness"
            element={
              <ProtectedRoute>
                <InstituteReadinessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/institute/billing"
            element={
              <ProtectedRoute>
                <InstituteBillingPage />
              </ProtectedRoute>
            }
          />

          {/* Institute Trainer Portal Routes (UI-07) — institute-only, and
              further gated inside each page to activeRole === 'trainer'
              (an OWNER/ADMIN cannot view these as if they were a trainer). */}
          <Route
            path="/organizations/:organizationId/trainer"
            element={
              <ProtectedRoute>
                <TrainerDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/trainer/students/:studentId/reports"
            element={
              <ProtectedRoute>
                <TrainerStudentReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/trainer/students/:studentId/reports/:assignmentId"
            element={
              <ProtectedRoute>
                <TrainerStudentReportDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/trainer/batches/:batchId/analytics"
            element={
              <ProtectedRoute>
                <TrainerBatchAnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/trainer/batches/:batchId/skill-gaps"
            element={
              <ProtectedRoute>
                <TrainerBatchSkillGapsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:organizationId/trainer/batches/:batchId/readiness"
            element={
              <ProtectedRoute>
                <TrainerBatchReadinessPage />
              </ProtectedRoute>
            }
          />

          {/* Student Portal Routes (UI-06) — based on the caller's own linked
              InstituteStudent records, never on OrganizationContext/RBAC; a
              student need not be an OrganizationMember at all. */}
          <Route
            path="/student"
            element={
              <ProtectedRoute>
                <StudentDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments"
            element={
              <ProtectedRoute>
                <StudentAssignmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:assignmentId"
            element={
              <ProtectedRoute>
                <StudentAssignmentDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:assignmentId/result"
            element={
              <ProtectedRoute>
                <StudentAssignmentResultPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/history"
            element={
              <ProtectedRoute>
                <StudentHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/readiness"
            element={
              <ProtectedRoute>
                <StudentReadinessPage />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
      </OrganizationProvider>
    </AuthProvider>
  );
}

export default App;
