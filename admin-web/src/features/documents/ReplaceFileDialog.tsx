import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { replaceFile } from '@/features/documents/api';
import { toApiError } from '@/lib/errors';
import { formatFileSize } from '@/lib/format';
import { invalidateFileLists } from '@/lib/queryKeys';
import type { FileItem } from '@/types/api';

/**
 * Replaces a document with a corrected version of it.
 *
 * <p>The alternative — delete with a reason, then upload again — loses the document's identity and
 * puts a spurious entry in the deletions log every time a typo is fixed. Replacing keeps the id, so
 * anything already pointing at the document still finds it, and bumps the version.
 */
export function ReplaceFileDialog({
  file,
  onClose,
}: {
  file: FileItem | null;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<File | null>(null);
  const [percent, setPercent] = useState(0);
  const queryClient = useQueryClient();

  const replace = useMutation({
    mutationFn: () => replaceFile(file!.id, chosen!, setPercent),
    onSuccess: () => {
      // The document keeps its id, so a search result still points at it — and both
      // now show a stale name and size until they are re-read.
      void invalidateFileLists(queryClient);
      close();
    },
  });

  const close = () => {
    if (replace.isPending) return;
    setChosen(null);
    setPercent(0);
    replace.reset();
    onClose();
  };

  return (
    <Modal
      open={file !== null}
      title="Replace this document?"
      description={
        file
          ? `“${file.fileName}” stays where it is and keeps its history — only its contents change.`
          : undefined
      }
      onClose={close}
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="replace-input"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2
              border-dashed border-line-strong px-4 py-6 text-center transition hover:border-navy-400"
          >
            <span className="text-sm font-medium text-navy-700">
              {chosen ? 'Choose a different file' : 'Choose the corrected file'}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Checked the same way as any upload · up to 50 MB
            </span>
          </label>
          <input
            id="replace-input"
            type="file"
            className="sr-only"
            disabled={replace.isPending}
            onChange={(event) => {
              setChosen(event.target.files?.[0] ?? null);
              setPercent(0);
              replace.reset();
              event.target.value = ''; // so the same file can be picked again after a failure
            }}
          />
        </div>

        {chosen && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-slate-800">{chosen.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatFileSize(chosen.size)}</span>
            </div>
            {replace.isPending && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-navy-500 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {replace.isError && <Alert tone="error">{toApiError(replace.error).message}</Alert>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={replace.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => replace.mutate()}
            loading={replace.isPending}
            disabled={!chosen}
          >
            Replace document
          </Button>
        </div>
      </div>
    </Modal>
  );
}
