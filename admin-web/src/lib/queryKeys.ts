import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached query that shows documents.
 *
 * <p>Deleting, restoring or replacing a document changes what several unrelated screens
 * would display, and each of them used to re-list the keys it could think of. That works until
 * somebody adds a screen — which happened in Phase 4, when search and the home dashboard both
 * began showing files that a delete elsewhere should have removed.
 *
 * <p>So the list lives here, once. Add a new file-listing query key to this array and every existing
 * mutation starts refreshing it.
 */
const FILE_LIST_KEYS = [
  'folder-files',
  'my-uploads',
  'search',
  'recent-files',
  'downloads',
  'deletions',
  // Folder and department cards carry file counts, so they go stale for the same reasons.
  'folders',
  'departments',
];

/** Marks every document-bearing list stale, so each refetches when it is next on screen. */
export function invalidateFileLists(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => FILE_LIST_KEYS.includes(query.queryKey[0] as string),
  });
}

/**
 * Refreshes the document lists now, and once more shortly afterwards.
 *
 * <p>A document's description and G.O. number are read out of the file after the upload has been
 * answered — see {@code DocumentEnrichmentService} on the server — so the list drawn the instant an
 * upload finishes shows a dash in the Description column. The second pass picks those up without the
 * user having to work out that a refresh would help.
 */
export function refreshFileLists(queryClient: QueryClient): void {
  void invalidateFileLists(queryClient);
  window.setTimeout(() => void invalidateFileLists(queryClient), 5000);
}
