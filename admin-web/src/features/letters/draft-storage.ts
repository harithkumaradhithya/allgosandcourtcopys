import type { LetterDraft } from '@/features/letters/api';

/**
 * The copy of a letter that never depends on the network.
 *
 * <p><b>Why this exists at all.</b> The server keeps drafts too, and that is the copy worth having:
 * it follows the writer to another machine and cannot be cleared by a browser. But it is reachable
 * only when the network and the server both are, and the moments a half-written letter is most
 * likely to be lost are exactly the moments they are not — the connection dropping, the server being
 * restarted, the laptop closing. So every keystroke also lands here, in the browser, where saving
 * cannot fail for any reason outside the machine it is typed on.
 *
 * <p>The two copies are not rivals. The local one is written constantly and is authoritative only
 * until the server has caught up; {@link isAheadOf} is what decides that, and the editor asks the
 * writer rather than guessing when the local copy turns out to be the newer of the two.
 *
 * <p><b>Keyed by author.</b> These machines are shared — a section office has one computer and
 * several people. A snapshot is stored under the id of whoever wrote it, so signing in as somebody
 * else never offers you their unfinished letter.
 */

const PREFIX = 'allgos.letter-draft';

/** The snapshot kept for a letter that has never been saved anywhere. */
export const NEW_LETTER = 'new';

export interface LocalDraft {
  /** The letter as it stood, including anything typed straight into the preview. */
  draft: LetterDraft;
  /**
   * The server-side draft this was being autosaved into, if one was created before the network
   * went. Kept so that coming back continues that draft rather than starting a second one.
   */
  draftId: string | null;
  /** When this snapshot was taken, as an ISO instant. */
  savedAt: string;
}

function key(userId: string, letterId: string): string {
  return `${PREFIX}.${userId}.${letterId}`;
}

/**
 * Keeps the letter on this machine.
 *
 * <p>Never throws. Storage is refused in a private window and full on a machine somebody has been
 * using for years, and neither is a reason to interrupt somebody writing a letter — the server copy
 * is still being written, and the editor shows which copies exist.
 */
export function writeLocalDraft(
  userId: string,
  letterId: string,
  snapshot: Omit<LocalDraft, 'savedAt'>,
): boolean {
  try {
    const stored: LocalDraft = { ...snapshot, savedAt: new Date().toISOString() };
    window.localStorage.setItem(key(userId, letterId), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/** What was kept, or null where there is nothing or what is there cannot be read. */
export function readLocalDraft(userId: string, letterId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key(userId, letterId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    // A snapshot written by an older version of this screen, or by something else entirely. Ignored
    // rather than repaired: offering somebody a letter assembled out of a half-understood object is
    // worse than offering nothing.
    if (!parsed || typeof parsed !== 'object' || !parsed.draft || !parsed.savedAt) return null;

    return { draft: parsed.draft, draftId: parsed.draftId ?? null, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearLocalDraft(userId: string, letterId: string): void {
  try {
    window.localStorage.removeItem(key(userId, letterId));
  } catch {
    // Nothing to do and nothing worth saying: the snapshot is stale, not harmful.
  }
}

/**
 * Forgets a draft that has been thrown away, wherever on this machine it was kept.
 *
 * <p>A letter written from scratch is kept under {@link NEW_LETTER} rather than under the id of the
 * draft row it was being autosaved into, so discarding that draft from the list has to clear both.
 * Otherwise the next new letter opens offering back the one that was just discarded — which is not
 * a data loss, but it is the application arguing with somebody who has already decided.
 */
export function forgetDraft(userId: string, draftId: string): void {
  clearLocalDraft(userId, draftId);

  const unsaved = readLocalDraft(userId, NEW_LETTER);
  if (unsaved?.draftId === draftId) {
    clearLocalDraft(userId, NEW_LETTER);
  }
}

/**
 * Whether the copy on this machine is newer than what the server has.
 *
 * <p>Both stamps are clocks — the browser's and the server's — and they do not agree to the second.
 * A margin absorbs that: a snapshot has to be a clear few seconds ahead before the writer is asked
 * about it, so an ordinary save does not produce a "you have unsaved changes" banner about the
 * change that was just saved.
 */
export function isAheadOf(snapshot: LocalDraft, serverUpdatedAt: string | null): boolean {
  if (!serverUpdatedAt) return true;

  const local = Date.parse(snapshot.savedAt);
  const server = Date.parse(serverUpdatedAt);
  if (Number.isNaN(local) || Number.isNaN(server)) return false;

  return local - server > 5_000;
}

/** Whether anything has actually been written, so an empty form is never offered back as a draft. */
export function hasContent(draft: LetterDraft): boolean {
  return [
    draft.subject,
    draft.body,
    draft.toBlock,
    draft.reference,
    draft.referenceNo,
    draft.enclosure,
    draft.copyTo,
    draft.tableData,
  ].some((value) => value.trim().length > 0);
}

/** Whether two drafts differ in any block, which is what decides that a save is worth making. */
export function differs(a: LetterDraft, b: LetterDraft): boolean {
  return (Object.keys(a) as Array<keyof LetterDraft>).some((field) => a[field] !== b[field]);
}
