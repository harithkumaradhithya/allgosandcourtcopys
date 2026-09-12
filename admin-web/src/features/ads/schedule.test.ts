import { describe, expect, it } from 'vitest';
import { fromLocalInputValue, toLocalInputValue } from '@/features/ads/schedule';

describe('advert schedule fields', () => {
  it('is empty for an advert with no window', () => {
    expect(toLocalInputValue(null)).toBe('');
    expect(toLocalInputValue(undefined)).toBe('');
    expect(fromLocalInputValue('')).toBeNull();
  });

  /**
   * The one that matters. Whatever zone the test machine is in, a value typed into the input has to
   * come back out of the round trip as the same wall-clock reading — the bug this guards against is
   * `toISOString().slice(0, 16)`, which shows an administrator in Chennai a start time five and a
   * half hours earlier than the one they set.
   */
  it('survives the round trip in the local zone', () => {
    const typed = '2026-03-14T09:30';
    expect(toLocalInputValue(fromLocalInputValue(typed))).toBe(typed);
  });

  it('reads the instant back as local wall-clock time', () => {
    const local = new Date(2026, 2, 14, 9, 30);
    expect(toLocalInputValue(local.toISOString())).toBe('2026-03-14T09:30');
  });

  it('pads single-digit months, days, hours and minutes', () => {
    const local = new Date(2026, 0, 2, 3, 4);
    expect(toLocalInputValue(local.toISOString())).toBe('2026-01-02T03:04');
  });

  it('treats an unparseable value as nothing rather than an Invalid Date', () => {
    expect(toLocalInputValue('not a date')).toBe('');
    expect(fromLocalInputValue('not a date')).toBeNull();
  });
});
