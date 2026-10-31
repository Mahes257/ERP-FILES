package com.vishatech.erp.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.ProcessingJobResponse;
import com.vishatech.erp.entity.ProcessingJob;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.service.ProcessingJobInputStore.StoredInput;
import com.vishatech.erp.util.AuditContext;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Sales Contract bulk upload — the request-path half of the extraction flow.
 *
 * <pre>
 *   POST /sales-contracts/bulk/extract
 *        validate  (type, emptiness, batch limits — same rules as before)
 *        store     (stream each document to a job-scoped staging directory)
 *        create    (durable QUEUED job row, carrying the manifest)
 *        return    202 Accepted + jobId
 *                        |
 *                        v   processing-job worker (bounded pool)
 *                    parse with PDFBox / Apache POI
 *                    persist results on the job row
 *                        |
 *   GET /sales-contracts/bulk/extract/{jobId}
 *        QUEUED / PROCESSING / COMPLETED (+results) / FAILED (+safe reason)
 * </pre>
 *
 * <p>Why this endpoint and not others: parsing uploaded documents was the only
 * remaining heavyweight parser on a request thread in this application (CAD
 * conversion already returns 202 from the same pattern). Ordinary uploads —
 * attachments, documents, drawings — are streamed to storage and untouched.
 *
 * <p>A repeated submission of the same batch (double click, client retry) is
 * recognised by its content fingerprint and reuses the existing job — queued,
 * running, or already completed — instead of parsing the documents twice. A
 * previous FAILED attempt is not reused, so uploading again genuinely retries.
 */
@Service
public class SalesContractBulkExtractionService {

    /** Operation type registered by {@link SalesContractExtractionJobHandler}. */
    public static final String JOB_TYPE = SalesContractExtractionJobHandler.JOB_TYPE;

    /**
     * How much of each document is hashed for the fingerprint. Enough to separate
     * different documents with the same name and size, without reading gigabytes.
     */
    private static final int FINGERPRINT_HEAD_BYTES = 64 * 1024;

    private final SalesContractExtractionService extractionService;
    private final ProcessingJobService processingJobs;
    private final ProcessingJobInputStore inputStore;
    private final ObjectMapper mapper;
    private final AuditContext auditContext;

    private final int maxFiles;
    private final long maxFileBytes;
    private final long maxTotalBytes;

    public SalesContractBulkExtractionService(SalesContractExtractionService extractionService,
                                              ProcessingJobService processingJobs,
                                              ProcessingJobInputStore inputStore,
                                              ObjectMapper mapper,
                                              AuditContext auditContext,
                                              @Value("${app.processing-jobs.max-files:25}") int maxFiles,
                                              @Value("${app.processing-jobs.max-file-bytes:104857600}") long maxFileBytes,
                                              @Value("${app.processing-jobs.max-total-bytes:314572800}") long maxTotalBytes) {
        this.extractionService = extractionService;
        this.processingJobs = processingJobs;
        this.inputStore = inputStore;
        this.mapper = mapper;
        this.auditContext = auditContext;
        this.maxFiles = Math.max(1, maxFiles);
        this.maxFileBytes = Math.max(1L, maxFileBytes);
        this.maxTotalBytes = Math.max(1L, maxTotalBytes);
    }

    /**
     * Accepts a batch for background extraction.
     *
     * @return the QUEUED job (either new, or the equivalent one still in flight)
     * @throws BadRequestException when the batch is empty, unsupported, empty
     *         document(s), or over the configured batch limits
     */
    @Transactional
    public ProcessingJob submit(MultipartFile[] files) throws IOException {
        MultipartFile[] batch = validate(files);

        String fingerprint = fingerprint(batch);
        Optional<ProcessingJob> reusable =
                processingJobs.findReusable(JOB_TYPE, fingerprint, auditContext.currentUserId());
        if (reusable.isPresent()) {
            return reusable.get();
        }

        String inputRef = inputStore.newInputRef();
        List<StoredInput> stored = inputStore.store(inputRef, batch);
        ProcessingJob job = processingJobs.create(
                JOB_TYPE, inputRef, fingerprint, manifestOf(stored), stored.size());
        // Start it only once this transaction is committed, so the worker cannot
        // read a row the database has not published yet.
        processingJobs.dispatchAfterCommit(job.getId());
        return job;
    }

    /** Status (and, once COMPLETED, the extracted results) for a submitted job. */
    @Transactional(readOnly = true)
    public ProcessingJobResponse status(Long jobId) {
        return processingJobs.status(jobId);
    }

    // ------------------------------------------------------------------
    // Validation — same rules and messages as the synchronous path
    // ------------------------------------------------------------------

    private MultipartFile[] validate(MultipartFile[] files) {
        if (files == null || files.length == 0) {
            throw new BadRequestException(
                    "No files were uploaded — attach at least one contract document");
        }
        if (files.length > maxFiles) {
            throw new BadRequestException(
                    "Too many documents in one batch — attach at most " + maxFiles + " files");
        }
        long total = 0;
        for (MultipartFile file : files) {
            // Type + emptiness: the extraction service owns these rules so the
            // request path and the worker can never disagree.
            extractionService.requireSupported(file.getOriginalFilename(), file.getSize());
            if (file.getSize() > maxFileBytes) {
                throw new BadRequestException("File \"" + displayName(file) + "\" is too large for background"
                        + " extraction (limit " + humanSize(maxFileBytes) + ")");
            }
            total += file.getSize();
        }
        if (total > maxTotalBytes) {
            throw new BadRequestException("This batch is too large for background extraction (limit "
                    + humanSize(maxTotalBytes) + ") — upload the documents in smaller batches");
        }
        return files;
    }

    private String displayName(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name == null || name.isBlank() ? "document" : name;
    }

    // ------------------------------------------------------------------
    // Fingerprint + manifest
    // ------------------------------------------------------------------

    /**
     * SHA-256 over each document's name, size and first 64 kB, in order. Two
     * submissions of the same batch produce the same value; a different document
     * (or a different order) does not.
     */
    private String fingerprint(MultipartFile[] files) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (Exception e) {
            throw new IllegalStateException("Could not fingerprint the upload", e);
        }
        for (MultipartFile file : files) {
            digest.update((displayName(file) + "|" + file.getSize() + "|").getBytes(StandardCharsets.UTF_8));
            try (InputStream in = file.getInputStream()) {
                digest.update(in.readNBytes(FINGERPRINT_HEAD_BYTES));
            }
            digest.update((byte) '\n');
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private String manifestOf(List<StoredInput> stored) throws IOException {
        List<Map<String, Object>> entries = new ArrayList<>(stored.size());
        for (StoredInput input : stored) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("storedName", input.storedName());
            entry.put("originalName", input.originalName());
            entry.put("size", input.size());
            entries.add(entry);
        }
        return mapper.writeValueAsString(entries);
    }

    private static String humanSize(long bytes) {
        if (bytes >= 1024L * 1024L * 1024L) {
            return (bytes / (1024L * 1024L * 1024L)) + " GB";
        }
        if (bytes >= 1024L * 1024L) {
            return (bytes / (1024L * 1024L)) + " MB";
        }
        if (bytes >= 1024L) {
            return (bytes / 1024L) + " KB";
        }
        return String.format(Locale.ROOT, "%d bytes", bytes);
    }
}
