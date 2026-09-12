package com.allgos.dms.letter.entity;

/**
 * The classification a Government Order is issued under — printed in brackets before its number,
 * e.g. "அரசாணை (நிலை) எண்: 1415" / "G.O. (Ms). No. 1415". Meaningless outside a {@link LetterFormat#GO}
 * letter, on which it is otherwise null.
 */
public enum LetterGoType {
    MS,
    RT,
    PT,
    ONE_D
}
