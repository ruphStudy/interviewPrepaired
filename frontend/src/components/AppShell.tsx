import { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  /** Left sidebar region. Rendered only when provided — final navigation content lands in a later step. */
  sidebar?: ReactNode;
  /** Top header region for the content column. */
  header?: ReactNode;
}

/**
 * Structural foundation for the Calm Mentor app shell: an optional sidebar
 * column beside a content column (optional header + page content). No pages
 * are wired to this yet — it exists so Step 2's sidebar/header can drop in
 * without every page needing a rewrite.
 */
export default function AppShell({ children, sidebar, header }: AppShellProps) {
  return (
    <div className="min-h-screen bg-mentor-bg dark:bg-gray-900 md:flex">
      {sidebar && (
        <div className="hidden md:block md:w-64 md:shrink-0 md:border-r md:border-mentor-border md:dark:border-gray-700">
          {sidebar}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {header && <div>{header}</div>}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
