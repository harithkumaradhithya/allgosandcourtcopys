package com.allgos.dms.letter.entity;

/**
 * The language a letter is written and printed in.
 *
 * <p>Not a preference and not a translation of the application: it is a property of the document.
 * An English letter prints "From,", "Sub:" and "Copy to."; a Tamil one prints "அனுப்புநர்,",
 * "பொருள்:" and "நகல்:" — the headings and labels, not only the words the author typed. Because it
 * decides how the letter is *drawn*, it is stored with the letter rather than read from whoever
 * happens to open it, so a letter reprinted next year comes out as it was issued.
 */
public enum LetterLanguage {
    EN,
    TA
}
