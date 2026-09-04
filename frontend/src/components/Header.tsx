import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Menu, ChevronDown, LogOut, ShieldCheck, Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsStore } from '../store';

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
  if (pathname.startsWith('/pricing')) return 'Pricing';
  if (pathname.startsWith('/account/credits')) return 'Credit History';
  if (pathname.startsWith('/account')) return 'Account & Credits';
  if (pathname.startsWith('/organizations/new')) return 'Create Organization';
  if (pathname.startsWith('/organizations/') && pathname.includes('/dashboard')) return 'Organization Dashboard';
  if (pathname.startsWith('/organizations/') && pathname.includes('/members')) return 'Members';
  if (pathname.startsWith('/organizations/') && pathname.includes('/settings')) return 'Organization Settings';
  if (pathname.startsWith('/organizations')) return 'Organization Profile';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/settings')) return 'Settings';
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
  const { theme, toggleTheme } = useSettingsStore();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pageTitle = getPageTitle(location.pathname);

  return (
    <header className="h-16 bg-white dark:bg-future-header border-b border-mentor-border dark:border-future-border sticky top-0 z-30 flex items-center shrink-0">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open menu"
              className="md:hidden -ml-2 p-2 rounded-lg text-mentor-text-secondary hover:bg-mentor-surface hover:text-mentor-text dark:text-future-muted dark:hover:bg-future-elevated dark:hover:text-future-text"
            >
              <Menu size={22} />
            </button>
          )}
          <h1 className="text-base sm:text-lg font-semibold text-mentor-text dark:text-future-text truncate">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isAdmin && <span className="badge badge-info hidden sm:inline-flex">Admin</span>}

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-future-violet rounded-full pr-1"
            >
              <div className="w-9 h-9 rounded-full bg-primary-600 dark:bg-gradient-to-br dark:from-future-violet dark:to-future-cyan flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {user ? getInitials(user.name) : 'U'}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-mentor-text dark:text-future-text leading-tight">{user?.name}</div>
                <div className="text-xs text-mentor-text-muted dark:text-future-muted leading-tight">{isAdmin ? 'Admin' : 'User'}</div>
              </div>
              <ChevronDown
                size={16}
                className={`hidden md:block text-mentor-text-muted dark:text-future-muted transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />

                <div className="absolute right-0 mt-2 w-60 rounded-2xl shadow-card dark:shadow-future-card border border-mentor-border dark:border-future-border bg-white dark:bg-future-card z-20 overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-mentor-border dark:border-future-border bg-mentor-surface dark:bg-future-elevated">
                    <p className="text-sm font-semibold text-mentor-text dark:text-future-text">{user?.name}</p>
                    <p className="text-xs text-mentor-text-secondary dark:text-slate-400 mt-0.5">{user?.email}</p>
                    {user?.stats && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <span className="badge badge-neutral">{user.stats.totalInterviews} interviews</span>
                        <span className="badge badge-info">{user.stats.averageScore.toFixed(1)} avg</span>
                      </div>
                    )}
                  </div>

                  <div className="py-1 border-b border-mentor-border dark:border-future-border">
                    <button
                      onClick={toggleTheme}
                      className="flex w-full items-center justify-between gap-2 text-left px-4 py-2 text-sm text-mentor-text-secondary hover:bg-mentor-surface hover:text-mentor-text dark:text-future-secondary dark:hover:bg-future-elevated dark:hover:text-future-text"
                    >
                      <span className="flex items-center gap-2">
                        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} className="dark:text-future-cyan" />}
                        {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                      </span>
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="py-1 border-b border-mentor-border dark:border-future-border">
                      <Link
                        to="/admin"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-mentor-text-secondary hover:bg-mentor-surface hover:text-mentor-text dark:text-future-secondary dark:hover:bg-future-elevated dark:hover:text-future-text"
                      >
                        <ShieldCheck size={16} />
                        Admin Panel
                      </Link>
                    </div>
                  )}

                  <div className="py-1">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 text-left px-4 py-2 text-sm text-mentor-error dark:text-future-error hover:bg-mentor-surface dark:hover:bg-future-elevated"
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
