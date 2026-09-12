package com.allgos.dms.ad.entity;

/**
 * The slots an advert may run in.
 *
 * <p>A closed list, and a short one. Every value here is a region that actually exists in the
 * interface and that somebody is <em>between</em> tasks when they look at — arriving on Home,
 * choosing a department, glancing at the rail. The screens where somebody is working are absent
 * deliberately: nothing runs in the letter editor, the document preview, the upload dialogs or any
 * authentication screen, and there is no value here that would let one be added by configuration.
 */
public enum AdPlacement {
    /** A card low on the Home screen, below the user's own work. */
    HOME,
    /** A slim banner above the department grid. */
    DEPARTMENTS,
    /** A small tile at the foot of the navigation rail; hidden entirely once the rail folds. */
    SIDEBAR
}
