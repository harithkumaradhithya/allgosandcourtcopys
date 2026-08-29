import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { uploadFiles } from '@/features/documents/api';
import { UploadDestination } from '@/features/documents/UploadDestination';
import type { Destination } from '@/features/documents/UploadDestination';
import { toApiError } from '@/lib/errors';
import { formatFileSize } from '@/lib/format';
import { UPLOAD_CONCURRENCY, runWithLimit } from '@/lib/concurrency';
import { refreshFileLists } from '@/lib/queryKeys';

type Status = 'waiting' | 'uploading' | 'done' | 'failed';

interface Item {
  file: File;
  status: Status;
  percent: number;
  /** The server's wording for a refusal — never invented here. */
  error?: string;
  /** The Abstract paragraph the server read off the document itself, once it has finished uploading. */
  description?: string | null;
  /** The G.O. number read off the document, alongside the description. */
  goNumber?: string | null;
}

/**
 * Uploads documents into the current folder, one request per file.
 *
 * <p>One request each rather than one for the batch, because the browser reports bytes sent for the
 * whole body: a single request could only ever draw one bar for eight files. It also means a
 * rejected file — a .pdf whose bytes are an executable — leaves the others untouched, which matches
 * what the server does anyway.
 *
 * <p>Not a TanStack mutation: this is progressive per-file state driven by upload callbacks rather
 * than a single request with a single result. The document lists are invalidated at the end, which
 * is the part that has to go through the query client.
 *
 * <p>Opened from a folder it files there and says so. Opened from anywhere else — My Uploads, which
 * has no folder to speak of — it asks for a destination first, because there is no such thing as a
 * document that belongs to nothing.
 */
export function UploadDialog({
  open,
  folderId,
  folderName,
  onClose,
}: {
  open: boolean;
  /** Omit both to have the dialog ask where the documents should be filed. */
  folderId?: string;
  folderName?: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Destination | null>(null);
  const queryClient = useQueryClient();

  // The folder passed in always wins; the picker only exists to fill the gap when there is none.
  const asking = folderId === undefined;
  const targetId = folderId ?? picked?.id;
  const targetName = folderName ?? picked?.name;

  const update = (index: number, patch: Partial<Item>) => {
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  };

  const start = async () => {
    if (!targetId) return;
    setBusy(true);

    // A few at a time rather than one after another: each file is its own request, and waiting for
    // one to finish before opening the next left the connection idle between them.
    await runWithLimit(items.length, UPLOAD_CONCURRENCY, async (index) => {
      if (items[index].status === 'done') return;
      update(index, { status: 'uploading', percent: 0, error: undefined });

      try {
        const result = await uploadFiles(targetId, [items[index].file], (percent) =>
          update(index, { percent }),
        );

        // A 200 does not mean accepted: the server reports refusals in `rejected`.
        const refusal = result.rejected[0];
        if (refusal) {
          update(index, { status: 'failed', error: refusal.message });
        } else {
          const uploaded = result.uploaded[0];
          update(index, {
            status: 'done',
            percent: 100,
            description: uploaded?.description,
            goNumber: uploaded?.goNumber,
          });
        }
      } catch (error) {
        update(index, { status: 'failed', error: toApiError(error).message });
      }
    });

    setBusy(false);
    // Every document-bearing list, not a hand-picked three: a document arriving changes the folder,
    // My Uploads, the home dashboard's recents and the counts on the department cards.
    refreshFileLists(queryClient);
  };

  const close = () => {
    if (busy) return; // closing mid-upload would leave the bars lying about what happened
    setItems([]);
    setPicked(null);
    onClose();
  };

  const pending = items.filter((item) => item.status !== 'done').length;
  const done = items.filter((item) => item.status === 'done').length;

  return (
    <Modal
      open={open}
      title="Upload documents"
      description={targetName ? `Into ${targetName}` : 'Choose the files and where they should be filed.'}
      onClose={close}
    >
      <div className="space-y-4">
        {asking && (
          <UploadDestination value={picked} onChange={setPicked} disabled={busy} />
        )}

        <div>
          <label
            htmlFor="upload-input"
            className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2
              border-dashed border-line-strong px-4 py-7 text-center transition-all
              duration-[--duration-base] ease-[--ease-settle] hover:border-navy-400 hover:bg-navy-50/70"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-slate-400 transition-all duration-[--duration-base]
                ease-[--ease-settle] group-hover:-translate-y-0.5 group-hover:text-navy-500"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5" />
              <path d="M12 3v13" />
            </svg>
            <span className="mt-2 text-sm font-medium text-navy-700">Choose files</span>
            <span className="mt-1 text-xs text-slate-500">
              PDF, JPG, PNG, TIFF, Word or Excel · up to 50 MB each
            </span>
          </label>
          <input
            id="upload-input"
            type="file"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const chosen = Array.from(event.target.files ?? []);
              setItems(chosen.map((file) => ({ file, status: 'waiting', percent: 0 })));
              event.target.value = ''; // so the same file can be picked again after a failure
            }}
          />
        </div>

        {items.length > 0 && (
          <ul className="stagger max-h-64 space-y-2 overflow-y-auto pr-0.5">
            {items.map((item, index) => (
              <li
                key={`${item.file.name}-${index}`}
                className={`rounded-lg border p-3 transition-colors duration-[--duration-base]
                  ease-[--ease-settle] ${
                    item.status === 'failed'
                      ? 'border-red-200 bg-red-50/50'
                      : item.status === 'done'
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200'
                  }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusMark status={item.status} />
                    <span className="truncate text-sm font-medium text-slate-800">
                      {item.file.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {item.status === 'uploading'
                      ? `${item.percent}%`
                      : formatFileSize(item.file.size)}
                  </span>
                </div>

                {/* The bar disappears once a file is settled: a finished row does not need a
                    permanent full bar, and removing it makes the remaining work obvious. */}
                {item.status !== 'done' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-[--duration-base]
                        ease-[--ease-settle] ${
                          item.status === 'failed' ? 'bg-red-500' : 'bg-navy-500'
                        }`}
                      style={{ width: `${item.status === 'failed' ? 100 : item.percent}%` }}
                    />
                  </div>
                )}

                {item.status === 'failed' && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                    {item.error}
                  </p>
                )}

                {/* Read off the document itself, so it's worth showing right away rather than
                    making the uploader open the file back up to see what the server made of it. */}
                {item.status === 'done' && item.description && (
                  <div className="mt-1.5 border-t border-emerald-100 pt-1.5">
                    {item.goNumber && (
                      <p className="text-xs font-semibold text-navy-700">{item.goNumber}</p>
                    )}
                    <p className="line-clamp-2 text-xs text-slate-600" title={item.description}>
                      {item.description}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {items.some((item) => item.status === 'failed') && !busy && (
          <Alert tone="error">
            Some files were not accepted. The rest were uploaded — fix those and try again.
          </Alert>
        )}

        {done > 0 && !busy && pending === 0 && (
          <Alert tone="success">
            {done} {done === 1 ? 'document is' : 'documents are'} now filed in {targetName}.
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>
            {items.some((item) => item.status === 'done') ? 'Done' : 'Cancel'}
          </Button>
          {/* Both halves are required, so the button says which one is still missing rather than
              sitting there greyed out with no explanation. */}
          <Button
            type="button"
            onClick={start}
            loading={busy}
            disabled={pending === 0 || !targetId}
          >
            {pending === 0
              ? 'Upload'
              : !targetId
                ? 'Choose a folder'
                : `Upload ${pending} file${pending === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The state of one file, as a mark rather than a word.
 *
 * <p>Each state has its own shape as well as its own colour — a tick, a cross, a spinner — so the
 * row is readable without relying on colour vision. The text beside it still says what happened.
 */
function StatusMark({ status }: { status: Status }) {
  if (status === 'uploading') {
    return (
      <span
        aria-hidden
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-navy-500 border-t-transparent"
      />
    );
  }

  if (status === 'done') {
    return (
      <span
        aria-hidden
        className="animate-pop flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        aria-hidden
        className="animate-pop flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" className="h-2.5 w-2.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </span>
    );
  }

  return <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />;
}
