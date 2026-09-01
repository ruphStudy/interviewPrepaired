import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/setup', label: 'New Interview' },
  { to: '/history', label: 'History' },
];

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <header className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center text-sm font-bold">
              AI
            </div>
            <span className="text-base font-bold text-gray-900 tracking-tight">Interview Coach</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.to)
                    ? 'text-primary-700 bg-primary-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/admin')
                    ? 'text-purple-700 bg-purple-50'
                    : 'text-purple-600 hover:bg-purple-50'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Profile Menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full pr-1"
            >
              <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-semibold">
                {user ? getInitials(user.name) : 'U'}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-gray-900 leading-tight">{user?.name}</div>
                <div className="text-xs text-gray-500 leading-tight">{user?.role === 'admin' ? 'Admin' : 'User'}</div>
              </div>
              <svg
                className={`hidden md:block w-4 h-4 text-gray-400 transition-transform ${
                  showProfileMenu ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />

                <div className="absolute right-0 mt-2 w-60 rounded-xl shadow-card border border-gray-200 bg-white z-20 overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-gray-100 bg-slate-50">
                    <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
                    {user?.stats && (
                      <div className="mt-2.5 flex items-center gap-3 text-xs text-gray-600">
                        <span className="badge badge-neutral">{user.stats.totalInterviews} interviews</span>
                        <span className="badge badge-info">{user.stats.averageScore.toFixed(1)} avg</span>
                      </div>
                    )}
                  </div>

                  <div className="py-1">
                    {NAV_LINKS.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setShowProfileMenu(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {link.label}
                      </Link>
                    ))}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setShowProfileMenu(false)}
                        className="block px-4 py-2 text-sm text-purple-600 hover:bg-purple-50"
                      >
                        Admin Panel
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-200 bg-white">
        <nav className="flex justify-around py-1.5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`flex-1 text-center py-2 text-sm font-medium rounded-lg mx-1 ${
                isActive(link.to) ? 'text-primary-700 bg-primary-50' : 'text-gray-600'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link to="/admin" className="flex-1 text-center py-2 text-sm font-medium text-purple-600">
              Admin
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
