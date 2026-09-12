/**
 * Moving between the instants the API speaks and the `datetime-local` input the admin types into.
 *
 * <p>`datetime-local` has no timezone: it gives back "2026-03-14T09:30" and means it in whatever
 * zone the person sitting there is in. The API deals only in instants. So the conversion has to
 * happen somewhere, and doing it inline with `slice(0, 16)` on an ISO string — the usual shortcut —
 * silently shows an administrator in Chennai a start time five and a half hours earlier than the one
 * they set.
 *
 * <p>Kept as two pure functions so the round trip can be tested, which is the only way to be sure a
 * change here has not shifted every scheduled advert by a day.
 */

/** An instant from the API, as the local wall-clock value the input expects. Empty for null. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  // Built from the local getters rather than from `toISOString`, which is UTC by definition.
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The input's local wall-clock value, as the instant it names. Null for an empty box. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;

  // `new Date('2026-03-14T09:30')` is interpreted in the local zone — which is exactly what the
  // input meant by it.
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
