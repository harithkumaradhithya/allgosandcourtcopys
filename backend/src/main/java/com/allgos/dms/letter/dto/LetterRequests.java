package com.allgos.dms.letter.dto;

import com.allgos.dms.letter.entity.LetterFormat;
import com.allgos.dms.letter.entity.LetterGoType;
import com.allgos.dms.letter.entity.LetterLanguage;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Request bodies for letters. */
public final class LetterRequests {

    /**
     * A letter, as its author writes it.
     *
     * <p>The From block is required even though the server could build one from the account: it is
     * editable per letter, so what the author actually approved is what gets stored — deriving it on
     * save would quietly discard their edit.
     */
    public record SaveLetter(
            @Size(max = 120)
            String referenceNo,

            LocalDate letterDate,

            /** English or Tamil. Decides the headings the sheet prints, so it is part of the letter. */
            LetterLanguage language,

            /** The office letter shape, the shorter third-person memo, or a Government Order. */
            LetterFormat format,

            /** Which classification a G.O. is issued under. Ignored outside a G.O. */
            LetterGoType goType,

            @NotBlank(message = "The From address is required")
            @Size(max = 2_000)
            String fromBlock,

            /** The office's own name, place, phone and e-mail. Meaningless outside a D.O. letter. */
            @Size(max = 2_000)
            String officeBlock,

            @NotBlank(message = "Say who the letter is to")
            @Size(max = 4_000)
            String toBlock,

            @Size(max = 120)
            String salutation,

            @NotBlank(message = "A subject is required")
            @Size(max = 1_000)
            String subject,

            @Size(max = 4_000)
            String reference,

            @NotBlank(message = "The letter needs a body")
            @Size(max = 50_000)
            String body,

            @Size(max = 500)
            String enclosure,

            @Size(max = 4_000)
            String copyTo,

            @Size(max = 1_000)
            String signOff,

            /** A table of figures dropped into the body, JSON-encoded as rows of cells. */
            @Size(max = 20_000)
            String tableData) {}

    /**
     * A letter still being written, saved as it is typed.
     *
     * <p>The same fields as {@link SaveLetter} with none of the requirements: a draft is exactly the
     * half-written letter that {@code SaveLetter} refuses, and autosaving one must never fail because
     * the author has not reached the body yet. The lengths are still bounded — an unfinished letter
     * is not a reason to accept a megabyte of text.
     *
     * <p>A separate record rather than a flag on {@code SaveLetter}: bean validation is decided by
     * the type, so one shape cannot be required in one case and optional in another without the
     * requirement moving out of the DTO and into a branch somebody has to remember to write.
     */
    public record SaveDraft(
            @Size(max = 120) String referenceNo,
            LocalDate letterDate,
            LetterLanguage language,
            LetterFormat format,
            LetterGoType goType,
            @Size(max = 2_000) String fromBlock,
            @Size(max = 2_000) String officeBlock,
            @Size(max = 4_000) String toBlock,
            @Size(max = 120) String salutation,
            @Size(max = 1_000) String subject,
            @Size(max = 4_000) String reference,
            @Size(max = 50_000) String body,
            @Size(max = 500) String enclosure,
            @Size(max = 4_000) String copyTo,
            @Size(max = 1_000) String signOff,
            @Size(max = 20_000) String tableData) {}

    private LetterRequests() {}
}
