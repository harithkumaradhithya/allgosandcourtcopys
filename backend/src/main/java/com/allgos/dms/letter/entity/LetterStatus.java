package com.allgos.dms.letter.entity;

/**
 * Whether a letter is finished.
 *
 * <p>A {@code DRAFT} is a letter being written: it is saved as it is typed, is exempt from the
 * blocks a finished letter must have, and is listed apart from the letters that are done. It becomes
 * {@code FINAL} the moment its author saves it as a letter — the same row, not a copy, so nothing
 * that was drafted is left behind as a duplicate.
 */
public enum LetterStatus {
    DRAFT,
    FINAL
}
