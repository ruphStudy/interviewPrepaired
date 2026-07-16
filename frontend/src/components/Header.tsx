import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Header: React.FC = () => {
  const navigate = useNavigate();
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

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="text-2xl">🎯</div>
              <span className="text-xl font-bold text-indigo-600">AI Interview Coach</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link
              to="/dashboard"
              className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/setup"
              className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
            >
              New Interview
            </Link>
            <Link
              to="/history"
              className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
            >
              History
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="text-purple-600 hover:text-purple-700 font-medium transition-colors"
              >
                Admin Panel
              </Link>
            )}
          </nav>

          {/* Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center space-x-3 focus:outline-none"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                {user ? getInitials(user.name) : 'U'}
              </div>
              
              {/* User Info */}
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-gray-900">{user?.name}</div>
                <div className="text-xs text-gray-500">{user?.role === 'admin' ? 'Admin' : 'User'}</div>
              </div>

              {/* Dropdown Icon */}
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  showProfileMenu ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showProfileMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowProfileMenu(false)}
                />

                {/* Menu */}
                <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                  <div className="py-1">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{user?.email}</p>
                      {user?.stats && (
                        <div className="mt-2 flex items-center space-x-4 text-xs text-gray-600">
                          <span>📝 {user.stats.totalInterviews} interviews</span>
                          <span>⭐ {user.stats.averageScore.toFixed(1)} avg</span>
                        </div>
                      )}
                    </div>

                    {/* Menu Items */}
                    <Link
                      to="/dashboard"
                      onClick={() => setShowProfileMenu(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <span className="flex items-center">
                        <span className="mr-2">🏠</span>
                        Dashboard
                      </span>
                    </Link>

                    <Link
                      to="/setup"
                      onClick={() => setShowProfileMenu(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <span className="flex items-center">
                        <span className="mr-2">➕</span>
                        New Interview
                      </span>
                    </Link>

                    <Link
                      to="/history"
                      onClick={() => setShowProfileMenu(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <span className="flex items-center">
                        <span className="mr-2">📚</span>
                        My History
                      </span>
                    </Link>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setShowProfileMenu(false)}
                        className="block px-4 py-2 text-sm text-purple-600 hover:bg-purple-50"
                      >
                        <span className="flex items-center">
                          <span className="mr-2">👑</span>
                          Admin Panel
                        </span>
                      </Link>
                    )}

                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <span className="flex items-center">
                          <span className="mr-2">🚪</span>
                          Logout
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-200">
        <nav className="flex justify-around py-2">
          <Link
            to="/dashboard"
            className="flex flex-col items-center text-gray-700 hover:text-indigo-600"
          >
            <span className="text-xl">🏠</span>
            <span className="text-xs mt-1">Home</span>
          </Link>
          <Link
            to="/setup"
            className="flex flex-col items-center text-gray-700 hover:text-indigo-600"
          >
            <span className="text-xl">➕</span>
            <span className="text-xs mt-1">New</span>
          </Link>
          <Link
            to="/history"
            className="flex flex-col items-center text-gray-700 hover:text-indigo-600"
          >
            <span className="text-xl">📚</span>
            <span className="text-xs mt-1">History</span>
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="flex flex-col items-center text-purple-600 hover:text-purple-700"
            >
              <span className="text-xl">👑</span>
              <span className="text-xs mt-1">Admin</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
