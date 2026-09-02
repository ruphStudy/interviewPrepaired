import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsStore } from '../store';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { Palette, Sliders, Languages, LogOut, Sun, Moon, ChevronRight, UserRound } from 'lucide-react';

interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, icon, children }) => (
  <div className="card mb-6">
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h3 className="section-title">{title}</h3>
    </div>
    {children}
  </div>
);

/**
 * Appearance reuses the real useSettingsStore theme (it actually toggles the
 * `dark` class on <html>). Interview Preferences/Language have no backing
 * store, so they're shown as honest "coming soon" notices rather than
 * fake-functional toggles.
 */
const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useSettingsStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8">
        <div className="max-w-2xl">
          <div className="page-header">
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage your appearance and account preferences.</p>
          </div>

          <SettingsSection title="Appearance" icon={<Palette size={18} className="text-primary-600" />}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-mentor-text">Theme</p>
                <p className="text-xs text-mentor-text-muted mt-0.5">Choose your preferred color scheme.</p>
              </div>
              <button onClick={toggleTheme} className="btn btn-secondary">
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                {theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
              </button>
            </div>
          </SettingsSection>

          <SettingsSection title="Interview Preferences" icon={<Sliders size={18} className="text-primary-600" />}>
            <div className="surface-muted p-4">
              <p className="text-sm text-mentor-text-secondary">
                Default interview preferences will be configurable here in a future update.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection title="Language" icon={<Languages size={18} className="text-primary-600" />}>
            <p className="text-sm text-mentor-text-secondary mb-3">
              Interview language is selected when starting each interview.
            </p>
            <Link to="/setup" className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
              Go to New Interview
              <ChevronRight size={14} />
            </Link>
          </SettingsSection>

          <SettingsSection title="Account" icon={<UserRound size={18} className="text-primary-600" />}>
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-mentor-text-secondary">Name</span>
                <span className="font-medium text-mentor-text">{user?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mentor-text-secondary">Email</span>
                <span className="font-medium text-mentor-text">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mentor-text-secondary">Role</span>
                <span className="font-medium text-mentor-text capitalize">{user?.role}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-secondary">
              <LogOut size={16} />
              Logout
            </button>
          </SettingsSection>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

export default SettingsPage;
