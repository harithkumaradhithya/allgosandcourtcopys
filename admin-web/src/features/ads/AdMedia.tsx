import { usePrefersReducedMotion } from '@/lib/reduced-motion';
import type { Ad } from '@/types/api';

/**
 * An advert's media, drawn from what it actually is.
 *
 * <p>The kind comes from the server, which detected it from the bytes rather than believing the
 * upload — so a `<video>` here is never pointed at a PNG.
 *
 * <p>Three rules hold in both places this is used, and they are most of the reason the feature is
 * tolerable:
 *
 * <ul>
 *   <li><b>Nothing ever makes a sound by itself.</b> A slot's video is `muted` in the markup, not by
 *       configuration — there is no field on an advert that could turn it on. Sound exists only in
 *       the popup, behind controls somebody pressed.
 *   <li><b>Reduced motion is honoured by the media, not just the CSS.</b> The stylesheet flattens
 *       animations; it cannot stop a video playing. A machine that asked for less movement gets a
 *       still first frame and a control to start it.
 *   <li><b>The box never resizes.</b> The aspect ratio is fixed by the caller and the media is
 *       contained within it, so the page does not jump when a 2 MB picture finally arrives.
 * </ul>
 *
 * <p>`object-contain` rather than `object-cover`, which would look tidier. An advert is somebody's
 * artwork with words laid out inside it, and cropping it to fill a box is how the last line of those
 * words disappears on a narrow screen.
 */
export function AdMedia({
  ad,
  /** `slot` is the card on the page; `detail` is inside the popup, where sound is allowed. */
  variant,
  className = '',
}: {
  ad: Ad;
  variant: 'slot' | 'detail';
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  if (ad.mediaKind === 'VIDEO') {
    const autoPlay = variant === 'detail' ? !reducedMotion : ad.autoplay && !reducedMotion;

    return (
      <video
        // Keyed on the URL so that swapping adverts inside one slot reloads the element rather
        // than leaving the previous film playing under a new source.
        key={ad.mediaUrl}
        src={ad.mediaUrl}
        aria-label={ad.altText}
        className={`h-full w-full object-contain ${className}`}
        // In the popup the reader is watching on purpose, so they get the full set — including the
        // volume control, which is the only route to sound anywhere in this feature.
        controls={variant === 'detail'}
        autoPlay={autoPlay}
        muted={variant === 'slot'}
        loop={ad.loopMedia}
        playsInline
        // `metadata` in a slot: enough for the first frame to stand in as a poster, without pulling
        // a 25 MB film down the office's shared line for a banner nobody clicked.
        preload={variant === 'detail' ? 'auto' : 'metadata'}
      />
    );
  }

  return (
    <img
      src={ad.mediaUrl}
      alt={ad.altText}
      className={`h-full w-full object-contain ${className}`}
      // The slot is below the fold on every screen it appears on, so it costs nothing until it is
      // scrolled to; the popup's copy is already in the browser cache by the time it opens.
      loading={variant === 'detail' ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  );
}
