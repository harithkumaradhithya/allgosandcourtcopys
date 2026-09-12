package com.allgos.dms.common.storage;

import com.allgos.dms.common.config.AppProperties;
import com.allgos.dms.common.exception.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/**
 * Every read and write of document bytes goes through here.
 *
 * <p>Two rules the rest of the application depends on:
 *
 * <ul>
 *   <li><b>The bucket is never public.</b> Nothing hands out a bucket URL; a reader gets a
 *       presigned GET that expires in minutes, so a copied link stops working almost immediately.
 *   <li><b>Keys are opaque.</b> A key is {@code {departmentId}/{folderId}/{uuid}{ext}} and carries
 *       nothing from the uploaded filename, so no one can guess another department's objects by
 *       knowing what a document is called.
 * </ul>
 *
 * <p>Storage is not transactional. A database rollback will not remove an uploaded object, so
 * callers upload only after the row is safely written and sweep the object themselves if the
 * transaction later fails.
 */
@Service
public class StorageService {

    private static final Logger log = LoggerFactory.getLogger(StorageService.class);

    private final S3Client s3Client;
    private final S3Presigner presigner;
    private final AppProperties.Storage storage;

    public StorageService(S3Client s3Client, S3Presigner presigner, AppProperties properties) {
        this.s3Client = s3Client;
        this.presigner = presigner;
        this.storage = properties.storage();
    }

    /**
     * Builds the key for a new object. Random, so it reveals nothing and cannot collide; the
     * extension is kept only so that a downloaded object still opens in the right application.
     */
    public String newKey(UUID departmentId, UUID folderId, String originalFilename) {
        return "%s/%s/%s%s".formatted(departmentId, folderId, UUID.randomUUID(), extensionOf(originalFilename));
    }

    /**
     * The same, for objects that hang from nothing in the department tree — an advert's media, which
     * belongs to the whole site rather than to a folder in it.
     *
     * @param prefix the top-level folder in the bucket, e.g. {@code "ads"}
     */
    public String newKey(String prefix, String originalFilename) {
        return "%s/%s%s".formatted(prefix, UUID.randomUUID(), extensionOf(originalFilename));
    }

    public void put(String key, InputStream content, String contentType, long sizeBytes) {
        try {
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(storage.bucket())
                    .key(key)
                    .contentType(contentType)
                    .contentLength(sizeBytes)
                    .build();

            s3Client.putObject(request, RequestBody.fromInputStream(content, sizeBytes));
        } catch (S3Exception ex) {
            log.error("Upload to object storage failed for key {}", key, ex);
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "STORAGE_UNAVAILABLE",
                    "The document store is not reachable. Please try again.");
        }
    }

    public void put(String key, byte[] content, String contentType) {
        put(key, new ByteArrayInputStream(content), contentType, content.length);
    }

    /**
     * Reads an object back into memory, for server-side re-processing.
     *
     * <p>Everything a browser reads goes through {@link #presignedGet} instead — this is for the
     * application itself needing the bytes, not for handing them to a client.
     */
    public byte[] get(String key) {
        try {
            return s3Client
                    .getObjectAsBytes(GetObjectRequest.builder().bucket(storage.bucket()).key(key).build())
                    .asByteArray();
        } catch (S3Exception ex) {
            log.error("Read from object storage failed for key {}", key, ex);
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "STORAGE_UNAVAILABLE",
                    "The document store is not reachable. Please try again.");
        }
    }

    /**
     * A short-lived URL the browser can fetch directly, so document bytes never pass through the
     * application server.
     *
     * @param downloadFilename when given, the browser is told to save under this name rather than
     *     the opaque key; pass null for an inline preview
     */
    public String presignedGet(String key, Duration ttl, String downloadFilename) {
        GetObjectRequest.Builder get = GetObjectRequest.builder().bucket(storage.bucket()).key(key);

        if (downloadFilename != null && !downloadFilename.isBlank()) {
            get.responseContentDisposition("attachment; filename=\"%s\"".formatted(sanitiseHeader(downloadFilename)));
        }

        return presigner.presignGetObject(GetObjectPresignRequest.builder()
                        .signatureDuration(ttl == null ? storage.presignedUrlTtl() : ttl)
                        .getObjectRequest(get.build())
                        .build())
                .url()
                .toString();
    }

    public String presignedGet(String key) {
        return presignedGet(key, storage.presignedUrlTtl(), null);
    }

    /**
     * Removes the object permanently. Deleting a <em>file</em> in this application is soft and never
     * comes here — this is for sweeping an object whose database row failed to commit, and later for
     * purging.
     */
    public void delete(String key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(storage.bucket()).key(key).build());
        } catch (S3Exception ex) {
            // The caller is usually already handling a failure; losing an orphan is not worth
            // masking the original error.
            log.warn("Could not remove object {} from storage", key, ex);
        }
    }

    /** Silently ignores a null stream so callers can use it in a finally block. */
    public static void closeQuietly(InputStream stream) {
        if (stream == null) {
            return;
        }
        try {
            stream.close();
        } catch (IOException ignored) {
            // nothing useful to do
        }
    }

    /** @return the lowercase extension including the dot, or an empty string */
    private static String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "";
        }
        String extension = filename.substring(dot).toLowerCase(Locale.ROOT);
        return extension.matches("\\.[a-z0-9]{1,8}") ? extension : "";
    }

    /** Quotes and control characters in a filename would break the Content-Disposition header. */
    private static String sanitiseHeader(String filename) {
        return filename.replaceAll("[\"\\\\\\r\\n]", "_");
    }
}
