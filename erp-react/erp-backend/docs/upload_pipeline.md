# Upload pipeline — limits, streaming and resource bounds

This document records how a file travels from the browser to storage, which limits
apply, and why each value is what it is. Limits are configuration; the reasons are
here so they are changed deliberately rather than by accident.

## Pipeline

```
browser (per-file size check, 30 min transfer timeout)
    ↓  multipart/form-data
UploadSizeGateFilter        -- rejects an over-limit request from Content-Length (413), before any body is read
    ↓
Tomcat multipart parser     -- writes every part to spring.servlet.multipart.location (disk, threshold 0B)
    ↓
Controller                  -- file size / extension allowlist / storage-quota checks (unchanged)
    ↓
UploadStreams               -- 64 KB bounded-buffer copy, SHA-256 in the same pass
    ↓
app.upload.dir              -- final stored copy (UUID file name, extension from the sanitized original)
    ↓
（long-running work only）  -- 202 Accepted + background job (CAD conversion, contract extraction); the HTTP worker is released
```

Two copies of a large upload exist on disk at the same time: the container's spool
copy and the stored copy. Size the spool volume for
`max-request-size × concurrent uploads`, and the storage volume for the attachment
pool (4 GB shared, enforced by `AttachmentStorageService`).

## Limits and why they are what they are

| Setting | Default | Env var | Why |
|---|---|---|---|
| `spring.servlet.multipart.max-file-size` | `2GB` | `ERP_MAX_FILE_SIZE` | Product limit, not a server tuning value: every attachment zone in the UI states "up to 2GB per file" and `src/utils/attachmentStorage.js` refuses larger files in the browser. Lowering it alone would accept less than the product offers — change the frontend mirror at the same time, or not at all. |
| `spring.servlet.multipart.max-request-size` | `2200MB` | `ERP_MAX_REQUEST_SIZE` | One multipart request can carry several files; must stay above `max-file-size` to leave room for framing. |
| `spring.servlet.multipart.file-size-threshold` | `0B` | `ERP_UPLOAD_DISK_THRESHOLD` | Parts always go to disk, so peak heap cost does not scale with upload size. |
| `spring.servlet.multipart.location` | `${java.io.tmpdir}/erp-upload-spool` | `ERP_UPLOAD_TEMP_DIR` | Explicit spool volume instead of the container's implicit work directory; created at startup by `UploadStorageConfig` (Tomcat does not create it). |
| `server.tomcat.max-swallow-size` | `2MB` | `ERP_MAX_SWALLOW_SIZE` | After a rejection the container drains at most this much of the body. Previously 2200MB: one oversized request could cost 2.2 GB of extra reading. |
| `server.tomcat.max-part-count` | `50` | `ERP_MAX_PART_COUNT` | Must stay above the 25-document bulk-extraction batch (`app.processing-jobs.max-files`). Single-file uploads use one part. |
| `app.upload.lead-import-max-bytes` | `20MB` (20971520) | `ERP_LEAD_IMPORT_MAX_BYTES` | The Lead CSV import parses the file as text; the read is capped (5,000 rows max is far below this for legitimate files). |
| per-handler caps | models 500 MB, drawings 50 MB | — | Enforced in `ModelService` / `DrawingService` independently of the global limit. |

## Memory contract

No upload path may put a whole file in the heap. `util/UploadStreams` is the only
place that turns an upload into bytes:

- `copyWithSha256(upload, path)` — streams in 64 KB buffers and computes SHA-256 in
  the same pass (one read, one write, no second pass over the file).
- `readBounded(upload, cap, message)` — the one legitimate whole-payload reader
  (Lead CSV import), hard-capped.

`UploadStreamingGuardTests` fails the build if `.getBytes()` or `readAllBytes()`
reappears anywhere under `src/main/java` (the CAD engines' process-output reads are
the single documented exception).

## Long-running work

Uploads themselves are storage-only and fast. Anything that parses or converts runs
on a background job, and the request returns `202` immediately:

- CAD conversion: `POST /models/{id}/convert` → `202` + `ConversionAsyncConfig` pool.
- Contract bulk extraction: `POST /sales-contracts/bulk/extract` → `202` + `processing_jobs` row.

## Verification

```bash
cd erp-backend
./mvnw -B -o test -Dtest='UploadStreamsTests,UploadSizeGateFilterTests,UploadStreamingGuardTests,LeadImportLimitTests'
```

`UploadStreamsTests` measures the largest read a 24 MB upload is asked for and
asserts it stays within `UploadStreams.BUFFER_BYTES`.

## Storage location

Where the stored copy lands on disk, which components read and write each
sub-directory, the `ERP_UPLOAD_DIR` configuration a production deployment must
set, and the restart-persistence guarantees are documented in
[file-storage-deployment.md](file-storage-deployment.md). The layout is locked by
`StorageRootConfigurationTests`.
