import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsStore } from '../store';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { API_BASE_URL } from '../config/api.config';
import {
  Palette,
  Sliders,
  Languages,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  UserRound,
  ShieldCheck,
  Monitor,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

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
  const { user, token, logout, logoutAll } = useAuth();
  const { theme, toggleTheme } = useSettingsStore();
  const navigate = useNavigate();

  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'cooldown' | 'error'>('idle');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);

  const [signingOutAll, setSigningOutAll] = useState(false);
  const [signOutAllError, setSignOutAllError] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleResendVerification = async () => {
    if (!token) return;
    setResendStatus('sending');
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/resend-verification`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const status = response.data?.data?.status;
      setResendStatus(status === 'cooldown' ? 'cooldown' : 'sent');
    } catch {
      setResendStatus('error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    setChangingPassword(true);
    try {
      await axios.put(
        `${API_BASE_URL}/auth/password`,
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPasswordChanged(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Changing the password revokes every session server-side, including
      // this one — the local token is now dead, so send the user back to a
      // real sign-in rather than pretending this tab is still authenticated.
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOutAllDevices = async () => {
    setSignOutAllError('');
    setSigningOutAll(true);
    try {
      await logoutAll();
      navigate('/login');
    } catch (err: any) {
      setSignOutAllError('Failed to sign out of all devices. Please try again.');
    } finally {
      setSigningOutAll(false);
    }
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

          <SettingsSection title="Security" icon={<ShieldCheck size={18} className="text-primary-600" />}>
            <div className="space-y-6">
              {/* Email verification */}
              <div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-mentor-text">Email</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {user?.isVerified ? (
                        <>
                          <CheckCircle2 size={14} className="text-mentor-success" />
                          <span className="text-xs text-mentor-success">Verified</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={14} className="text-mentor-warning" />
                          <span className="text-xs text-mentor-warning">Not verified</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!user?.isVerified && (
                    <button onClick={handleResendVerification} disabled={resendStatus === 'sending'} className="btn btn-secondary">
                      {resendStatus === 'sending' ? 'Sending...' : 'Resend verification email'}
                    </button>
                  )}
                </div>
                {resendStatus === 'sent' && <p className="text-xs text-mentor-success mt-2">Verification email sent — check your inbox.</p>}
                {resendStatus === 'cooldown' && (
                  <p className="text-xs text-mentor-text-muted mt-2">A verification email was just sent. Please check your inbox.</p>
                )}
                {resendStatus === 'error' && <p className="text-xs text-mentor-error mt-2">Couldn't send right now — please try again.</p>}
              </div>

              <div className="border-t border-mentor-border pt-6">
                <p className="text-sm font-medium text-mentor-text mb-3">Change Password</p>
                {passwordChanged ? (
                  <p className="text-sm text-mentor-success">Password changed. Redirecting you to sign in...</p>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    {passwordError && <p className="text-sm text-mentor-error">{passwordError}</p>}
                    <div>
                      <label className="label mb-1 block">Current Password</label>
                      <input
                        type="password"
                        autoComplete="current-password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="label mb-1 block">New Password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="label mb-1 block">Confirm New Password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <p className="text-xs text-mentor-text-muted">
                      Changing your password signs you out of all devices, including this one.
                    </p>
                    <button type="submit" disabled={changingPassword} className="btn btn-primary">
                      {changingPassword ? 'Changing...' : 'Change Password'}
                    </button>
                  </form>
                )}
              </div>

              <div className="border-t border-mentor-border pt-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-mentor-text flex items-center gap-1.5">
                      <Monitor size={14} />
                      Sessions
                    </p>
                    <p className="text-xs text-mentor-text-muted mt-0.5">Sign out everywhere if you suspect unauthorized access.</p>
                  </div>
                  <button onClick={handleSignOutAllDevices} disabled={signingOutAll} className="btn btn-secondary">
                    {signingOutAll ? 'Signing out...' : 'Sign out of all devices'}
                  </button>
                </div>
                {signOutAllError && <p className="text-xs text-mentor-error mt-2">{signOutAllError}</p>}
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

export default SettingsPage;
