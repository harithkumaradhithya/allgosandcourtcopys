import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether this machine has asked for less movement.
 *
 * <p>`index.css` already flattens every CSS animation and transition under the same query, and for
 * decoration that is the whole answer. It cannot reach a `<video autoplay>` or a GIF, which move
 * because of what they are rather than because of a stylesheet — so the one place in this
 * application that renders moving media asks in JavaScript instead.
 *
 * <p>Guarded for jsdom and anything else without `matchMedia`, where the honest default is "no
 * preference expressed": absent is not the same as asked-for, and treating it as a request would
 * freeze video for every test and every older browser.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matches());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(QUERY);
    const onChange = () => setReduced(media.matches);

    // Read once on mount as well: the preference can have changed between the first render's
    // initial state and this effect, and on a hot reload it very often has.
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function matches(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(QUERY).matches
  );
}
