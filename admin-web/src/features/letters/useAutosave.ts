import { useCallback, useEffect, useRef, useState } from 'react';
import { createDraft, discardDraft, updateDraft, type LetterDraft } from '@/features/letters/api';
import {
  NEW_LETTER,
  clearLocalDraft,
  differs,
  hasContent,
  writeLocalDraft,
} from '@/features/letters/draft-storage';

/**
 * Where the letter has got to, in the words the editor puts on the screen.
 *
 * <p>`local` is the honest answer when the server cannot be reached: the letter is safe on this
 * machine and goes up as soon as there is something to go up to. Saying "saved" there would be a lie
 * the writer only discovers on another computer.
 */
export type AutosaveState = 'clean' | 'pending' | 'saving' | 'saved' | 'local';

export interface Autosave {
  state: AutosaveState;
  /** When the server last accepted the draft; null while it never has. */
  syncedAt: Date | null;
  /** The server-side draft being written into, once one exists. */
  draftId: string | null;
  /**
   * Takes over a draft row started earlier — the one a recovered snapshot was being saved into
   * before the browser closed. Without it, carrying on with that letter would start a second draft
   * beside the first and leave the abandoned one in the list.
   */
  adopt: (draftId: string) => void;
  /** Called as a real save begins, so autosave does not start a second row beside it. */
  suspend: () => void;
  /** Called if that save failed, to carry on protecting the letter. */
  resume: () => void;
  /** Called once the letter is properly saved: the draft copies are no longer the record. */
  settle: (letterId: string, saved: LetterDraft) => void;
}

/** Long enough that a sentence is not a dozen requests; short enough to survive a closing laptop. */
const SERVER_DELAY_MS = 1_500;
const LOCAL_DELAY_MS = 300;

/** What the last attempt at the server came to. The screen's wording is derived from it, not stored. */
interface Sync {
  status: 'idle' | 'saving' | 'saved' | 'failed';
  /** The version the server accepted, so an unchanged letter is not sent again on a timer. */
  accepted: LetterDraft | null;
  at: Date | null;
}

const NOTHING_SENT: Sync = { status: 'idle', accepted: null, at: null };

/**
 * Keeps a letter that is being written, in two places, without being asked.
 *
 * <p><b>The local copy is written first and unconditionally.</b> It cannot fail on account of
 * anything outside this machine, which is the whole point of it: the network dropping mid-sentence,
 * or the server going down for a restart, must cost the writer nothing. The server copy follows a
 * moment later — that is the one that survives this computer and follows the writer to another — and
 * when it cannot be reached the hook says so plainly and tries again on the next keystroke. Nothing
 * is thrown away, and nothing is called saved that is not.
 *
 * <p><b>It runs only once something has been changed.</b> `enabled` is the editor saying the writer
 * has actually typed. Opening a letter and walking away leaves nothing behind: a seeded From block
 * and today's date are not a letter, and a drafts list that filled up with them would be worse than
 * no drafts list at all.
 *
 * @param userId whoever is writing — snapshots are kept per author, because these machines are shared
 * @param letterId the letter being edited, or null for one that has never been saved
 * @param draft the letter as it currently stands
 * @param enabled whether there is anything worth keeping yet
 */
export function useLetterAutosave({
  userId,
  letterId,
  draft,
  enabled,
}: {
  userId: string | null;
  letterId: string | null;
  draft: LetterDraft;
  enabled: boolean;
}): Autosave {
  const [sync, setSync] = useState<Sync>(NOTHING_SENT);
  const [draftId, setDraftId] = useState<string | null>(null);

  /** The current draft, for the handlers that fire outside React's flow — unload, unmount. */
  const latestRef = useRef(draft);
  const draftIdRef = useRef<string | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  /** Held while a real save is in progress, so autosave cannot create a row beside it. */
  const blockedRef = useRef(false);
  /**
   * Bumped whenever what autosave was doing stops being relevant — a save starting, a save
   * finishing. A response that arrives across a bump is ignored rather than applied to a letter that
   * has moved on since it was sent.
   */
  const epochRef = useRef(0);

  const storageKey = letterId ?? NEW_LETTER;
  const worthSaving =
    enabled && hasContent(draft) && (sync.accepted === null || differs(draft, sync.accepted));

  useEffect(() => {
    latestRef.current = draft;
  }, [draft]);

  useEffect(() => {
    targetIdRef.current = letterId ?? draftId;
  }, [draftId, letterId]);

  // ------------------------------------------------------------------ the local copy

  useEffect(() => {
    if (!worthSaving || !userId) return undefined;

    const timer = window.setTimeout(() => {
      writeLocalDraft(userId, storageKey, { draft, draftId: draftIdRef.current });
    }, LOCAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [draft, storageKey, userId, worthSaving]);

  /**
   * The last chance to keep what is on the screen.
   *
   * <p>A tab closed, a machine asleep, a browser killed: none of them wait for a timer. `pagehide`
   * fires where `beforeunload` does not, and writing to localStorage is synchronous, so the snapshot
   * is complete before the page goes.
   */
  useEffect(() => {
    if (!worthSaving || !userId) return undefined;

    const keep = () => {
      if (blockedRef.current) return;
      writeLocalDraft(userId, storageKey, { draft, draftId: draftIdRef.current });
    };

    window.addEventListener('pagehide', keep);
    document.addEventListener('visibilitychange', keep);
    return () => {
      window.removeEventListener('pagehide', keep);
      document.removeEventListener('visibilitychange', keep);
    };
  }, [draft, storageKey, userId, worthSaving]);

  // ----------------------------------------------------------------- the server copy

  useEffect(() => {
    if (!worthSaving) return undefined;

    const timer = window.setTimeout(async () => {
      if (inFlightRef.current || blockedRef.current) return;

      const epoch = epochRef.current;
      const sending = latestRef.current;
      const id = targetIdRef.current;
      inFlightRef.current = true;
      setSync((current) => ({ ...current, status: 'saving' }));

      try {
        const stored = id ? await updateDraft(id, sending) : await createDraft(sending);

        if (epoch !== epochRef.current) {
          // The letter was saved properly while this was in flight. A draft row created just now is
          // a duplicate of a letter that already exists, so it goes rather than being left in the
          // drafts list for somebody to wonder about later.
          if (!id) void discardDraft(stored.id).catch(() => {});
          return;
        }

        setSync({ status: 'saved', accepted: sending, at: new Date() });

        if (!id) {
          draftIdRef.current = stored.id;
          setDraftId(stored.id);

          // The snapshot on this machine was written before there was a draft row to point at. It
          // is rewritten now rather than on the next keystroke: if the browser goes in between,
          // carrying on with the recovered letter would otherwise start a second draft and leave
          // this one stranded in the list.
          if (userId) writeLocalDraft(userId, storageKey, { draft: sending, draftId: stored.id });
        }
      } catch {
        // Offline, a server restarting, a request that timed out — all the same answer to the
        // writer. The letter is on this machine, the badge says exactly that, and the next keystroke
        // tries again.
        if (epoch === epochRef.current) setSync((current) => ({ ...current, status: 'failed' }));
      } finally {
        inFlightRef.current = false;
      }
    }, SERVER_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [draft, storageKey, userId, worthSaving]);

  /** Retries the moment the machine is back on the network, rather than on the next keystroke. */
  useEffect(() => {
    if (sync.status !== 'failed') return undefined;

    // Forgetting what the two copies last agreed on is enough: the effect above then sees a letter
    // that differs from nothing, and sends it again.
    const retry = () => setSync(NOTHING_SENT);

    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [sync.status]);

  const adopt = useCallback((existingDraftId: string) => {
    draftIdRef.current = existingDraftId;
    setDraftId(existingDraftId);
  }, []);

  const suspend = useCallback(() => {
    epochRef.current += 1;
    blockedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    blockedRef.current = false;
  }, []);

  /**
   * The letter has been saved as a letter.
   *
   * <p>Both draft copies go: the snapshot under the new letter's own id, and the one under "new",
   * which is where a letter that had never been saved was being kept. Autosave itself carries on —
   * an edit made after saving deserves the same protection as one made before.
   */
  const settle = useCallback(
    (savedLetterId: string, saved: LetterDraft) => {
      epochRef.current += 1;
      blockedRef.current = false;
      draftIdRef.current = null;
      setDraftId(null);
      setSync({ status: 'idle', accepted: saved, at: null });

      if (!userId) return;
      clearLocalDraft(userId, NEW_LETTER);
      clearLocalDraft(userId, savedLetterId);
    },
    [userId],
  );

  /**
   * What the badge says. Derived rather than stored: "there are changes not sent yet" is exactly the
   * condition the two effects above run on, and a second copy of it in state would be the copy that
   * ends up disagreeing.
   */
  const state: AutosaveState =
    sync.status === 'saving'
      ? 'saving'
      : sync.status === 'failed'
        ? 'local'
        : worthSaving
          ? 'pending'
          : sync.status === 'saved'
            ? 'saved'
            : 'clean';

  return { state, syncedAt: sync.at, draftId, adopt, suspend, resume, settle };
}
