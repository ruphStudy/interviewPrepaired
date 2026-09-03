import { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  /** Left sidebar region. Rendered only when provided — final navigation content lands in a later step. */
  sidebar?: ReactNode;
  /** Top header region for the content column. */
  header?: ReactNode;
}

/**
 * Structural foundation for the Calm Mentor app shell: a sidebar column
 * pinned to the viewport beside a content column (header + page content).
 * The sidebar slot only ever renders on desktop (md+) — a small screen gets
 * no permanent sidebar; a caller wanting a mobile drawer composes that
 * itself (see AuthenticatedLayout) rather than this component knowing about it.
 */
export default function AppShell({ children, sidebar, header }: AppShellProps) {
  return (
    <div className="min-h-screen bg-mentor-bg dark:bg-future-bg md:flex">
      {sidebar && (
        <div className="hidden md:block md:w-[232px] md:shrink-0 md:sticky md:top-0 md:h-screen md:border-r md:border-mentor-border md:dark:border-future-border">
          {sidebar}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {header}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
