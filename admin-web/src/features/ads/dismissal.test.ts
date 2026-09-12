import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISMISSAL_DAYS,
  activeDismissals,
  clearDismissals,
  dismiss,
  isDismissed,
} from '@/features/ads/dismissal';

const DAY = 24 * 60 * 60 * 1000;

describe('advert dismissals', () => {
  beforeEach(() => {
    clearDismissals();
  });

  it('hides an advert that was put away', () => {
    dismiss('ad-1');
    expect(isDismissed('ad-1')).toBe(true);
  });

  it('leaves the other adverts alone', () => {
    dismiss('ad-1');
    expect(isDismissed('ad-2')).toBe(false);
  });

  it('forgets a dismissal once its fortnight is up', () => {
    const dismissedAt = Date.UTC(2026, 2, 1);
    dismiss('ad-1', dismissedAt);

    expect(isDismissed('ad-1', dismissedAt + (DISMISSAL_DAYS - 1) * DAY)).toBe(true);
    expect(isDismissed('ad-1', dismissedAt + (DISMISSAL_DAYS + 1) * DAY)).toBe(false);
  });

  it('keeps a live dismissal when an expired one beside it is swept', () => {
    const old = Date.UTC(2026, 0, 1);
    dismiss('stale', old);
    dismiss('fresh', old + DISMISSAL_DAYS * DAY);

    const still = activeDismissals(old + (DISMISSAL_DAYS + 1) * DAY);
    expect(Object.keys(still)).toEqual(['fresh']);
  });

  it('treats anything else stored under the key as nothing dismissed', () => {
    window.localStorage.setItem('allgos.ads.dismissed', 'not json at all');
    expect(isDismissed('ad-1')).toBe(false);

    window.localStorage.setItem('allgos.ads.dismissed', '["an","array"]');
    expect(isDismissed('ad-1')).toBe(false);
  });

  /**
   * The failure that matters: in a private window, or with storage disabled by policy, every call
   * here must be a no-op rather than an exception — an advert is the last thing that should be
   * allowed to take down the screen it sits on.
   */
  it('does not throw when storage is unavailable', () => {
    const denied = () => {
      throw new Error('The operation is insecure.');
    };
    // The whole object is replaced rather than its methods spied on: jsdom's `localStorage` is a
    // Proxy, and a spy on one of its methods is accepted and then never called.
    vi.stubGlobal('localStorage', {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
    });

    expect(() => dismiss('ad-1')).not.toThrow();
    expect(() => clearDismissals()).not.toThrow();
    expect(isDismissed('ad-1')).toBe(false);

    vi.unstubAllGlobals();
  });
});
