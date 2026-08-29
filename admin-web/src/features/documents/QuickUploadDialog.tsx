import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import type { ComboboxOption } from '@/components/ui/Combobox';
import { Alert } from '@/components/ui/Alert';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  createFolder,
  fetchDepartments,
  fetchFolders,
  suggestDestination,
  uploadFiles,
} from '@/features/documents/api';
import { toApiError } from '@/lib/errors';
import { formatCategory, formatFileSize } from '@/lib/format';
import { UPLOAD_CONCURRENCY, runWithLimit } from '@/lib/concurrency';
import { refreshFileLists } from '@/lib/queryKeys';
import type { FolderCategory } from '@/types/api';

type Status = 'waiting' | 'uploading' | 'done' | 'failed';

interface Item {
  file: File;
  status: Status;
  percent: number;
  error?: string;
}

type FolderMode = 'existing' | 'new';

const NEW_FOLDER_CATEGORIES: FolderCategory[] = [
  'GENERAL',
  'GOVT_ORDER',
  'COURT_ORDER',
  'CIRCULAR',
  'CONTRACT',
  'ACT_RULE',
];

/**
 * The floating Upload button's dialog — the fast path from "I have a document" to "it is filed",
 * without first navigating into a department and a folder by hand.
 *
 * <p>Choosing a file that is a PDF asks the server to guess which department it belongs to, from the
 * document's own Abstract heading — the same reading the description feature already does. A guess
 * only ever pre-fills the pickers below; nothing here is silently auto-filed; the uploader sees
 * exactly where it is about to go and can change either field before pressing Upload.
 *
 * <p>Every department carries a "General" folder, so whenever a department is settled — guessed or
 * chosen by hand — General is selected automatically. Picking a different existing folder, or
 * switching to "New folder", overrides that default; doing nothing does not block the upload.
 */
export function QuickUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(false);

  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [folderMode, setFolderMode] = useState<FolderMode>('existing');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCategory, setNewFolderCategory] = useState<FolderCategory>('GENERAL');
  const [destinationError, setDestinationError] = useState<string | null>(null);

  const [result, setResult] = useState<{ departmentName: string; folderName: string } | null>(null);

  const queryClient = useQueryClient();

  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });
  const folders = useQuery({
    queryKey: ['folders-root', departmentId],
    queryFn: () => fetchFolders(departmentId!),
    enabled: departmentId !== null,
  });

  // Whenever a department settles — guessed or chosen — and nothing has picked a folder of its own
  // yet, default to General. Every department has one (seeded by migration), so this always resolves
  // once the list loads.
  useEffect(() => {
    if (departmentId && folders.data && folderId === null) {
      const general = folders.data.find((folder) => folder.name.toLowerCase() === 'general');
      if (general) setFolderId(general.id);
    }
  }, [departmentId, folders.data, folderId]);

  const departmentOptions: ComboboxOption[] = useMemo(
    () =>
      (departments.data ?? []).map((department) => ({
        value: department.id,
        label: department.name,
        hint: department.code ?? undefined,
      })),
    [departments.data],
  );

  // Most recently active first — the folder someone just filed into is the one they are most likely
  // filing into again, General included.
  const folderOptions: ComboboxOption[] = useMemo(
    () =>
      [...(folders.data ?? [])]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((folder) => ({
          value: folder.id,
          label: folder.name,
          hint: formatCategory(folder.category),
        })),
    [folders.data],
  );

  const chooseFiles = async (files: File[]) => {
    setItems(files.map((file) => ({ file, status: 'waiting', percent: 0 })));

    const first = files[0];
    // Not `file.type === 'application/pdf'` alone: some Windows setups have no MIME type
    // registered for .pdf at all, and the File API then reports an empty string rather than
    // guessing — the extension is what actually tells a PDF apart here.
    const isPdf = first?.type === 'application/pdf' || first?.name.toLowerCase().endsWith('.pdf');
    if (!first || !isPdf || departmentId !== null) return;

    setSuggesting(true);
    try {
      const suggestion = await suggestDestination(first);
      if (suggestion.departmentId) {
        // A department chosen by hand while this was in flight wins — the request in flight lost
        // the race for the user's attention too.
        setDepartmentId((current) => current ?? suggestion.departmentId);
        setSuggested(true);
      }
    } catch {
      // Best-effort only: the ordinary pickers below still work with no suggestion at all.
    } finally {
      setSuggesting(false);
    }
  };

  const changeDepartment = (next: string | null) => {
    setDepartmentId(next);
    setFolderId(null); // belonged to the old department
    setSuggested(false);
  };

  const update = (index: number, patch: Partial<Item>) => {
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  };

  const start = async () => {
    if (!departmentId) return;
    setDestinationError(null);

    let targetFolderId = folderId;
    let targetFolderName = folders.data?.find((folder) => folder.id === folderId)?.name;

    if (folderMode === 'new') {
      if (!newFolderName.trim()) return;
      setBusy(true);
      try {
        const created = await createFolder(departmentId, newFolderName.trim(), newFolderCategory);
        targetFolderId = created.id;
        targetFolderName = created.name;
      } catch (error) {
        setDestinationError(toApiError(error).message);
        setBusy(false);
        return;
      }
    }

    if (!targetFolderId) return;
    setBusy(true);

    // Tracked locally rather than read back from `items` state afterward: state updates made
    // through the loop are asynchronous, so the `items` variable in this closure never reflects
    // them — only what each request itself reported does.
    let allSucceeded = true;
    const folder = targetFolderId;

    // A few at a time rather than one after another; see runWithLimit.
    await runWithLimit(items.length, UPLOAD_CONCURRENCY, async (index) => {
      if (items[index].status === 'done') return;
      update(index, { status: 'uploading', percent: 0, error: undefined });

      try {
        const uploadResult = await uploadFiles(folder, [items[index].file], (percent) =>
          update(index, { percent }),
        );
        const refusal = uploadResult.rejected[0];
        if (refusal) {
          update(index, { status: 'failed', error: refusal.message });
          allSucceeded = false;
        } else {
          update(index, { status: 'done', percent: 100 });
        }
      } catch (error) {
        update(index, { status: 'failed', error: toApiError(error).message });
        allSucceeded = false;
      }
    });

    setBusy(false);
    refreshFileLists(queryClient);

    if (allSucceeded && items.length > 0) {
      setResult({
        departmentName: departments.data?.find((department) => department.id === departmentId)?.name ?? '',
        folderName: targetFolderName ?? 'General',
      });
    }
  };

  const close = () => {
    if (busy) return;
    setItems([]);
    setDepartmentId(null);
    setFolderId(null);
    setFolderMode('existing');
    setNewFolderName('');
    setNewFolderCategory('GENERAL');
    setDestinationError(null);
    setSuggested(false);
    setResult(null);
    onClose();
  };

  if (result) {
    return (
      <Modal open={open} title="Document uploaded successfully" onClose={close}>
        <div className="flex flex-col items-center py-2 text-center">
          <span className="animate-pop flex h-12 w-12 items-center justify-center rounded-full bg-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="mt-4 text-sm text-slate-600">
            Filed in <span className="font-semibold text-slate-900">{result.departmentName}</span> ·{' '}
            <span className="font-semibold text-slate-900">{result.folderName}</span>
          </p>
          <Button className="mt-6" onClick={close}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  const pending = items.filter((item) => item.status !== 'done').length;
  const destinationReady =
    departmentId !== null && (folderMode === 'existing' ? folderId !== null : newFolderName.trim().length > 0);

  return (
    <Modal open={open} title="Upload a document" description="Choose a file — it can suggest where this belongs." onClose={close}>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="quick-upload-input"
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
            id="quick-upload-input"
            type="file"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void chooseFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>

        {items.length > 0 && (
          <ul className="stagger max-h-48 space-y-2 overflow-y-auto pr-0.5">
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
                  <span className="truncate text-sm font-medium text-slate-800">{item.file.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {item.status === 'uploading' ? `${item.percent}%` : formatFileSize(item.file.size)}
                  </span>
                </div>
                {item.status === 'failed' && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                    {item.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-lg border border-line bg-surface-sunken p-3.5">
          <Combobox
            label="Department"
            options={departmentOptions}
            value={departmentId}
            loading={departments.isPending}
            disabled={busy}
            placeholder="Search departments…"
            emptyMessage="No department matches"
            hint={
              suggesting
                ? 'Detecting the department from the document…'
                : suggested
                  ? 'Suggested from the document — change it if this looks wrong.'
                  : undefined
            }
            onChange={changeDepartment}
          />

          {/* Existing vs. new is a real fork, not a tab over the same field, so it reads as a
              choice rather than a settings toggle. */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {(['existing', 'new'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={busy || departmentId === null}
                onClick={() => setFolderMode(mode)}
                className={`flex-1 rounded-md py-1.5 transition-colors duration-[--duration-quick] ${
                  folderMode === mode
                    ? 'bg-surface text-navy-800 shadow-card'
                    : 'text-slate-500 hover:text-navy-700'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {mode === 'existing' ? 'Existing folder' : 'New folder'}
              </button>
            ))}
          </div>

          {folderMode === 'existing' ? (
            <Combobox
              label="Folder"
              options={folderOptions}
              value={folderId}
              loading={departmentId !== null && folders.isPending}
              disabled={busy || departmentId === null}
              placeholder={departmentId === null ? 'Choose a department first' : 'Search folders…'}
              emptyMessage="No folder matches"
              hint="Left blank, this defaults to General."
              onChange={setFolderId}
            />
          ) : (
            <div className="space-y-3">
              <TextField
                label="New folder name"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                maxLength={255}
                disabled={busy || departmentId === null}
              />
              <SelectField
                label="Category"
                value={newFolderCategory}
                disabled={busy || departmentId === null}
                onChange={(event) => setNewFolderCategory(event.target.value as FolderCategory)}
              >
                {NEW_FOLDER_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {formatCategory(value)}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
        </div>

        {destinationError && <Alert tone="error">{destinationError}</Alert>}

        {items.some((item) => item.status === 'failed') && !busy && (
          <Alert tone="error">Some files were not accepted. The rest were uploaded — fix those and try again.</Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void start()}
            loading={busy}
            disabled={items.length === 0 || pending === 0 || !destinationReady}
          >
            {pending === 0 && items.length > 0
              ? 'Upload'
              : !destinationReady
                ? 'Choose a department'
                : `Upload ${pending} file${pending === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
