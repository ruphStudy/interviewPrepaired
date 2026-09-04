import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, User, Building2, GraduationCap, Plus, Check } from 'lucide-react';
import { useOrganization } from '../contexts/OrganizationContext';

interface OrganizationSwitcherProps {
  onNavigate?: () => void;
}

/**
 * Compact organization switcher (UI-02) — Personal + every accessible
 * organization + Create Organization. Selecting an entry updates
 * OrganizationContext (which drives RBAC-aware nav/pages) and navigates
 * into that organization's (or back to Personal/B2C) primary surface.
 */
const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { organizations, activeOrganizationId, activeOrganization, loading, setActiveOrganization } = useOrganization();
  const [open, setOpen] = useState(false);

  const currentLabel = activeOrganization ? activeOrganization.name : 'Personal';

  const handleSelectPersonal = async () => {
    setOpen(false);
    onNavigate?.();
    await setActiveOrganization(null);
    navigate('/dashboard');
  };

  const handleSelectOrganization = async (id: string) => {
    setOpen(false);
    onNavigate?.();
    await setActiveOrganization(id);
    navigate(`/organizations/${id}/profile`);
  };

  const handleCreate = () => {
    setOpen(false);
    onNavigate?.();
    navigate('/organizations/new');
  };

  return (
    <div className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="w-full flex items-center gap-2.5 h-10 px-3 rounded-lg border border-mentor-border dark:border-future-border text-left hover:bg-mentor-surface dark:hover:bg-future-elevated transition-colors disabled:opacity-60"
      >
        {activeOrganization ? (
          activeOrganization.type === 'institute' ? (
            <GraduationCap size={16} className="text-primary-600 dark:text-future-violet shrink-0" />
          ) : (
            <Building2 size={16} className="text-primary-600 dark:text-future-violet shrink-0" />
          )
        ) : (
          <User size={16} className="text-mentor-text-muted shrink-0" />
        )}
        <span className="text-sm font-medium text-mentor-text truncate flex-1">{currentLabel}</span>
        <ChevronsUpDown size={14} className="text-mentor-text-muted shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 mt-1.5 rounded-xl border border-mentor-border dark:border-future-border bg-white dark:bg-future-card shadow-card dark:shadow-future-card z-20 overflow-hidden">
            <button
              type="button"
              onClick={handleSelectPersonal}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-mentor-surface dark:hover:bg-future-elevated text-mentor-text"
            >
              <User size={16} className="text-mentor-text-muted shrink-0" />
              <span className="flex-1">Personal</span>
              {!activeOrganizationId && <Check size={14} className="text-primary-600 dark:text-future-violet" />}
            </button>

            {organizations.length > 0 && <div className="border-t border-mentor-border dark:border-future-border" />}

            {organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => handleSelectOrganization(org.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-mentor-surface dark:hover:bg-future-elevated text-mentor-text"
              >
                {org.type === 'institute' ? (
                  <GraduationCap size={16} className="text-primary-600 dark:text-future-violet shrink-0" />
                ) : (
                  <Building2 size={16} className="text-primary-600 dark:text-future-violet shrink-0" />
                )}
                <span className="flex-1 truncate">{org.name}</span>
                {activeOrganizationId === org.id && <Check size={14} className="text-primary-600 dark:text-future-violet" />}
              </button>
            ))}

            <div className="border-t border-mentor-border dark:border-future-border" />
            <button
              type="button"
              onClick={handleCreate}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-mentor-surface dark:hover:bg-future-elevated text-primary-600 dark:text-future-violet font-medium"
            >
              <Plus size={16} className="shrink-0" />
              Create Organization
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default OrganizationSwitcher;
