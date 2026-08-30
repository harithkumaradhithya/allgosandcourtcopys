package com.allgos.dms.letter.dto;

import com.allgos.dms.letter.entity.Letter;
import com.allgos.dms.letter.entity.LetterLanguage;
import com.allgos.dms.letter.entity.LetterStatus;
import com.allgos.dms.letter.entity.LetterTemplate;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Response bodies for templates and letters. */
public final class LetterResponses {

    /** A template as the chooser and the admin list see it. */
    public record TemplateView(
            UUID id,
            String name,
            String description,
            String defaultSubject,
            String body,
            String salutation,
            LetterLanguage language,
            boolean active,
            Instant updatedAt) {

        public static TemplateView from(LetterTemplate template) {
            return new TemplateView(
                    template.getId(),
                    template.getName(),
                    template.getDescription(),
                    template.getDefaultSubject(),
                    template.getBody(),
                    template.getSalutation(),
                    template.getLanguage(),
                    template.isActive(),
                    template.getUpdatedAt());
        }
    }

    /**
     * A whole letter, which is also what the print view renders.
     *
     * <p>Returned in full rather than as a summary plus a second call: a letter is a few kilobytes
     * of text, and the screen that opens one always needs all of it.
     */
    public record LetterView(
            UUID id,
            UUID templateId,
            String templateName,
            String referenceNo,
            LocalDate letterDate,
            LetterLanguage language,
            LetterStatus status,
            String fromBlock,
            String toBlock,
            String salutation,
            String subject,
            String reference,
            String body,
            String enclosure,
            String copyTo,
            String signOff,
            Instant createdAt,
            Instant updatedAt) {

        public static LetterView from(Letter letter) {
            return new LetterView(
                    letter.getId(),
                    letter.getTemplate() == null ? null : letter.getTemplate().getId(),
                    letter.getTemplate() == null ? null : letter.getTemplate().getName(),
                    letter.getReferenceNo(),
                    letter.getLetterDate(),
                    letter.getLanguage(),
                    letter.getStatus(),
                    letter.getFromBlock(),
                    letter.getToBlock(),
                    letter.getSalutation(),
                    letter.getSubject(),
                    letter.getReference(),
                    letter.getBody(),
                    letter.getEnclosure(),
                    letter.getCopyTo(),
                    letter.getSignOff(),
                    letter.getCreatedAt(),
                    letter.getUpdatedAt());
        }
    }

    /**
     * A row in "My letters".
     *
     * <p>Deliberately not the whole letter: a list of fifty would otherwise carry fifty bodies to
     * draw fifty lines of subject and date.
     */
    public record LetterSummary(
            UUID id,
            String referenceNo,
            LocalDate letterDate,
            String subject,
            String templateName,
            LetterLanguage language,
            LetterStatus status,
            Instant updatedAt) {

        public static LetterSummary from(Letter letter) {
            return new LetterSummary(
                    letter.getId(),
                    letter.getReferenceNo(),
                    letter.getLetterDate(),
                    letter.getSubject(),
                    letter.getTemplate() == null ? null : letter.getTemplate().getName(),
                    letter.getLanguage(),
                    letter.getStatus(),
                    letter.getUpdatedAt());
        }
    }

    private LetterResponses() {}
}
