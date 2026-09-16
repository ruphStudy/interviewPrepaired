import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
  const { isAuthenticated, isAdmin, loading, authError, retryAuth, token } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // A saved token plus a transient network/server error is not the same as
  // an invalid session. Keep the user on a recoverable screen instead of
  // redirecting to login and making it look as though they were signed out.
  if (token && authError && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-mentor-bg dark:bg-future-bg flex items-center justify-center px-4">
        <div className="card max-w-md w-full text-center">
          <h2 className="section-title text-lg mb-2">We couldn't verify your session</h2>
          <p className="text-sm text-mentor-text-secondary mb-5">{authError}</p>
          <button onClick={() => retryAuth()} className="btn btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to home if admin route but user is not admin
  if (adminOnly && !isAdmin) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;