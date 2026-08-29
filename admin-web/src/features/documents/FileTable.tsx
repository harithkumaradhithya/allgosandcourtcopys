import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { DescriptionDialog } from '@/features/documents/DescriptionDialog';
import { fetchDownloadLink } from '@/features/documents/api';
import { toApiError } from '@/lib/errors';
import { formatDateTime, formatFileSize, formatFileType } from '@/lib/format';
import { fileTypeTone } from '@/lib/tones';
import type { FileItem } from '@/types/api';

/**
 * The list of documents, used by both a folder and My Uploads.
 *
 * <p>Downloading is two steps: ask the server for a presigned URL, then follow it. The URL is
 * fetched at the moment of the click rather than rendered into every row, so nothing on screen is a
 * live link to storage and a stale one cannot linger in the DOM.
 */
export function FileTable({
  files,
  emptyMessage,
  emptyAction,
  showLocation = false,
  onDelete,
  onReplace,
}: {
  files: FileItem[];
  emptyMessage: string;
  /**
   * The way out of an empty screen.
   *
   * <p>An empty state that only explains itself leaves the user to work out where to go next. Where
   * there is an obvious next step — uploading, on a list of your own uploads — it belongs here,
   * under the sentence that says nothing is there.
   */
  emptyAction?: ReactNode;
  /** My Uploads spans departments, so it needs the "where" column that a folder does not. */
  showLocation?: boolean;
  onDelete: (file: FileItem) => void;
  onReplace: (file: FileItem) => void;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingDescription, setViewingDescription] = useState<FileItem | null>(null);

  const download = async (file: FileItem) => {
    setDownloading(file.id);
    setError(null);
    try {
      const link = await fetchDownloadLink(file.id);
      window.location.assign(link.url);
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setDownloading(null);
    }
  };

  if (files.length === 0) {
    return (
      <div className="animate-rise flex flex-col items-center rounded-xl border border-dashed border-line-strong
        bg-surface px-6 py-12 text-center">
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table
          className={`w-full text-left text-sm ${showLocation ? 'min-w-[1040px]' : 'min-w-[920px]'}`}
        >
          <thead className="border-b border-line bg-navy-50/60 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Document</th>
              <th scope="col" className="px-5 py-3 font-semibold">Description</th>
              {showLocation && <th scope="col" className="px-5 py-3 font-semibold">Location</th>}
              <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">Uploaded by</th>
              <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">Uploaded</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="stagger divide-y divide-slate-100">
            {files.map((file) => (
              <tr
                key={file.id}
                className="group/row transition-colors duration-[--duration-base] ease-[--ease-settle]
                  hover:bg-navy-50/70"
              >
                <td className="max-w-[22rem] px-5 py-3">
                  <div className="flex items-center gap-3">
                    <FileGlyph contentType={file.fileType} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 transition-colors
                        duration-[--duration-base] group-hover/row:text-navy-800">
                        {file.fileName}
                      </p>
                      <p className="text-xs text-slate-500 transition-colors
                        duration-[--duration-base] group-hover/row:text-navy-600">
                        {formatFileType(file.fileType)} · {formatFileSize(file.sizeBytes)}
                        {/* Only worth saying once a document has actually been replaced. */}
                        {file.version > 1 && (
                          <span className="ml-1.5 rounded-full bg-navy-50 px-1.5 py-0.5 font-medium text-navy-700">
                            v{file.version}
                          </span>
                        )}
                      </p>
                      {/* Read from the document itself on upload — see DocumentAbstractExtractor —
                          so a G.O. can be found again by its number, not only by the file's name. */}
                      {file.goNumber && (
                        <p className="truncate text-xs font-medium text-navy-600" title={file.goNumber}>
                          {file.goNumber}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  {file.description ? (
                    <button
                      type="button"
                      onClick={() => setViewingDescription(file)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5
                        text-[0.8125rem] font-semibold text-navy-700 outline-none transition-all
                        duration-[--duration-quick] ease-[--ease-settle] hover:bg-navy-50
                        hover:text-navy-800 focus-visible:ring-2 focus-visible:ring-navy-300"
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      View
                    </button>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                {showLocation && (
                  <td className="max-w-[14rem] px-5 py-3.5 text-slate-600">
                    <p className="truncate" title={file.departmentName}>
                      {file.departmentName}
                    </p>
                    <p className="truncate text-xs text-slate-400" title={file.folderName}>
                      {file.folderName}
                    </p>
                  </td>
                )}
                <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 transition-colors
                  duration-[--duration-base] group-hover/row:text-navy-700">
                  {file.uploadedByName}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 transition-colors
                  duration-[--duration-base] group-hover/row:text-navy-700">
                  {formatDateTime(file.uploadedAt)}
                </td>
                <td className="px-3 py-3">
                  {/* These used to sit at 60% until the row was hovered. Against the lighter brand
                      blue that lands around 2:1 on white — legible only if you already know what it
                      says. The row's own hover tint is the affordance now, and the labels stay
                      readable at rest, which they have to be on touch and for a keyboard anyway. */}
                  <div className="flex justify-end gap-1">
                    {/* Only offered when the browser can actually render it — see `previewable`.
                        A Preview button that downloaded instead would be a lie. */}
                    {file.previewable && (
                      <Link
                        to={`/files/${file.id}`}
                        className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[0.8125rem]
                          font-semibold text-navy-700 outline-none transition-all
                          duration-[--duration-quick] ease-[--ease-settle] hover:bg-navy-50
                          focus-visible:ring-2 focus-visible:ring-navy-300"
                      >
                        Preview
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void download(file)}
                      loading={downloading === file.id}
                    >
                      Download
                    </Button>
                    {/* Hidden when the server says the caller may not change it; the server
                        re-checks anyway, so this is tidiness rather than protection. */}
                    {file.canModify && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => onReplace(file)}>
                          Replace
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(file)}
                          className="text-red-600! hover:bg-red-50!"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DescriptionDialog file={viewingDescription} onClose={() => setViewingDescription(null)} />
    </div>
  );
}

/**
 * A tinted square per file type — red for PDF, emerald for a spreadsheet, and so on.
 *
 * <p>Colour is never the only signal: the type is also spelled out in the line underneath, so this
 * is recognition at a glance rather than information only some people receive.
 */
function FileGlyph({ contentType }: { contentType: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform
        duration-[--duration-base] ease-[--ease-settle] group-hover/row:scale-105
        ${fileTypeTone(contentType).chip}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4.5 w-4.5"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
      </svg>
    </span>
  );
}
