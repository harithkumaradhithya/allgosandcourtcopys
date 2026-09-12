package com.allgos.dms.ad.service;

import com.allgos.dms.ad.entity.AdMediaKind;
import com.allgos.dms.common.exception.ApiException;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.apache.tika.Tika;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Decides whether a file may become an advert.
 *
 * <p>The same principle as {@code UploadValidator}, which guards documents: the declared content
 * type is not trusted, and the extension must agree with what the bytes actually are. It is a
 * separate class rather than a branch inside that one because the two allow-lists have nothing in
 * common — a document is a PDF or a scan, an advert is a picture or a film — and because an advert
 * is the only thing in this application whose bytes are handed straight to a {@code <video>} tag.
 *
 * <p>The size caps are tighter than the document limit on purpose. An advert is decoration on a
 * screen somebody opened to do something else, and a 40 MB film on the Home page of an office
 * sharing one connection is the sort of thing that gets the whole feature switched off.
 */
@Component
public class AdMediaValidator {

    /** Generous for a banner, and small enough that the slot is drawn before it is noticed. */
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;

    /** Enough for fifteen seconds of compressed 720p, which is longer than anybody will watch. */
    private static final long MAX_VIDEO_BYTES = 25L * 1024 * 1024;

    private static final int MAX_FILENAME_LENGTH = 200;

    /**
     * Extension to the signatures acceptable for it, and the kind each one becomes.
     *
     * <p>Several types are listed per extension where Tika is legitimately ambiguous: a WebM file is
     * a Matroska container and is often reported as one, and MP4 boxes are shared with a handful of
     * neighbouring formats. Listing them is narrower than loosening the check to a {@code video/*}
     * prefix, which would let anything through that claimed to be a film.
     */
    private static final Map<String, Allowed> ALLOWED = Map.of(
            "png", new Allowed(AdMediaKind.IMAGE, "image/png", Set.of("image/png")),
            "jpg", new Allowed(AdMediaKind.IMAGE, "image/jpeg", Set.of("image/jpeg")),
            "jpeg", new Allowed(AdMediaKind.IMAGE, "image/jpeg", Set.of("image/jpeg")),
            "webp", new Allowed(AdMediaKind.IMAGE, "image/webp", Set.of("image/webp")),
            "gif", new Allowed(AdMediaKind.GIF, "image/gif", Set.of("image/gif")),
            "mp4", new Allowed(AdMediaKind.VIDEO, "video/mp4", Set.of("video/mp4", "application/mp4")),
            "webm", new Allowed(AdMediaKind.VIDEO, "video/webm", Set.of("video/webm", "video/x-matroska")));

    private static final String TYPES_MESSAGE = "Allowed: PNG, JPG, WebP, GIF, MP4 or WebM.";

    private final Tika tika = new Tika();

    /**
     * @return what to store about the media: its kind, the canonical type to serve it as, a safe
     *     filename and its size
     */
    public Accepted validate(MultipartFile part) {
        if (part == null || part.isEmpty()) {
            throw ApiException.badRequest("AD_MEDIA_EMPTY", "Choose a picture or a video for the advert.");
        }

        String fileName = safeName(part.getOriginalFilename());
        Allowed allowed = ALLOWED.get(extensionOf(fileName));
        if (allowed == null) {
            throw ApiException.badRequest(
                    "AD_MEDIA_TYPE_NOT_ALLOWED", "%s cannot be used as an advert. %s".formatted(fileName, TYPES_MESSAGE));
        }

        long limit = allowed.kind() == AdMediaKind.VIDEO ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (part.getSize() > limit) {
            throw ApiException.badRequest(
                    "AD_MEDIA_TOO_LARGE",
                    "%s is larger than the %d MB limit for %s."
                            .formatted(
                                    fileName,
                                    limit / (1024 * 1024),
                                    allowed.kind() == AdMediaKind.VIDEO ? "video" : "images"));
        }

        String detected = detect(part, fileName);
        if (!allowed.signatures().contains(detected)) {
            throw ApiException.badRequest(
                    "AD_MEDIA_CONTENT_MISMATCH",
                    "The contents of %s do not match its file extension.".formatted(fileName));
        }

        return new Accepted(allowed.kind(), allowed.storedType(), fileName, part.getSize());
    }

    private String detect(MultipartFile part, String fileName) {
        try (InputStream stream = new BufferedInputStream(part.getInputStream())) {
            return tika.detect(stream, fileName);
        } catch (IOException ex) {
            throw ApiException.badRequest("AD_MEDIA_UNREADABLE", "%s could not be read.".formatted(fileName));
        }
    }

    /**
     * Strips any directory component and anything that could travel, then bounds the length.
     *
     * <p>The same rule as {@code UploadValidator.safeName}, which guards documents, written out
     * again here rather than shared: that one is package-private to the file module and used by
     * its service, and widening it to reach a second module is a larger change than the eight
     * lines it saves. If either is ever tightened, tighten both.
     */
    static String safeName(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "advert";
        }
        String name = originalFilename.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        name = name.replaceAll("\\p{Cntrl}", "").replaceAll("[/:*?\"<>|]", "_").trim();

        if (name.isBlank() || name.equals(".") || name.equals("..")) {
            return "advert";
        }
        return name.length() > MAX_FILENAME_LENGTH ? name.substring(name.length() - MAX_FILENAME_LENGTH) : name;
    }

    private static String extensionOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot < 0 ? "" : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private record Allowed(AdMediaKind kind, String storedType, Set<String> signatures) {}

    /** The validated facts about the media: what it is, how to serve it, what to call it, how big. */
    public record Accepted(AdMediaKind kind, String contentType, String fileName, long sizeBytes) {}
}
