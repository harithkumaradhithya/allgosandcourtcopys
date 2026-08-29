package com.allgos.dms.file.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.allgos.dms.file.service.DocumentAbstractExtractor.Extraction;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

/**
 * The department heading can print either above or below the Abstract paragraph depending on the
 * letterhead era — see {@link DocumentAbstractExtractor}'s class Javadoc — and this office's real
 * G.O.s split roughly evenly between the two. Before this fix, only the below-Abstract shape was
 * recognised, so the above-Abstract shape (the more common of the two in practice) silently
 * produced no department hint at all, and {@link DestinationSuggestionService} never had anything to
 * match against.
 */
class DocumentAbstractExtractorDepartmentTest {

    private final DocumentAbstractExtractor extractor = new DocumentAbstractExtractor();

    /** The older "Manuscript Series" letterhead: department heading above "ABSTRACT", by the G.O. number. */
    @Test
    void readsTheDepartmentHeadingPrintedAboveTheAbstract() throws Exception {
        byte[] pdf = textPdf(
                "FINANCE [Procurement Cell] DEPARTMENT",
                "G.O.(Ms).No.10, Dated 13th January 2026",
                "ABSTRACT",
                "Public Procurement - Consolidated instructions for procurement - Orders - Issued.",
                "Read the following:-",
                "1. G.O.(Ms).No.207, Finance (Salaries) Department, dated: 04.07.2017.");

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.departmentHint()).isEqualTo("FINANCE [Procurement Cell] DEPARTMENT");
    }

    /** The newer letterhead: department heading below the Abstract paragraph, above the G.O. number. */
    @Test
    void readsTheDepartmentHeadingPrintedBelowTheAbstract() throws Exception {
        byte[] pdf = textPdf(
                "ABSTRACT",
                "Finance Department - Interim Monthly Payout - Amendment - Orders - Issued.",
                "FINANCE (TAPS) DEPARTMENT",
                "G.O.(Ms) No.152                               Dated: 28.07.2026");

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.departmentHint()).isEqualTo("FINANCE (TAPS) DEPARTMENT");
    }

    /**
     * A department named only inside a citation line — never on its own heading line — must not be
     * picked up as the document's own department: that line runs on past "Department" (", dated
     * ...") rather than ending there, and it sits after the citation marker besides.
     */
    @Test
    void doesNotMistakeADepartmentNamedOnlyInACitationForTheDocumentsOwn() throws Exception {
        byte[] pdf = textPdf(
                "Letter No. 14190711/Finance (TAPS)/ 2026-3, dated:02.07.2026",
                "Sir / Madam,",
                "Sub: Pension - Sustenance support - Clarification sought for - Issued.",
                "Ref:",
                "1. G.O.(Ms) No.7, Finance (PGC) Department, dated 09.01.2026.",
                "2. G.O.(Ms) No.111, Finance (TAPS) Department, dated16.06.2026.");

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.departmentHint()).isNull();
    }

    /** A minimal genuine text-layer PDF, one line per string, so native extraction is exercised. */
    private static byte[] textPdf(String... lines) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);

            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.setLeading(16f);
                stream.newLineAtOffset(50, 700);
                for (String line : lines) {
                    stream.showText(line);
                    stream.newLine();
                }
                stream.endText();
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}
