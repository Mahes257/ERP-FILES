package com.vishatech.erp.util;

import com.vishatech.erp.exception.BadRequestException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.web.multipart.MultipartFile;

/**
 * Streaming helpers for uploaded files.
 *
 * <p>Every upload path in the application goes through one of these methods, so
 * a file's size never determines its heap cost: bytes travel in a
 * {@link #BUFFER_BYTES}-sized buffer. A 2 GB upload therefore costs one 64 KB
 * buffer (plus whatever the caller explicitly asks for, bounded by a configured
 * cap) — never a {@code byte[]} the size of the file.
 *
 * <p>This exists because copying an upload into a byte array puts the whole
 * payload in the heap on top of the copy the servlet container already spooled
 * to disk, so a handful of concurrent large uploads could exhaust the JVM heap.
 */
public final class UploadStreams {

    /**
     * Size of the bounded copy buffer. The peak heap cost of a streamed upload
     * is one buffer of this size, regardless of how large the upload is.
     */
    public static final int BUFFER_BYTES = 64 * 1024;

    private UploadStreams() {
    }

    /** A stored file, with the SHA-256 of its bytes computed in the same pass. */
    public record StoredFile(Path path, String sha256, long size) {

        /** The stored path as a string (the shape the entities persist). */
        public String pathString() {
            return path.toString();
        }
    }

    /**
     * Streams an upload to {@code targetPath} and hashes it in the same pass.
     *
     * <p>Single pass, single write: the file is read from the container's spool
     * in bounded chunks, written straight to the destination, and fed to
     * SHA-256 on the way. There is no second read and no in-memory copy of the
     * file.
     *
     * @return the stored path, its SHA-256 (lowercase hex) and the bytes written
     */
    public static StoredFile copyWithSha256(MultipartFile upload, Path targetPath) throws IOException {
        MessageDigest digest = sha256();
        long written = 0;
        byte[] buffer = new byte[BUFFER_BYTES];
        try (InputStream in = upload.getInputStream();
             DigestInputStream hashing = new DigestInputStream(in, digest);
             OutputStream out = Files.newOutputStream(targetPath,
                     StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING,
                     StandardOpenOption.WRITE)) {
            int read;
            while ((read = hashing.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                written += read;
            }
        }
        return new StoredFile(targetPath, HexFormat.of().formatHex(digest.digest()), written);
    }

    /**
     * Reads an upload into a byte array that can never exceed {@code maxBytes}.
     *
     * <p>For the rare caller that genuinely needs the whole payload as text (the
     * Lead CSV import), this keeps the read bounded and honest: a file above the
     * cap is refused with a clear message instead of inflating the heap to the
     * size of whatever the client sent.
     *
     * @param maxBytes        hard cap; {@code <= 0} means "no cap" (not advised)
     * @param tooLargeMessage the {@link BadRequestException} message when the cap
     *                        is exceeded
     */
    public static byte[] readBounded(MultipartFile upload, long maxBytes, String tooLargeMessage)
            throws IOException {
        long cap = maxBytes > 0 ? maxBytes : Long.MAX_VALUE;
        ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.min(cap, 1 << 20));
        byte[] buffer = new byte[BUFFER_BYTES];
        long total = 0;
        try (InputStream in = upload.getInputStream()) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                total += read;
                if (total > cap) {
                    throw new BadRequestException(tooLargeMessage);
                }
                out.write(buffer, 0, read);
            }
        }
        return out.toByteArray();
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the Java platform — unreachable in practice.
            throw new IllegalStateException("SHA-256 is unavailable in this JVM", e);
        }
    }
}
