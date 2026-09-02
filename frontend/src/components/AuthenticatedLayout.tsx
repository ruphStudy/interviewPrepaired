import { ReactNode, useEffect, useState } from 'react';
import AppShell from './AppShell';
import Sidebar from './Sidebar';
import Header from './Header';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

/**
 * Composes AppShell + Sidebar + Header for every authenticated page that
 * uses the standard dashboard shell, so pages don't each re-assemble the
 * same three pieces. Also owns the mobile sidebar drawer — AppShell itself
 * stays unaware of it; this is the one place that needs the open/close state.
 */
export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile sidebar drawer — always mounted so the slide/fade actually animates both ways. */}
      <div className={`fixed inset-0 z-40 md:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          className={`absolute inset-0 bg-mentor-text/40 transition-opacity duration-200 ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={closeDrawer}
        />
        <div
          className={`absolute inset-y-0 left-0 w-[85vw] max-w-[280px] bg-white shadow-card-hover transition-transform duration-200 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar onNavigate={closeDrawer} onClose={closeDrawer} />
        </div>
      </div>

      <AppShell sidebar={<Sidebar />} header={<Header onMenuClick={() => setDrawerOpen(true)} />}>
        {children}
      </AppShell>
    </>
  );
}
