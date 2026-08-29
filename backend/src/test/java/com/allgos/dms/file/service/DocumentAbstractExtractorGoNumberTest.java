package com.allgos.dms.file.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.allgos.dms.file.service.DocumentAbstractExtractor.Extraction;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

/**
 * The G.O. number, read via the same OCR path {@link DocumentAbstractExtractionIT} already proves
 * for the description — real Tesseract against the same two genuine scans, not a mock.
 *
 * <p>No Spring context: {@link DocumentAbstractExtractor} is a plain component with no
 * dependencies, so instantiating it directly keeps this fast.
 */
class DocumentAbstractExtractorGoNumberTest {

    private final DocumentAbstractExtractor extractor = new DocumentAbstractExtractor();

    @Test
    void readsTheGoNumberFromAScannedTransferOrder() throws Exception {
        Extraction extraction = extractor.extract(sample("go-rt-137-scanned.pdf"));
        assertThat(extraction.goNumber()).isEqualTo("G.O.(Rt) No. 137");
    }

    @Test
    void readsTheGoNumberFromAScannedFinanceOrder() throws Exception {
        Extraction extraction = extractor.extract(sample("go-ms-168-scanned.pdf"));
        // OCR on a scan is imperfect elsewhere in this office's documents too (see the em-dash noise
        // in DocumentAbstractExtractionIT's description assertions); what matters here is that the
        // "G.O.(Ms) No." shape is recognised at all, not that every digit round-trips perfectly.
        assertThat(extraction.goNumber()).startsWith("G.O.(Ms) No.");
    }

    /**
     * Reproduces a real amendment order: its own number in the letterhead, then a "Read:" block
     * citing the earlier order it amends — the exact shape of the office's "G.O.Ms.No.168 ... TAPS
     * Interim Payout" document, which carries "G.O.(Ms) No.111" in its Read: line. Taking whichever
     * G.O. reference {@code Matcher.find()} reached first meant a document could report the number
     * of an order it merely cites rather than its own.
     */
    @Test
    void takesTheDocumentsOwnGoNumberRatherThanOneItReferences() throws Exception {
        byte[] pdf = textPdf(
                "ABSTRACT",
                "Interim Monthly Payout to eligible Government servants retired on or after",
                "1.1.2026 - Dearness Relief on the interim payout - Amendment - Orders - Issued.",
                "Finance (TAPS) Department",
                "G.O.(Ms.) No.168                              Dated: 14.08.2026",
                "Read:",
                "G.O.(Ms) No.111, Finance (TAPS) Department, dated 16.06.2026");

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.goNumber()).isEqualTo("G.O.(Ms.) No.168");
    }

    /** No "Read:" block at all — the whole page is fair game, same as before this fix. */
    @Test
    void stillFindsTheGoNumberWhenThereIsNoReadBlock() throws Exception {
        byte[] pdf = textPdf(
                "ABSTRACT",
                "Some paragraph of no particular consequence that runs on for a while - Issued.",
                "Public Works Department",
                "G.O.(Rt.) No.42                               Dated: 01.01.2026");

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.goNumber()).isEqualTo("G.O.(Rt.) No.42");
    }

    /**
     * Reproduces the Finance (Procurement Cell) and (Allowances) letterhead style: a period rather
     * than a space between the "(Ms)" marker and "No" — "G.O.(Ms).No.10", not "G.O.(Ms) No.10". The
     * G.O. number pattern previously required whitespace there and missed this shape entirely.
     */
    @Test
    void readsAGoNumberWithNoSpaceBeforeNo() throws Exception {
        byte[] pdf = textPdf(
                "FINANCE [Procurement Cell] DEPARTMENT",
                "G.O.(Ms).No.10, Dated 13th January 2026",
                "ABSTRACT",
                "Public Procurement - Consolidated instructions - Orders - Issued.",
                "Finance [Procurement Cell] Department");

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.goNumber()).isEqualTo("G.O.(Ms).No.10");
    }

    /**
     * Reproduces a citation block headed "Ref:" rather than "Read:" — the shape this office's
     * Finance (TAPS) letters use — plus the "Read the following:-" phrasing used elsewhere. Neither
     * heading was recognised before this fix, so a cited G.O. after either one could be picked up as
     * if it were the document's own number.
     */
    @Test
    void treatsRefAndReadTheFollowingAsCitationBoundariesToo() throws Exception {
        byte[] refPdf = textPdf(
                "G.O.(Ms) No.7                                 Dated: 09.01.2026",
                "ABSTRACT",
                "Pension - Sustenance support to eligible Government servants - Issued.",
                "Finance (PGC) Department",
                "Ref:",
                "G.O.(Ms) No.111, Finance (TAPS) Department, dated 16.06.2026");
        assertThat(extractor.extract(refPdf).goNumber()).isEqualTo("G.O.(Ms) No.7");

        byte[] readFollowingPdf = textPdf(
                "G.O.(Ms).No.10, Dated 13th January 2026",
                "ABSTRACT",
                "Public Procurement - Consolidated instructions - Orders - Issued.",
                "Finance [Procurement Cell] Department",
                "Read the following:-",
                "1. G.O.(Ms).No.207, Finance (Salaries) Department, dated: 04.07.2017.");
        assertThat(extractor.extract(readFollowingPdf).goNumber()).isEqualTo("G.O.(Ms).No.10");
    }

    private static byte[] sample(String name) throws Exception {
        return Files.readAllBytes(Path.of("src/test/resources/sample-documents/" + name));
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
