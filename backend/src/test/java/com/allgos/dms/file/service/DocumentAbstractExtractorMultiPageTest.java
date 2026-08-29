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
 * A long letterhead — a full page of "Read:" citations, in particular — can push "ABSTRACT" itself
 * onto the second page rather than the first. Before this fix, only page one was ever read, so a
 * document shaped like this got no description at all: the field that everything else on the upload
 * page hangs off of.
 */
class DocumentAbstractExtractorMultiPageTest {

    private final DocumentAbstractExtractor extractor = new DocumentAbstractExtractor();

    @Test
    void readsTheAbstractWhenItStartsOnTheSecondPage() throws Exception {
        byte[] pdf = twoPagePdf(
                new String[] {
                    "G.O.(Ms) No.87, Dated: 12.03.2026",
                    "(Panguni-01, Thiruvalluvar Aandu 2057)",
                    "Government of Tamil Nadu, Secretariat, Chennai - 600 009.",
                },
                new String[] {
                    "ABSTRACT",
                    "Finance Department - Revision of pay scales - Amendment - Orders - Issued.",
                    "FINANCE (TAPS) DEPARTMENT",
                    "Read:",
                    "1. G.O.(Ms) No.11, Finance (TAPS) Department, dated 04.01.2020.",
                    "2. G.O.(Ms) No.42, Finance (TAPS) Department, dated 19.05.2022.",
                });

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.description())
                .isEqualTo("Finance Department - Revision of pay scales - Amendment - Orders - Issued.");
        assertThat(extraction.goNumber()).isEqualTo("G.O.(Ms) No.87");
        assertThat(extraction.departmentHint()).isEqualTo("FINANCE (TAPS) DEPARTMENT");
    }

    /** The common case must not pay for a page it does not need. */
    @Test
    void doesNotReadTheSecondPageWhenTheFirstAlreadyHasTheAbstract() throws Exception {
        byte[] pdf = twoPagePdf(
                new String[] {
                    "ABSTRACT",
                    "Finance Department - Revision of pay scales - Orders - Issued.",
                    "FINANCE (TAPS) DEPARTMENT",
                    "G.O.(Ms) No.87, Dated: 12.03.2026",
                },
                new String[] {
                    "ABSTRACT",
                    "A different order that must never be read - Issued.",
                });

        Extraction extraction = extractor.extract(pdf);

        assertThat(extraction.description())
                .isEqualTo("Finance Department - Revision of pay scales - Orders - Issued.");
    }

    private static byte[] twoPagePdf(String[] page1Lines, String[] page2Lines) throws IOException {
        try (PDDocument document = new PDDocument()) {
            addPage(document, page1Lines);
            addPage(document, page2Lines);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static void addPage(PDDocument document, String[] lines) throws IOException {
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
    }
}
