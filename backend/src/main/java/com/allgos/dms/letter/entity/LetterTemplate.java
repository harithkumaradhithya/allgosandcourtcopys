package com.allgos.dms.letter.entity;

import com.allgos.dms.common.entity.BaseEntity;
import com.allgos.dms.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The standing part of a kind of letter.
 *
 * <p>Everything on it is a starting point rather than a rule: whoever writes the letter can change
 * any of it. A template that could not be edited would be a form, and an office that needed a form
 * changed would be waiting on a release.
 */
@Entity
@Table(name = "letter_templates")
@Getter
@Setter
@NoArgsConstructor
public class LetterTemplate extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String name;

    /** What this template is for, shown beside its name when choosing. */
    @Column
    private String description;

    @Column(name = "default_subject")
    private String defaultSubject;

    @Column(columnDefinition = "text")
    private String body;

    @Column
    private String salutation;

    /**
     * Which language's letters this template is for.
     *
     * <p>A template's wording is in one language, so it belongs to that language's chooser. The
     * letter written from it starts in the same language.
     */
    @Column(nullable = false)
    private LetterLanguage language = LetterLanguage.EN;

    /**
     * Retired rather than deleted once letters exist. Removing a template people have already
     * written from would either take those letters with it or leave them pointing at nothing.
     */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;
}
