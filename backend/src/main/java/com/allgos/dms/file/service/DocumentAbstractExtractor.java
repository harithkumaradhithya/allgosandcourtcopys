package com.allgos.dms.file.service;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Pulls the "Abstract" paragraph, the department heading, and the G.O. number out of a government
 * order PDF — for the description shown beside the document, for guessing where an unfiled upload
 * belongs, and so the document can be found again by that number later.
 *
 * <p>These orders follow a layout closely enough to rely on: the first page opens with a heading
 * reading "ABSTRACT" and a paragraph that always ends with the word "Issued.". Those anchors are
 * what the description is searched for, rather than anything more elaborate.
 *
 * <p>The department heading and the G.O. number are each looked for across the whole page rather
 * than anchored to the Abstract, since where the department line sits relative to it is not
 * consistent: older "Manuscript Series" letterheads (e.g. "FINANCE [Salaries] DEPARTMENT") print it
 * <em>above</em> "ABSTRACT", next to the G.O. number itself, while newer ones print it in a heading
 * of its own <em>below</em> the Abstract paragraph, still above the G.O. number. Rather than assume
 * either position, the department heading is recognised by its own shape — a short line ending in
 * the word "DEPARTMENT" — wherever on the page that turns out to be.
 *
 * <p>Plenty of what this office uploads as a "PDF" turns out to carry no text layer at all — a scan
 * saved straight to PDF — so whenever a page yields next to no native text, it is rendered to an
 * image and read with Tesseract OCR instead, page by page: a scan can mix a native cover page with
 * image-only pages, or the reverse, so this is decided per page rather than once for the whole
 * document. Either path, on either kind of page, is a best-effort enrichment: a failure here is
 * logged and produces an empty {@link Extraction}, never a failed upload.
 *
 * <p>Page one is read first, and almost always is enough on its own. When it is not — a long
 * letterhead or a full page of "Read:" citations can push "ABSTRACT" itself onto the next page —
 * page two is read as well and the search repeated over both together, since the two are also how a
 * paragraph that happens to break across the page boundary gets read whole. Reading page two costs a
 * second OCR pass on a scan, which is why it only happens when page one alone turned up no
 * description, rather than for every document as a matter of course.
 */
@Component
public class DocumentAbstractExtractor {

    private static final Logger log = LoggerFactory.getLogger(DocumentAbstractExtractor.class);

    /** Below this many characters of native text, page 1 is treated as a scanned image. */
    private static final int NATIVE_TEXT_THRESHOLD = 80;

    private static final int OCR_DPI = 300;

    /** A sanity bound on what gets stored — never reached by the paragraphs this looks for. */
    private static final int MAX_DESCRIPTION_LENGTH = 2000;

    private static final Pattern ABSTRACT_PATTERN = Pattern.compile(
            "ABSTRACT[^\\n]*\\n(.*?Issued\\.)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    /**
     * The department heading, wherever it sits on the page: a short line — the department's own
     * name plus, often, a bracketed section/cell name that is dropped by {@link DepartmentMatcher},
     * e.g. "Public Works [Estt-I(1)] Department" or "FINANCE (TAPS) DEPARTMENT" — ending in the word
     * "DEPARTMENT" itself, optionally followed by a stray "." or "," (the letterhead's own
     * punctuation, or a scan/OCR artifact) before the line ends. Anchoring on the line's <em>end</em>
     * rather than just the word's presence is what keeps this from matching a department mentioned
     * mid-sentence inside a cited G.O.'s citation line, e.g. "G.O.(Ms) No.111, Finance (TAPS)
     * Department, dated 16.06.2026" — there, more text follows "Department" before the line ends, so
     * it does not qualify.
     */
    private static final Pattern DEPARTMENT_LINE_PATTERN = Pattern.compile(
            "(?m)^[ \\t]*([A-Za-z][^\\n]{0,78}?\\bDEPARTMENT)\\b[.,]?[ \\t]*$", Pattern.CASE_INSENSITIVE);

    /**
     * The G.O. reference line, wherever it sits on the page — usually in the letterhead above the
     * Abstract, not inside it. Tamil Nadu government orders write this several ways: "G.O.Ms.No.123",
     * "G.O.(Ms).No.10" (a period rather than a space before "No", as this office's Procurement Cell
     * and Allowances orders write it), "G.O. (2D) No. 45", "G.O. Rt. No. 456" and plain "Government
     * Order No. 123" all show up, so the type marker in the parentheses/abbreviation is optional, the
     * punctuation between it and "No" is not assumed to be a space, and the whole match — not just the
     * digits — is what gets stored, since "Ms.No.123" and "Rt.No.123" are different orders.
     */
    private static final Pattern GO_NUMBER_PATTERN = Pattern.compile(
            "(?:G(?:overnment)?\\.?\\s*O(?:rder)?\\.?\\s*(?:\\([^)\\n]{1,10}\\)\\s*[.,]?\\s*)?"
                    + "(?:M\\.?S\\.?|Ms\\.?|Rt\\.?|D\\.?)?\\s*No\\.?\\s*[:.\\-]?\\s*(\\d[\\d/\\-]*))",
            Pattern.CASE_INSENSITIVE);

    /**
     * Where the block of <em>cited</em> G.O.s starts — everything from here on lists earlier orders
     * this document amends, refers back to, or was prompted by, e.g. "G.O.(Ms) No.111, Finance (TAPS)
     * Department, dated 16.06.2026". Tamil Nadu offices head that block several ways — "Read:",
     * "Read:-", "Read the following:-", "Read also:", "Ref:", "Reference:" — and a document can cite
     * any number of entries under it, none of which is the number of the document itself, so the
     * search for the real G.O. number stops at whichever heading appears rather than picking whichever
     * citation {@link Matcher#find()} happens to reach first.
     */
    private static final Pattern READ_MARKER = Pattern.compile(
            "\\b(?:read(?:s)?(?:\\s+also)?(?:\\s+the\\s+following)?|ref(?:erences?)?\\.?)\\s*[:.]",
            Pattern.CASE_INSENSITIVE);

    /** A sanity bound on what gets stored for the G.O. number, mirroring the description's. */
    private static final int MAX_GO_NUMBER_LENGTH = 100;

    /** Null when the bundled language data could not be staged; OCR is then skipped rather than failing. */
    private final Path tessdataDir = stageTessdata();

    /**
     * What was read from the document's own text. Any field may be null on its own — a document can
     * carry a G.O. number with no Abstract heading, or the reverse.
     */
    public record Extraction(String description, String departmentHint, String goNumber) {
        public static final Extraction NONE = new Extraction(null, null, null);
    }

    /**
     * @return the Abstract paragraph, department heading and G.O. number, or {@link Extraction#NONE}
     *     when the bytes are not a readable PDF or do not follow the convention this looks for
     */
    public Extraction extract(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            int pageCount = document.getNumberOfPages();
            if (pageCount == 0) {
                return Extraction.NONE;
            }

            String text = readPage(document, 1);
            Extraction extraction = extractionFrom(text);

            // Only worth a second page, and a possible second OCR pass, when the first did not
            // already answer the one thing that anchors everything else here — see the class
            // Javadoc for why the Abstract can land on page two at all.
            if (extraction.description() == null && pageCount > 1) {
                text = text + "\n" + readPage(document, 2);
                extraction = extractionFrom(text);
            }

            return extraction;
        } catch (IOException | RuntimeException ex) {
            log.warn("Could not extract a description from an uploaded PDF", ex);
            return Extraction.NONE;
        }
    }

    private Extraction extractionFrom(String text) {
        return new Extraction(findDescription(text), findDepartmentHint(text), findGoNumber(text));
    }

    /** One page's text, native if it has enough of one, OCR otherwise. {@code page} is 1-based. */
    private String readPage(PDDocument document, int page) throws IOException {
        String text = nativeText(document, page);
        return text.trim().length() < NATIVE_TEXT_THRESHOLD ? ocrPage(document, page - 1) : text;
    }

    private static String nativeText(PDDocument document, int page) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        return stripper.getText(document);
    }

    /** @param pageIndex 0-based, matching {@link PDFRenderer#renderImageWithDPI}. */
    private String ocrPage(PDDocument document, int pageIndex) throws IOException {
        if (tessdataDir == null) {
            return "";
        }

        BufferedImage image = new PDFRenderer(document).renderImageWithDPI(pageIndex, OCR_DPI);

        Tesseract tesseract = new Tesseract();
        tesseract.setDatapath(tessdataDir.toString());
        tesseract.setLanguage("eng");
        try {
            return tesseract.doOCR(image);
        } catch (TesseractException ex) {
            throw new IOException("OCR failed", ex);
        }
    }

    private static String findDescription(String text) {
        Matcher matcher = ABSTRACT_PATTERN.matcher(text);
        if (!matcher.find()) {
            return null;
        }

        String description = collapse(matcher.group(1));
        if (description != null && description.length() > MAX_DESCRIPTION_LENGTH) {
            description = description.substring(0, MAX_DESCRIPTION_LENGTH);
        }
        return description;
    }

    /**
     * @return the document's own department heading, or null when there is none.
     *     <p>Like {@link #findGoNumber}, searched for only before the citation block — a document
     *     amending or referring to an earlier order names that order's department too, and the first
     *     "DEPARTMENT"-ending line on the page should be the document's own heading, not one pulled
     *     out of a citation.
     */
    private static String findDepartmentHint(String text) {
        String heading = beforeCitations(text);
        Matcher matcher = DEPARTMENT_LINE_PATTERN.matcher(heading);
        return matcher.find() ? collapse(matcher.group(1)) : null;
    }

    /**
     * @return the document's own G.O. number, or null when there is none.
     *     <p>Searched for only <em>before</em> the citation block, when there is one — a G.O. can cite
     *     any number of earlier orders there, and taking the first match anywhere on the page would
     *     just as happily return one of those instead of the number of the document itself.
     */
    private static String findGoNumber(String text) {
        String heading = beforeCitations(text);

        String goNumber = firstGoNumberIn(heading);
        // Text extraction does not always preserve visual reading order for a multi-column
        // letterhead, so the heading's own number can occasionally land after the citation marker in
        // the extracted text even though it prints above it on the page — search the whole page
        // rather than reporting nothing.
        return goNumber != null || heading.length() == text.length() ? goNumber : firstGoNumberIn(text);
    }

    /** Everything on the page before the citation block ("Read:", "Ref:", ...), or all of it when there is none. */
    private static String beforeCitations(String text) {
        Matcher readMatcher = READ_MARKER.matcher(text);
        return readMatcher.find() ? text.substring(0, readMatcher.start()) : text;
    }

    private static String firstGoNumberIn(String text) {
        Matcher matcher = GO_NUMBER_PATTERN.matcher(text);
        if (!matcher.find()) {
            return null;
        }

        String goNumber = collapse(matcher.group());
        if (goNumber != null && goNumber.length() > MAX_GO_NUMBER_LENGTH) {
            goNumber = goNumber.substring(0, MAX_GO_NUMBER_LENGTH);
        }
        return goNumber;
    }

    private static String collapse(String raw) {
        String collapsed = raw.replaceAll("\\s+", " ").trim();
        return collapsed.isEmpty() ? null : collapsed;
    }

    /**
     * Tesseract reads its language model from a real file, not the classpath, so the bundled
     * resource is copied out once per process to a temp location that outlives this call.
     */
    private static Path stageTessdata() {
        try {
            Path dir = Files.createTempDirectory("allgos-tessdata");
            Path target = dir.resolve("eng.traineddata");
            try (InputStream in = DocumentAbstractExtractor.class.getResourceAsStream("/tessdata/eng.traineddata")) {
                if (in == null) {
                    throw new IOException("eng.traineddata is missing from the classpath");
                }
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            return dir;
        } catch (IOException ex) {
            log.error("Tesseract language data could not be staged; scanned PDFs will get no description", ex);
            return null;
        }
    }
}
