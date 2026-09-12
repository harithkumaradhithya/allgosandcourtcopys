import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdMedia } from '@/features/ads/AdMedia';
import { AdDetailDialog } from '@/features/ads/AdDetailDialog';
import { fetchAds, recordAdClick, recordAdView } from '@/features/ads/api';
import { activeDismissals, dismiss } from '@/features/ads/dismissal';
import type { AdPlacement } from '@/types/api';

/**
 * An advert in one of the three slots — and the rules that keep it from ruining the screen it is on.
 *
 * <p>Those rules are the feature, so they are written down rather than left in the markup:
 *
 * <ol>
 *   <li><b>Nothing is reserved.</b> With no advert configured, or every one dismissed, this renders
 *       `null` — not an empty box, not a placeholder, not a gap. An office that never uses the
 *       feature cannot tell it was ever built.
 *   <li><b>It never interrupts.</b> There is no interstitial, no timer, no overlay, no scroll
 *       trigger and no exit intent. The only thing that opens anything is a press on the advert.
 *   <li><b>One at a time.</b> A slot draws a single advert however many are live, chosen once when
 *       the screen mounts and then left alone. Nothing rotates under the reader's eyes.
 *   <li><b>It can be put away</b>, for a fortnight, per advert — see `dismissal.ts` for why that
 *       matters more than it sounds.
 *   <li><b>It says what it is.</b> A label sits above every one, so nothing here can be mistaken for
 *       an office announcement or a document the department published.
 *   <li><b>It never costs the page anything.</b> The query fails silently, the media is lazy and
 *       inside a fixed ratio so there is no layout shift, and the whole slot is `print:hidden` —
 *       nobody wants a banner on the copy of a court order they took to a hearing.
 * </ol>
 */

/** Impressions counted once per page load rather than per render. See the note in `useAdImpression`. */
const counted = new Set<string>();

const LAYOUTS = {
  /** The Home card: the largest of the three, below the reader's own work. */
  HOME: { shape: 'stack', ratio: 'aspect-[21/9]' },
  /** A slim strip below the department grid; media beside the words rather than over them. */
  DEPARTMENTS: { shape: 'row', ratio: 'aspect-video' },
  /** The rail's foot. Small, and gone entirely once the rail folds — see the Sidebar. */
  SIDEBAR: { shape: 'stack', ratio: 'aspect-video' },
} as const satisfies Record<AdPlacement, { shape: 'stack' | 'row'; ratio: string }>;

export function AdSlot({ placement, className = '' }: { placement: AdPlacement; className?: string }) {
  const { data } = useQuery({
    queryKey: ['ads', placement],
    queryFn: () => fetchAds(placement),
    // The media URL is presigned and expires; well inside that, and long enough that moving between
    // screens does not re-ask. A stale advert is the least consequential stale thing here.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  /**
   * Which of the live adverts this visit sees.
   *
   * <p>Drawn once, at mount, and held as a number rather than an id: the list can shrink under it —
   * somebody dismisses one — and a stored id would then leave the slot empty beside adverts that are
   * still perfectly good. A seed re-picks from whatever is left, without reshuffling on every
   * render the way a bare `Math.random()` in the body would.
   */
  const [seed] = useState(() => Math.random());
  /**
   * What this browser had already put away, read once when the slot mounts.
   *
   * <p>`localStorage` cannot change under a render, so asking it again on each one would be a
   * synchronous storage hit every time anything else on the page re-rendered — and would make this
   * component's output depend on something outside React. Anything dismissed *while* the slot is on
   * screen goes into `dismissedHere` instead, which is state and does re-render.
   */
  const [dismissedBefore] = useState(() => activeDismissals());
  const [dismissedHere, setDismissedHere] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const available = (data ?? []).filter(
    (ad) => !dismissedHere.includes(ad.id) && !(ad.id in dismissedBefore),
  );
  const ad = available.length > 0 ? available[Math.floor(seed * available.length)] : null;

  useAdImpression(ad?.id);

  // Rule 1. Before any wrapper, any label and any spacing — so a page with nothing to show has
  // nothing on it.
  if (!ad) return null;

  const layout = LAYOUTS[placement];

  const openDetail = () => {
    recordAdClick(ad.id);
    setDetailOpen(true);
  };

  const putAway = () => {
    dismiss(ad.id);
    // And in state, because the render above reads the storage snapshot taken at mount — without
    // this the advert would sit there, dismissed, until the next navigation.
    setDismissedHere((ids) => [...ids, ad.id]);
  };

  return (
    <aside
      aria-label="Advertisement"
      className={`animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-card
        print:hidden ${className}`}
    >
      {/*
        The label, above the advert rather than over it. Over the media it would cover somebody's
        artwork and be read as part of it; above, in the frame's own colour, it reads as this
        application saying what the box below is — which is the honest version.
      */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-sunken px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
          Advertisement
        </span>
        {ad.dismissible && (
          <button
            type="button"
            onClick={putAway}
            aria-label="Hide this advertisement"
            title="Hide this advertisement"
            className="-mr-1 rounded-md p-1 text-slate-400 outline-none transition-colors
              duration-[--duration-quick] ease-[--ease-settle] hover:bg-navy-50 hover:text-slate-600
              focus-visible:ring-2 focus-visible:ring-navy-300"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-3.5 w-3.5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/*
        One button around the whole advert, rather than a link on the media and another on the
        headline. Two targets for one destination is two tab stops a keyboard user has to step
        through, and the second one is never the one they wanted.
      */}
      <button
        type="button"
        onClick={openDetail}
        className={`group block w-full cursor-pointer text-left outline-none
          focus-visible:ring-2 focus-visible:ring-navy-300 focus-visible:ring-inset ${
            layout.shape === 'row' ? 'sm:flex sm:items-stretch sm:gap-4' : ''
          }`}
      >
        <div
          className={`${layout.ratio} overflow-hidden bg-surface-sunken ${
            layout.shape === 'row' ? 'sm:w-56 sm:shrink-0' : ''
          }`}
        >
          {/* The one piece of motion in the slot: a hair of scale on hover, which is what says the
              whole card is the target. Flattened for anybody who asked for less movement, by the
              reduced-motion rule in index.css that covers every transition in the application. */}
          <div className="h-full w-full transition-transform duration-[--duration-base] ease-[--ease-settle] group-hover:scale-[1.02]">
            <AdMedia ad={ad} variant="slot" />
          </div>
        </div>

        <div
          className={`flex flex-col justify-center gap-1 px-4 py-3 ${
            layout.shape === 'row' ? 'sm:py-4 sm:pl-0' : ''
          }`}
        >
          {ad.headline && (
            <p
              className={`font-semibold text-slate-900 ${
                placement === 'SIDEBAR' ? 'text-[0.8125rem] leading-snug' : 'text-[0.9375rem]'
              }`}
            >
              {ad.headline}
            </p>
          )}
          {ad.caption && (
            <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-slate-500">
              {ad.caption}
            </p>
          )}
          {/* Always present, even on an advert with no words of its own: without it, a picture that
              opens a dialog when pressed is a picture that looks like it does nothing. */}
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-navy-700">
            More information
            <span
              aria-hidden
              className="transition-transform duration-[--duration-base] ease-[--ease-settle] group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
        </div>
      </button>

      <AdDetailDialog ad={ad} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </aside>
  );
}

/**
 * Counts an advert as seen, once.
 *
 * <p>"Once" is per page load, held in a module-level set rather than in storage. Per render would
 * count a dozen times for one glance; per session in `sessionStorage` would never count the reader
 * who leaves the dashboard open all week and looks at it every morning. A visit is the unit an
 * administrator means when they ask how often an advert was seen.
 */
function useAdImpression(adId: string | undefined): void {
  useEffect(() => {
    // The set, not the effect, is what makes this happen once: the effect re-runs whenever the
    // chosen advert changes and on every remount of a screen the reader is simply returning to.
    if (!adId || counted.has(adId)) return;
    counted.add(adId);
    recordAdView(adId);
  }, [adId]);
}
