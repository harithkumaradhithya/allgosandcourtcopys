import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { fetchDepartments, searchFiles } from '@/features/documents/api';
import { DeleteFileDialog } from '@/features/documents/DeleteFileDialog';
import { FileTable } from '@/features/documents/FileTable';
import { ReplaceFileDialog } from '@/features/documents/ReplaceFileDialog';
import { toApiError } from '@/lib/errors';
import { formatCategory } from '@/lib/format';
import type { FileItem, FolderCategory } from '@/types/api';

const CATEGORIES: FolderCategory[] = [
  'GOVT_ORDER',
  'COURT_ORDER',
  'CIRCULAR',
  'CONTRACT',
  'ACT_RULE',
  'GENERAL',
];

/**
 * Search results, across every department.
 *
 * <p>The query and its facets live in the URL, so a result set is a thing you can bookmark, send to
 * a colleague, or come back to with the back button. That is also why the facets write to the search
 * params rather than to component state — the address bar is the state.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<FileItem | null>(null);
  const [replacing, setReplacing] = useState<FileItem | null>(null);

  const q = params.get('q') ?? '';
  const departmentId = params.get('departmentId') ?? '';
  const category = (params.get('category') ?? '') as FolderCategory | '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });

  // A G.O. number is a compact token, not free prose, so a lone digit — "2" for G.O. No.2 — is a
  // real search rather than the kind of noisy one-letter query the two-character minimum guards
  // against. The server applies the same exemption; see DiscoveryService.DIGITS_ONLY.
  const trimmedQuery = q.trim();
  const queryIsSearchable = /^\d+$/.test(trimmedQuery) ? trimmedQuery.length >= 1 : trimmedQuery.length >= 2;

  const results = useQuery({
    queryKey: ['search', q, departmentId, category, from, to, page],
    queryFn: () =>
      searchFiles(
        {
          q,
          departmentId: departmentId || undefined,
          category: category || undefined,
          // The server takes instants; a date input gives a day, so the bounds are widened to
          // cover it — "to 3 March" must include documents filed at 4pm that day.
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        },
        page,
      ),
    // The server refuses anything shorter, so there is no point asking.
    enabled: queryIsSearchable,
  });

  const setFacet = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true });
    setPage(0);
  };

  const clearFacets = () => {
    setParams(q ? new URLSearchParams({ q }) : new URLSearchParams(), { replace: true });
    setPage(0);
  };

  const hasFacets = Boolean(departmentId || category || from || to);

  return (
    <AppShell
      title="Search"
      subtitle={q ? `Documents matching “${q}”` : 'Find a document by part of its name or its G.O. number'}
      actions={
        hasFacets ? (
          <Button variant="secondary" onClick={clearFacets}>
            Clear filters
          </Button>
        ) : undefined
      }
    >
      <div className="mb-5 grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Department"
          value={departmentId}
          onChange={(event) => setFacet('departmentId', event.target.value)}
        >
          <option value="">Every department</option>
          {(departments.data ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Category"
          value={category}
          onChange={(event) => setFacet('category', event.target.value)}
        >
          <option value="">Every category</option>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {formatCategory(value)}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Filed from"
          type="date"
          value={from}
          onChange={(event) => setFacet('from', event.target.value)}
        />
        <TextField
          label="Filed up to"
          type="date"
          value={to}
          onChange={(event) => setFacet('to', event.target.value)}
        />
      </div>

      {!queryIsSearchable ? (
        <Prompt />
      ) : results.isPending ? (
        <SkeletonRows count={4} label={`Searching for ${q}`} />
      ) : results.isError ? (
        <Alert tone="error">{toApiError(results.error).message}</Alert>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500" role="status">
            {results.data.totalItems === 0
              ? 'No documents match.'
              : `${results.data.totalItems} document${results.data.totalItems === 1 ? '' : 's'} found`}
          </p>

          <FileTable
            files={results.data.items}
            showLocation
            emptyMessage={
              hasFacets
                ? 'Nothing matches with these filters. Try clearing them.'
                : `Nothing matches “${q}”. Try a shorter piece of the name.`
            }
            onDelete={setDeleting}
            onReplace={setReplacing}
          />

          {results.data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Page {results.data.page + 1} of {results.data.totalPages}
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
                  disabled={page + 1 >= results.data.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <DeleteFileDialog file={deleting} onClose={() => setDeleting(null)} />
      <ReplaceFileDialog file={replacing} onClose={() => setReplacing(null)} />
    </AppShell>
  );
}

function Prompt() {
  return (
    <div
      className="animate-rise flex flex-col items-center rounded-xl border border-dashed
        border-line-strong bg-surface px-6 py-12 text-center"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-10 w-10 text-slate-300"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <p className="mt-3 text-sm text-slate-500">
        Type at least two characters — a piece of the file name or a G.O. number — to look across
        every department. A G.O. number can be searched by digits alone, even a single one.
      </p>
    </div>
  );
}
