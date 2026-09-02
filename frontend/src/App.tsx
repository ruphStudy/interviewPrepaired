import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AuthenticatedLayout from './components/AuthenticatedLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import InterviewSetupPage from './pages/InterviewSetupPage';
import InterviewScreen from './pages/InterviewScreen';
import ReportDashboard from './pages/ReportDashboard';
import AdminDashboard from './pages/AdminDashboard';

const ComingSoonPage = ({ title }: { title: string }) => (
  <AuthenticatedLayout>
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="card max-w-sm w-full text-center">
        <div className="w-11 h-11 rounded-lg bg-primary-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="section-title text-lg mb-1.5">{title}</h2>
        <p className="text-sm text-gray-500">This page is coming soon.</p>
      </div>
    </div>
  </AuthenticatedLayout>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
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
                <ComingSoonPage title="Interview History" />
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
    </AuthProvider>
  );
}

export default App;
