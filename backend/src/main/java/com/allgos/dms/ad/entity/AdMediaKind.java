package com.allgos.dms.ad.entity;

/**
 * What the uploaded bytes turned out to be.
 *
 * <p>Detected from the file rather than chosen by the admin, so the value can never disagree with
 * what the browser is then asked to render — a {@code <video>} pointed at a PNG shows nothing, and
 * an admin who picked the wrong radio button has no way to tell that is what happened.
 */
public enum AdMediaKind {
    /** A still: PNG, JPEG or WebP. Rendered as an image and never animated. */
    IMAGE,
    /**
     * Also an image to the markup, but its own kind here because it moves on its own and cannot be
     * paused — which is what the reduced-motion rules need to know.
     */
    GIF,
    /** MP4 or WebM. Always muted in a slot; sound exists only inside the popup, under controls. */
    VIDEO
}
