/**
 * Remembering that somebody put an advert away.
 *
 * <p>This is the single most important thing in the feature. An advert that cannot be dismissed is
 * one people learn to scroll past, and once they have learned that, they scroll past the region it
 * sits in — which on the Home screen is also where their own uploads and the office announcements
 * are. Banner blindness is not a cost the advert pays; it is a cost the rest of the page pays.
 *
 * <p>So a dismissal lasts a fortnight rather than a session, and is remembered per advert rather
 * than per slot: putting away a poster you have read should not hide the next one, and it should
 * not un-hide the one you read the moment you open a new tab.
 *
 * <p>Kept in `localStorage` rather than on the server. A dismissal is a preference of this browser,
 * not a fact about the user worth a column and a migration — and storing it server-side would mean
 * an advert could not be drawn until a second request had answered, which is exactly the flicker
 * this slot is built to avoid.
 */

const STORAGE_KEY = 'allgos.ads.dismissed';

/** Long enough that a dismissal means something, short enough that a new campaign is seen. */
export const DISMISSAL_DAYS = 14;

const DISMISSAL_MS = DISMISSAL_DAYS * 24 * 60 * 60 * 1000;

/** Advert id to the moment it was dismissed. */
type Dismissals = Record<string, number>;

function read(): Dismissals {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // Anything else in this key is somebody else's data or a half-written value; start over rather
    // than crash a screen over a stored preference.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Dismissals;
  } catch {
    // Private browsing, storage disabled by policy, or unparseable. Nothing is dismissed.
    return {};
  }
}

/**
 * The dismissals still in force, with the expired ones dropped.
 *
 * <p>Pruned on every read rather than swept on a timer: the map is written back only when something
 * actually fell out of it, so the common case is a parse and a filter that changes nothing.
 */
export function activeDismissals(now: number = Date.now()): Dismissals {
  const stored = read();
  const kept: Dismissals = {};
  let dropped = false;

  for (const [id, at] of Object.entries(stored)) {
    if (typeof at === 'number' && now - at < DISMISSAL_MS) {
      kept[id] = at;
    } else {
      dropped = true;
    }
  }

  if (dropped) {
    write(kept);
  }
  return kept;
}

export function isDismissed(id: string, now: number = Date.now()): boolean {
  return id in activeDismissals(now);
}

export function dismiss(id: string, now: number = Date.now()): void {
  write({ ...activeDismissals(now), [id]: now });
}

/** Exported for the tests and for a support call: forgets every dismissal in this browser. */
export function clearDismissals(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the dismissals simply stay.
  }
}

function write(dismissals: Dismissals): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissals));
  } catch {
    // Quota, or storage disabled. The advert comes back next visit, which is the failure we want.
  }
}
