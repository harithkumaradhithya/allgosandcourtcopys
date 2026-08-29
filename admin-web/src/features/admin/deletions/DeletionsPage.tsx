import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { fetchDeletions, restoreFile } from '@/features/documents/api';
import { PurgeFileDialog } from '@/features/documents/PurgeFileDialog';
import { toApiError } from '@/lib/errors';
import { daysUntil, formatDateTime } from '@/lib/format';
import { invalidateFileLists } from '@/lib/queryKeys';
import type { FileDeletion } from '@/types/api';

type Tab = 'deleted' | 'all';

const TABS: { value: Tab; label: string }[] = [
  { value: 'deleted', label: 'Still deleted' },
  { value: 'all', label: 'All deletions' },
];

/**
 * The deletions log: what was removed, by whom, and the reason they gave.
 *
 * <p>This is the admin's side of rule 4. The same reason arrives as a notification the moment a file
 * is deleted; this screen is the durable record of it, and the only place a file can be put back.
 */
export function DeletionsPage() {
  const [tab, setTab] = useState<Tab>('deleted');
  const [page, setPage] = useState(0);
  const [purging, setPurging] = useState<FileDeletion | null>(null);
  const queryClient = useQueryClient();

  const deletions = useQuery({
    queryKey: ['deletions', tab, page],
    queryFn: () => fetchDeletions(tab, page),
  });

  const restore = useMutation({
    mutationFn: (fileId: string) => restoreFile(fileId),
    onSuccess: () => {
      // The row stays in the log with its restore stamped, so the list is re-read rather than
      // patched — it moves between tabs on its own. A restore also returns the document to
      // search, which is why this invalidates every document-bearing list.
      void invalidateFileLists(queryClient);
    },
  });

  const changeTab = (value: Tab) => {
    setTab(value);
    setPage(0);
  };

  return (
    <AppShell
      title="Deleted documents"
      subtitle="Every deletion, with the reason given. A deleted document can be restored for 30 days, after which it is removed for good."
    >
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Deletion filter">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => changeTab(entry.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium outline-none
              transition-all duration-[--duration-base] ease-[--ease-settle] active:scale-[0.97]
              focus-visible:ring-2 focus-visible:ring-navy-300 ${
                tab === entry.value
                  ? 'bg-navy-50 text-navy-700 shadow-card'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-navy-700'
              }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {deletions.isPending && <SkeletonRows count={3} label="Loading deletions" />}
      {deletions.isError && <Alert tone="error">{toApiError(deletions.error).message}</Alert>}
      {restore.isError && <Alert tone="error">{toApiError(restore.error).message}</Alert>}

      {deletions.isSuccess && deletions.data.items.length === 0 && (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-slate-500">
          {tab === 'deleted' ? 'Nothing is currently deleted.' : 'No documents have been deleted.'}
        </p>
      )}

      {deletions.isSuccess && deletions.data.items.length > 0 && (
        <div className="space-y-4">
          <ul key={`${tab}-${page}`} className="stagger space-y-3">
            {deletions.data.items.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-line bg-surface p-5 shadow-card
                  transition-all duration-[--duration-base] ease-[--ease-settle] hover:shadow-lifted"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{entry.fileName}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {entry.departmentName} ·{' '}
                      <Link
                        to={`/folders/${entry.folderId}`}
                        className="text-navy-600 hover:underline"
                      >
                        {entry.folderName}
                      </Link>
                    </p>
                  </div>

                  {entry.restorable ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          loading={restore.isPending && restore.variables === entry.fileId}
                          onClick={() => restore.mutate(entry.fileId!)}
                        >
                          Restore
                        </Button>
                        <Button variant="danger" onClick={() => setPurging(entry)}>
                          Delete permanently
                        </Button>
                      </div>
                      {entry.purgeExpiresAt && (
                        <PurgeCountdown expiresAt={entry.purgeExpiresAt} />
                      )}
                    </div>
                  ) : entry.purgedAt ? (
                    <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                      Permanently deleted
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Restored
                    </span>
                  )}
                </div>

                {/* The reason is the point of the record, so it is quoted rather than summarised. */}
                <blockquote className="mt-3 border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
                  {entry.reason}
                </blockquote>

                <p className="mt-3 text-xs text-slate-500">
                  Deleted by {entry.deletedByName} on {formatDateTime(entry.deletedAt)}
                  {entry.restoredAt &&
                    ` · Restored by ${entry.restoredByName} on ${formatDateTime(entry.restoredAt)}`}
                  {entry.purgedAt &&
                    ` · Permanently deleted ${entry.purgedByName ? `by ${entry.purgedByName} ` : ''}on ${formatDateTime(entry.purgedAt)}`}
                </p>
              </li>
            ))}
          </ul>

          {deletions.data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Page {deletions.data.page + 1} of {deletions.data.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page + 1 >= deletions.data.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <PurgeFileDialog deletion={purging} onClose={() => setPurging(null)} />
    </AppShell>
  );
}

/** The countdown to the daily sweep, under the Restore / Delete permanently pair. */
function PurgeCountdown({ expiresAt }: { expiresAt: string }) {
  const days = daysUntil(expiresAt);
  return (
    <span className="text-xs text-slate-400">
      {days <= 0
        ? 'Removed for good today'
        : `${days} day${days === 1 ? '' : 's'} until permanent deletion`}
    </span>
  );
}
