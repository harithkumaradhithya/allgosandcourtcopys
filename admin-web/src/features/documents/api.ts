import { api } from '@/lib/api';
import type {
  Department,
  DownloadLink,
  DownloadRecord,
  FileDeletion,
  FileItem,
  Folder,
  FolderCategory,
  PageResponse,
  PreviewLink,
  SuggestedDestination,
  UploadResult,
} from '@/types/api';

/**
 * Every document call in one place, the way `features/admin/api.ts` holds every admin call.
 *
 * <p>Departments, folders and files are one API surface in practice — a folder screen needs all
 * three — so splitting them across three modules would only mean three imports on every page.
 */

export async function fetchDepartments(): Promise<Department[]> {
  const { data } = await api.get<Department[]>('/departments');
  return data;
}

/** Omit `parentFolderId` for the folders at the department's top level. */
export async function fetchFolders(
  departmentId: string,
  parentFolderId?: string,
): Promise<Folder[]> {
  const { data } = await api.get<Folder[]>(`/departments/${departmentId}/folders`, {
    params: { parentFolderId },
  });
  return data;
}

export async function fetchFolder(folderId: string): Promise<Folder> {
  const { data } = await api.get<Folder>(`/folders/${folderId}`);
  return data;
}

/** Root-first, ready to render straight into a breadcrumb. */
export async function fetchBreadcrumb(folderId: string): Promise<Folder[]> {
  const { data } = await api.get<Folder[]>(`/folders/${folderId}/breadcrumb`);
  return data;
}

export async function fetchSubfolders(folderId: string): Promise<Folder[]> {
  const { data } = await api.get<Folder[]>(`/folders/${folderId}/folders`);
  return data;
}

/** A folder in a department's tree, with how deep it sits, for indenting a flat list. */
export interface FolderChoice {
  folder: Folder;
  depth: number;
}

/**
 * Every folder in a department, flattened in the order a person reads them.
 *
 * <p>For the destination picker on the upload dialog, which has to offer somewhere to file a
 * document when the user did not start from inside a folder. The API lists one level at a time —
 * `/departments/{id}/folders` gives the top level and `/folders/{id}/folders` gives one folder's
 * children — so the tree is walked here.
 *
 * <p>That is one request per folder that turns out to have children, which is affordable for a
 * department holding a few dozen folders and would not be for thousands. The depth cap is a
 * guard against a cycle in the data rather than a product decision: a malformed parent link would
 * otherwise walk until the browser gave up.
 */
export async function fetchDepartmentFolderTree(
  departmentId: string,
  maxDepth = 4,
): Promise<FolderChoice[]> {
  const walk = async (folders: Folder[], depth: number): Promise<FolderChoice[]> => {
    if (depth > maxDepth) return [];

    const branches = await Promise.all(
      folders.map(async (folder) => {
        const children = depth < maxDepth ? await fetchSubfolders(folder.id) : [];
        return [{ folder, depth }, ...(await walk(children, depth + 1))];
      }),
    );
    return branches.flat();
  };

  return walk(await fetchFolders(departmentId), 0);
}

export async function fetchFolderFiles(
  folderId: string,
  page = 0,
): Promise<PageResponse<FileItem>> {
  const { data } = await api.get<PageResponse<FileItem>>(`/folders/${folderId}/files`, {
    params: { page },
  });
  return data;
}

/** One document. 404 once it has been deleted — see the deletions log for those. */
export async function fetchFile(fileId: string): Promise<FileItem> {
  const { data } = await api.get<FileItem>(`/files/${fileId}`);
  return data;
}

export async function fetchMyUploads(page = 0): Promise<PageResponse<FileItem>> {
  const { data } = await api.get<PageResponse<FileItem>>('/files/my-uploads', {
    params: { page },
  });
  return data;
}

export async function createFolder(
  departmentId: string,
  name: string,
  category: FolderCategory,
  parentFolderId?: string,
): Promise<Folder> {
  const { data } = await api.post<Folder>(`/departments/${departmentId}/folders`, {
    name,
    category,
    parentFolderId,
  });
  return data;
}

/**
 * Deletes an empty folder — admin-only, and refused by the server for the department's General
 * folder or for one still holding a document or a subfolder. The reason is sent to every other
 * account, the same way a file deletion is.
 */
export async function deleteFolder(folderId: string, reason: string): Promise<void> {
  await api.delete(`/folders/${folderId}`, { data: { reason } });
}

/**
 * Uploads into any department's folder — uploads are deliberately not restricted to the uploader's
 * own department.
 *
 * @param onProgress receives 0–100 for the request as a whole. The browser reports bytes sent for
 *   the whole body, so per-file progress means one request per file; the caller decides.
 */
export async function uploadFiles(
  folderId: string,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));

  const { data } = await api.post<UploadResult>('/files', form, {
    params: { folderId },
    onUploadProgress: (event) => {
      if (!onProgress) return;
      // `total` is absent on some proxies; leaving the bar where it is beats showing NaN.
      if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data;
}

/**
 * Guesses where an unfiled PDF belongs, from its own Abstract heading — for the quick-upload
 * button, so the department and folder pickers can start pre-filled instead of blank.
 *
 * <p>Nothing here is stored; the file still has to be uploaded for real afterward via {@link
 * uploadFiles}, wherever the caller ends up choosing.
 */
export async function suggestDestination(file: File): Promise<SuggestedDestination> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post<SuggestedDestination>('/files/suggest-destination', form);
  return data;
}

/**
 * Replaces a document with a corrected version, keeping its id and bumping its version.
 *
 * <p>Unlike upload, a refusal here is a failed request rather than an entry in a `rejected` list:
 * there is only one file, so its rejection is the request's.
 */
export async function replaceFile(
  fileId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FileItem> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post<FileItem>(`/files/${fileId}/replace`, form, {
    onUploadProgress: (event) => {
      if (!onProgress) return;
      if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data;
}

/** A fresh presigned URL, valid for minutes. Never cache one. */
export async function fetchDownloadLink(fileId: string): Promise<DownloadLink> {
  const { data } = await api.get<DownloadLink>(`/files/${fileId}/download-link`);
  return data;
}

/**
 * Soft-deletes a file. The reason is required by the server and is sent to every admin, so there is
 * no way to call this without one.
 */
export async function deleteFile(fileId: string, reason: string): Promise<void> {
  await api.delete(`/files/${fileId}`, { data: { reason } });
}

// ------------------------------------------------------------------- find and revisit

export interface SearchFilters {
  q: string;
  departmentId?: string;
  category?: FolderCategory;
  /** ISO instants. The server treats both bounds as inclusive. */
  from?: string;
  to?: string;
}

/**
 * Global search by part of a document's name, across every department.
 *
 * <p>The server refuses anything shorter than two characters with `SEARCH_TOO_SHORT`, so callers
 * should not fire a request for a single keystroke.
 */
export async function searchFiles(
  filters: SearchFilters,
  page = 0,
): Promise<PageResponse<FileItem>> {
  const { data } = await api.get<PageResponse<FileItem>>('/files/search', {
    params: {
      q: filters.q,
      departmentId: filters.departmentId || undefined,
      category: filters.category || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page,
    },
  });
  return data;
}

/** Newest documents across every department, for the home dashboard. */
export async function fetchRecentFiles(size = 5): Promise<PageResponse<FileItem>> {
  const { data } = await api.get<PageResponse<FileItem>>('/files/recent', { params: { size } });
  return data;
}

/**
 * An inline presigned URL. Only for documents whose `previewable` flag is true — anything else is
 * refused with `PREVIEW_UNSUPPORTED` rather than quietly downloading.
 */
export async function fetchPreviewLink(fileId: string): Promise<PreviewLink> {
  const { data } = await api.get<PreviewLink>(`/files/${fileId}/preview-link`);
  return data;
}

export async function fetchDownloadHistory(page = 0): Promise<PageResponse<DownloadRecord>> {
  const { data } = await api.get<PageResponse<DownloadRecord>>('/downloads', { params: { page } });
  return data;
}

// ------------------------------------------------------------------------ admin only

export async function fetchDeletions(
  status: 'deleted' | 'all',
  page = 0,
): Promise<PageResponse<FileDeletion>> {
  const { data } = await api.get<PageResponse<FileDeletion>>('/admin/deletions', {
    params: { status, page },
  });
  return data;
}

export async function restoreFile(fileId: string): Promise<FileItem> {
  const { data } = await api.post<FileItem>(`/admin/files/${fileId}/restore`);
  return data;
}

/**
 * Permanently removes a deleted document rather than waiting out the 30-day retention window.
 * Irreversible — there is no restore from here on.
 */
export async function purgeFile(fileId: string): Promise<void> {
  await api.post(`/admin/files/${fileId}/purge`);
}
