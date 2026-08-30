package com.allgos.dms.letter.dto;

import com.allgos.dms.letter.entity.Letter;
import com.allgos.dms.letter.entity.LetterLanguage;
import com.allgos.dms.letter.entity.LetterStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Response bodies for letters. */
public final class LetterResponses {

    /**
     * A whole letter, which is also what the print view renders.
     *
     * <p>Returned in full rather than as a summary plus a second call: a letter is a few kilobytes
     * of text, and the screen that opens one always needs all of it.
     */
    public record LetterView(
            UUID id,
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
            LetterLanguage language,
            LetterStatus status,
            Instant updatedAt) {

        public static LetterSummary from(Letter letter) {
            return new LetterSummary(
                    letter.getId(),
                    letter.getReferenceNo(),
                    letter.getLetterDate(),
                    letter.getSubject(),
                    letter.getLanguage(),
                    letter.getStatus(),
                    letter.getUpdatedAt());
        }
    }

    private LetterResponses() {}
}
