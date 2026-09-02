import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  History,
  ShieldCheck,
  X,
  UserRound,
  CreditCard,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  /** Called after a nav link is clicked — lets the mobile drawer close itself. */
  onNavigate?: () => void;
  /** When provided, renders a close button in the brand row (mobile drawer only). */
  onClose?: () => void;
}

const MAIN_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/setup', label: 'New Interview', icon: MessageSquare },
  { to: '/history', label: 'History', icon: History },
];

const ACCOUNT_NAV_ITEMS = [
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/pricing', label: 'Pricing', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

/**
 * Calm Mentor sidebar content: brand, primary nav, bottom user card. Used
 * both as the permanent desktop column (via AppShell) and inside the mobile
 * drawer (via AuthenticatedLayout) — it doesn't know or care which.
 */
const Sidebar: React.FC<SidebarProps> = ({ onNavigate, onClose }) => {
  const location = useLocation();
  const { user, isAdmin } = useAuth();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const renderNavLink = ({ to, label, icon: Icon }: (typeof MAIN_NAV_ITEMS)[number]) => {
    const active = isActive(to);
    return (
      <Link
        key={to}
        to={to}
        onClick={onNavigate}
        className={`flex items-center gap-3 h-11 px-3 rounded-lg text-sm transition-colors ${
          active
            ? 'bg-mentor-soft text-primary-600 font-semibold'
            : 'text-mentor-text-secondary hover:bg-mentor-surface hover:text-primary-700'
        }`}
      >
        <Icon size={19} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Brand */}
      <div className="flex items-center gap-3 h-[72px] px-5 shrink-0 border-b border-mentor-border">
        <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-[10px] bg-primary-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            AI
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold text-mentor-text truncate">Interview</div>
            <div className="text-sm font-bold text-mentor-text truncate -mt-0.5">Prepared Pro</div>
          </div>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="shrink-0 p-1.5 rounded-lg text-mentor-text-secondary hover:bg-mentor-surface hover:text-mentor-text"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1">
        {MAIN_NAV_ITEMS.map(renderNavLink)}

        <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mentor-text-muted">
          Account
        </p>
        {ACCOUNT_NAV_ITEMS.map(renderNavLink)}

        {isAdmin && renderNavLink({ to: '/admin', label: 'Admin', icon: ShieldCheck })}
      </nav>

      {/* User card */}
      <div className="shrink-0 border-t border-mentor-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
            {user ? getInitials(user.name) : 'U'}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-medium text-mentor-text truncate">{user?.name}</div>
            <div className="text-xs text-mentor-text-muted truncate">{isAdmin ? 'Admin' : 'User'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
