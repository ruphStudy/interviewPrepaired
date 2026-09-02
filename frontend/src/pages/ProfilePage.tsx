import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { Mail, BadgeCheck, BarChart3 } from 'lucide-react';

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

interface ProfileInfoRowProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

const ProfileInfoRow: React.FC<ProfileInfoRowProps> = ({ label, value, icon }) => (
  <div className="flex items-center justify-between py-3 border-b border-mentor-border last:border-b-0">
    <span className="text-sm text-mentor-text-secondary flex items-center gap-2">
      {icon}
      {label}
    </span>
    <span className="text-sm font-medium text-mentor-text">{value}</span>
  </div>
);

/**
 * Read-only — there is no user-update API yet, so no editable fields or save
 * button are shown here (a fake save would silently do nothing).
 */
const ProfilePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8">
        <div className="max-w-3xl">
          <div className="page-header">
            <h1 className="page-title">Profile</h1>
            <p className="page-subtitle">Your account details.</p>
          </div>

          {/* Header card */}
          <div className="card flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary-600 text-white flex items-center justify-center text-xl font-semibold shrink-0">
              {user ? getInitials(user.name) : 'U'}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-mentor-text truncate">{user?.name}</h2>
              <p className="text-sm text-mentor-text-secondary truncate">{user?.email}</p>
              <span className="badge badge-info mt-2 capitalize">{user?.role}</span>
            </div>
          </div>

          {/* Personal Information */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Personal Information</h3>
              <span className="text-xs text-mentor-text-muted">Edit profile — Coming soon</span>
            </div>
            <ProfileInfoRow label="Name" value={user?.name || '—'} />
            <ProfileInfoRow label="Email" value={user?.email || '—'} icon={<Mail size={14} />} />
            <ProfileInfoRow
              label="Role"
              value={user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'}
              icon={<BadgeCheck size={14} />}
            />
          </div>

          {/* Interview Activity — only from real user.stats */}
          {user?.stats && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-primary-600" />
                <h3 className="section-title">Interview Activity</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="stat-tile">
                  <p className="stat-tile-value">{user.stats.totalInterviews}</p>
                  <p className="stat-tile-label">Total Interviews</p>
                </div>
                <div className="stat-tile">
                  <p className="stat-tile-value">{user.stats.averageScore.toFixed(1)}</p>
                  <p className="stat-tile-label">Average Score</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

export default ProfilePage;
