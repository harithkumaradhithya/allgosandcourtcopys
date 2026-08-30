/**
 * Dates are always shown in Asia/Kolkata, the zone the office works in. An admin elsewhere must not
 * see a different day from the one the record was written on.
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * The time of day alone, in the office's zone.
 *
 * <p>For the things that happened a moment ago and will be read a moment later — an autosave, a
 * draft kept while the network was down. The date would be noise: it is today, or the reader would
 * not be looking at it.
 */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Whole days from now until an ISO instant, rounded up — "1 day left" still means today, not
 * tomorrow, if there are fifteen hours left in it. Negative once the moment has passed, though
 * nothing should still be showing a countdown by then; the daily sweep runs well before that.
 */
export function daysUntil(iso: string): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / millisPerDay);
}

/** File sizes in the units a clerk reads, not bytes. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The five document classes the office files under, plus the plain container. */
const CATEGORY_LABELS: Record<string, string> = {
  CONTRACT: 'Contract',
  GOVT_ORDER: 'Government Order',
  COURT_ORDER: 'Court Order',
  CIRCULAR: 'Circular',
  ACT_RULE: 'Act / Rule',
  GENERAL: 'General',
};

export function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** A short label for the file-type column; the full MIME type means nothing to a user. */
export function formatFileType(contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType.startsWith('image/')) return contentType.slice(6).toUpperCase();
  if (contentType.includes('wordprocessingml') || contentType === 'application/msword') return 'Word';
  if (contentType.includes('spreadsheetml') || contentType === 'application/vnd.ms-excel') return 'Excel';
  return 'File';
}
