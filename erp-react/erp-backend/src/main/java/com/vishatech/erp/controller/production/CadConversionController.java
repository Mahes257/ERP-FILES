package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.CadConversionJobDTO;
import com.vishatech.erp.service.cad.CadConversionJobService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Authenticated CAD conversion job API for server-side formats
 * (SLDPRT / SLDASM / SAT).
 *
 * <pre>
 *   POST /v1/models/{modelId}/cad-conversion  -> 202 { jobId, status: QUEUED }
 *                                            or 200 { accepted:false, status, message }
 *   GET  /v1/cad-conversion/{jobId}           -> QUEUED | PROCESSING |
 *                                                COMPLETED (+ previewUrl) |
 *                                                FAILED (+ safe message) |
 *                                                CANCELLED
 *   GET  /v1/cad-conversion/model/{modelId}   -> latest job, or 200 data:null when none
 *   POST /v1/cad-conversion/{jobId}/cancel    -> cancels a QUEUED job
 *   GET  /v1/cad-conversion/health            -> worker availability + engine matrix
 * </pre>
 *
 * <p><b>Why refusals and empty lookups are 200s, not 4xx:</b> the ERP client
 * treats every non-401 API error as a fatal, page-replacing failure (see
 * {@code ApiErrorProvider}). "This format has no engine on this server",
 * "the queue is full" and "this model has no job yet" are ordinary answers the
 * viewer renders inline — sending them as 404/409 would blank the whole page
 * instead. Genuine faults stay errors: 404 for an unknown job id, 401/403 for
 * authentication and authorisation.
 *
 * <p>Every route sits behind the existing JWT filter and the production model
 * authorities — there is no unauthenticated or public CAD endpoint, and the
 * worker exposes no port of its own. Browser formats (GLB/GLTF/OBJ/STL and the
 * OCCT-rendered STEP/IGES/BREP) never reach this controller.
 */
@RestController
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class CadConversionController {

    private final CadConversionJobService cadJobs;

    public CadConversionController(CadConversionJobService cadJobs) {
        this.cadJobs = cadJobs;
    }

    /**
     * Queue a conversion for the model's current file. Idempotent: submitting
     * again while a job is in flight returns that same job, so a double click
     * or a page reload can never start two conversions.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/models/{modelId}/cad-conversion")
    public ResponseEntity<?> submit(@PathVariable Long modelId) {
        CadConversionJobService.SubmitResult result = cadJobs.submit(modelId);
        if (result.accepted()) {
            return ResponseEntity.accepted()
                    .body(ApiResponse.ok("Conversion queued.", result.job()));
        }
        // A refusal is a decision, not a fault: 200 with the real reason so the
        // viewer can explain it in place (no job row was created).
        Map<String, Object> refusal = new LinkedHashMap<>();
        refusal.put("accepted", false);
        refusal.put("status", result.status());
        refusal.put("message", result.message());
        refusal.put("jobId", null);
        return ResponseEntity.ok(ApiResponse.ok(result.message(), refusal));
    }

    /** Poll a job. Terminal states stop the client's polling loop. */
    @GetMapping("/cad-conversion/{jobId}")
    public ResponseEntity<ApiResponse<CadConversionJobDTO>> get(@PathVariable String jobId) {
        return ResponseEntity.ok(ApiResponse.ok(cadJobs.get(jobId)));
    }

    /**
     * Latest job for a model — lets the viewer resume polling after a refresh.
     *
     * <p>"No job exists yet" is a normal first-visit answer, so it is 200 with
     * {@code data: null} rather than a 404 (which the ERP client would treat as
     * a fatal page error).
     */
    @GetMapping("/cad-conversion/model/{modelId}")
    public ResponseEntity<ApiResponse<CadConversionJobDTO>> forModel(@PathVariable Long modelId) {
        Optional<CadConversionJobDTO> job = cadJobs.findLatestForModel(modelId);
        return ResponseEntity.ok(ApiResponse.<CadConversionJobDTO>ok(
                job.map(j -> "Latest conversion job").orElse("No conversion job for this model yet."),
                job.orElse(null)));
    }

    /** Cancel a job that has not started; an in-flight job returns unchanged. */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/cad-conversion/{jobId}/cancel")
    public ResponseEntity<ApiResponse<CadConversionJobDTO>> cancel(@PathVariable String jobId) {
        return ResponseEntity.ok(ApiResponse.ok("Cancellation processed.", cadJobs.cancel(jobId)));
    }

    /**
     * Worker/queue/engine availability for the viewer's status line. Authenticated
     * (PRODUCTION_VIEW) — health detail is internal, never anonymous.
     */
    @GetMapping("/cad-conversion/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> health() {
        return ResponseEntity.ok(ApiResponse.ok(cadJobs.health()));
    }
}
