package com.allgos.dms.letter.entity;

import com.allgos.dms.common.entity.BaseEntity;
import com.allgos.dms.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One letter, saved so it can be reopened, corrected and reprinted.
 *
 * <p><b>Everything is stored as written.</b> The From block is a copy of the author's details at the
 * time rather than a join to their account. A letter reprinted next year has to come out as it was
 * issued — not restyled because somebody has since changed their designation.
 */
@Entity
@Table(name = "letters")
@Getter
@Setter
@NoArgsConstructor
public class Letter extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    /** The office's own file number — "Lr.No.DBC/52/2026-D3". Free text; every office numbers differently. */
    @Column(name = "reference_no")
    private String referenceNo;

    @Column(name = "letter_date")
    private LocalDate letterDate;

    /** English or Tamil — decides the headings and labels the sheet prints, not only the wording. */
    @Column(nullable = false)
    private LetterLanguage language = LetterLanguage.EN;

    /** The office letter shape, the shorter third-person memo, or a Government Order. */
    @Column(nullable = false)
    private LetterFormat format = LetterFormat.LETTER;

    /** Which classification a G.O. was issued under (Ms/Rt/Pt/1D). Null on anything but a G.O. */
    @Column(name = "go_type")
    private LetterGoType goType;

    /** A draft is a letter still being written; it is exempt from the blocks below being filled. */
    @Column(nullable = false)
    private LetterStatus status = LetterStatus.FINAL;

    @Column(name = "from_block", nullable = false, columnDefinition = "text")
    private String fromBlock;

    /** The office's own name, place, phone and e-mail, printed opposite the From block on a D.O. letter. */
    @Column(name = "office_block", columnDefinition = "text")
    private String officeBlock;

    @Column(name = "to_block", nullable = false, columnDefinition = "text")
    private String toBlock;

    @Column
    private String salutation;

    @Column(nullable = false, columnDefinition = "text")
    private String subject;

    /** The "Ref:" line — the order or letter this one answers. */
    @Column(columnDefinition = "text")
    private String reference;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column
    private String enclosure;

    @Column(name = "copy_to", columnDefinition = "text")
    private String copyTo;

    /** What sits above the signature: the name, the post, and who it is signed for. */
    @Column(name = "sign_off", columnDefinition = "text")
    private String signOff;

    /** A table of figures dropped into the body, JSON-encoded as rows of cells. Null when there is none. */
    @Column(name = "table_data", columnDefinition = "text")
    private String tableData;
}
