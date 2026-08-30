import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { AuditEntryRow } from '@/features/admin/audit/AuditEntryRow';
import { fetchRecentActivity, fetchSystemStats } from '@/features/admin/api';
import { toApiError } from '@/lib/errors';

/**
 * What an administrator sees first: the size of the system, what needs them, and what has just
 * happened.
 *
 * <p>The pending-requests tile is deliberately loud when it is not zero. An unapproved registration
 * is a real person unable to work, and it is the only thing on this screen that nobody else can
 * clear.
 */
export function AdminDashboardPage() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchSystemStats });
  const activity = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => fetchRecentActivity(12),
  });

  const error = stats.error ?? activity.error;

  return (
    <AppShell
      title="Dashboard"
      subtitle="The state of the system, and what has just happened in it."
    >
      {error && <Alert tone="error">{toApiError(error).message}</Alert>}

      {(stats.data?.pendingRequests ?? 0) > 0 && (
        <Link
          to="/admin/requests"
          className="animate-rise mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl
            border border-amber-300 bg-amber-50 px-5 py-4 transition-all duration-[--duration-base]
            ease-[--ease-settle] hover:-translate-y-0.5 hover:shadow-lifted"
        >
          <span>
            <span className="block font-semibold text-amber-900">
              {stats.data?.pendingRequests} registration
              {stats.data?.pendingRequests === 1 ? '' : 's'} awaiting approval
            </span>
            <span className="mt-0.5 block text-sm text-amber-800">
              Nobody can sign in until their request is approved.
            </span>
          </span>
          <span className="text-sm font-semibold text-amber-900">Review now →</span>
        </Link>
      )}

      <section className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          to="/departments"
          label="Departments"
          value={stats.data?.departments}
          hint={`${stats.data?.folders ?? '—'} folders`}
        />
        <Tile
          to="/departments"
          label="Documents"
          value={stats.data?.documents}
          hint={`${stats.data?.deletedDocuments ?? 0} deleted`}
        />
        <Tile
          to="/admin/members"
          label="Members"
          value={stats.data?.members}
          hint={`${stats.data?.activeMembers ?? '—'} active`}
        />
        <Tile
          to="/admin/reports"
          label="This month"
          value={stats.data?.uploadsThisMonth}
          hint={`uploads · ${stats.data?.downloadsThisMonth ?? '—'} downloads`}
        />
      </section>

      {/* The hub: everything admin that is not in the header lives behind these. */}
      <nav aria-label="Administration" className="mt-6 flex flex-wrap gap-2">
        {[
          { to: '/admin/requests', label: 'Registration requests' },
          { to: '/admin/members', label: 'Members' },
          { to: '/admin/reports', label: 'Reports' },
          { to: '/admin/deletions', label: 'Deleted documents' },
          { to: '/admin/logs', label: 'Activity log' },
        ].map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-lg border border-navy-300 bg-surface px-4 py-2 text-sm font-semibold
              text-navy-700 outline-none transition-all duration-[--duration-base] ease-[--ease-settle]
              hover:bg-navy-50 focus-visible:ring-2 focus-visible:ring-navy-300"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <section className="mt-6 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line bg-surface-sunken px-5 py-3">
          <h2 className="font-semibold text-slate-900">Recent activity</h2>
          <Link to="/admin/logs" className="text-sm font-semibold text-navy-600 hover:underline">
            Open the full log
          </Link>
        </div>

        {activity.isPending ? (
          <div className="p-5">
            <SkeletonRows count={4} label="Loading recent activity" />
          </div>
        ) : (activity.data?.items.length ?? 0) === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Nothing has happened yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.data?.items.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function Tile({
  to,
  label,
  value,
  hint,
}: {
  to: string;
  label: string;
  value: number | undefined;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-line bg-surface p-5 shadow-card outline-none
        transition-[border-color,box-shadow,background-color] duration-[--duration-quick]
        ease-[--ease-settle] hover:border-navy-400 hover:bg-navy-50/40 hover:shadow-lifted
        focus-visible:ring-2 focus-visible:ring-navy-300"
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className="mt-1 text-[2rem] leading-none font-semibold text-navy-800 transition-colors
          duration-[--duration-base] group-hover:text-navy-600"
      >
        {value ?? '—'}
      </p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </Link>
  );
}
