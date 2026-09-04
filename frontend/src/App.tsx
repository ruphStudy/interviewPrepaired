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
