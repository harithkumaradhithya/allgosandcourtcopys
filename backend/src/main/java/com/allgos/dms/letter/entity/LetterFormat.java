package com.allgos.dms.letter.entity;

/**
 * The structure a letter is drafted in.
 *
 * <p>A {@code LETTER} is the office's own correspondence shape: a salutation, addressed to one or
 * more recipients. A {@code MEMO} ("குறிப்பாணை") is the shorter, third-person form a senior officer
 * issues to a subordinate office or about somebody's petition — no salutation, and the body is
 * written in passive voice rather than addressed to the reader. A {@code GO} ("அரசாணை") is a
 * Government Order — issued only by the Secretariat, with an abstract, a "படிக்கப்பட்டவை" (Read)
 * clause instead of a reference line, and an order body signed "by order of the Governor". A
 * {@code DO} ("நேர்முகக் கடிதம்" / Demi-Official letter) is personal-cum-official correspondence
 * between officers, written in the first person and signed "Yours sincerely" rather than issued.
 * Stored with the letter for the same reason the language is: reprinting it next year has to come
 * out in the shape it was issued.
 */
public enum LetterFormat {
    LETTER,
    MEMO,
    GO,
    DO
}
