import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Menu, ChevronDown, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  /** Shows a hamburger button (mobile only) that opens the sidebar drawer. */
  onMenuClick?: () => void;
}

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/admin')) return 'Admin Dashboard';
  if (pathname.startsWith('/setup')) return 'New Interview';
  if (pathname.startsWith('/history')) return 'Interview History';
  if (pathname.startsWith('/report')) return 'Interview Report';
  if (pathname.startsWith('/interview')) return 'Mock Interview';
  return 'Dashboard';
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

/**
 * Calm Mentor top header: page title (route-aware) on the left, profile
 * control on the right. Primary navigation now lives in Sidebar — this bar
 * no longer repeats it, it just carries the mobile menu trigger and account menu.
 */
const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pageTitle = getPageTitle(location.pathname);

  return (
    <header className="h-16 bg-white border-b border-mentor-border sticky top-0 z-30 flex items-center shrink-0">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open menu"
              className="md:hidden -ml-2 p-2 rounded-lg text-mentor-text-secondary hover:bg-mentor-surface hover:text-mentor-text"
            >
              <Menu size={22} />
            </button>
          )}
          <h1 className="text-base sm:text-lg font-semibold text-mentor-text truncate">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isAdmin && <span className="badge badge-info hidden sm:inline-flex">Admin</span>}

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full pr-1"
            >
              <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {user ? getInitials(user.name) : 'U'}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-mentor-text leading-tight">{user?.name}</div>
                <div className="text-xs text-mentor-text-muted leading-tight">{isAdmin ? 'Admin' : 'User'}</div>
              </div>
              <ChevronDown
                size={16}
                className={`hidden md:block text-mentor-text-muted transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />

                <div className="absolute right-0 mt-2 w-60 rounded-2xl shadow-card border border-mentor-border bg-white z-20 overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-mentor-border bg-mentor-surface">
                    <p className="text-sm font-semibold text-mentor-text">{user?.name}</p>
                    <p className="text-xs text-mentor-text-secondary mt-0.5">{user?.email}</p>
                    {user?.stats && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <span className="badge badge-neutral">{user.stats.totalInterviews} interviews</span>
                        <span className="badge badge-info">{user.stats.averageScore.toFixed(1)} avg</span>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="py-1 border-b border-mentor-border">
                      <Link
                        to="/admin"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-mentor-text-secondary hover:bg-mentor-surface hover:text-mentor-text"
                      >
                        <ShieldCheck size={16} />
                        Admin Panel
                      </Link>
                    </div>
                  )}

                  <div className="py-1">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 text-left px-4 py-2 text-sm text-mentor-error hover:bg-mentor-surface"
                    >
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
