package com.vishatech.erp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.SalesContractExtractionResult;
import com.vishatech.erp.entity.ProcessingJob;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Background worker for the Sales Contract bulk-upload extraction.
 *
 * <p>This is the work that used to run on the HTTP request thread: PDFBox and
 * Apache POI parsing every uploaded document, one after another, before the
 * response could be written. It now runs on the processing-job pool, reading the
 * documents the request staged on disk ({@link ProcessingJobInputStore}).
 *
 * <p>Behaviour is deliberately identical to the synchronous path — same parser,
 * same four extracted fields, same {@code fileName} reported per document — so
 * the client sees exactly the payload it always saw, just delivered through the
 * job status instead of the upload response.
 */
@Service
public class SalesContractExtractionJobHandler implements ProcessingJobHandler {

    /** Operation type for Sales Contract bulk extraction jobs. */
    public static final String JOB_TYPE = "SALES_CONTRACT_BULK_EXTRACT";

    private final SalesContractExtractionService extractionService;
    private final ProcessingJobInputStore inputStore;
    private final ObjectMapper mapper;

    public SalesContractExtractionJobHandler(SalesContractExtractionService extractionService,
                                             ProcessingJobInputStore inputStore,
                                             ObjectMapper mapper) {
        this.extractionService = extractionService;
        this.inputStore = inputStore;
        this.mapper = mapper;
    }

    @Override
    public String jobType() {
        return JOB_TYPE;
    }

    @Override
    public String process(ProcessingJob job) throws Exception {
        List<InputFile> inputs = readManifest(job.getInputManifest());
        if (inputs.isEmpty() || !inputStore.hasInputs(job.getInputRef())) {
            // The staging directory is gone (cleaned up, or the server was replaced
            // between submission and processing). Say so instead of reporting an
            // empty extraction, which would look like "nothing was found".
            throw new IllegalStateException(
                    "The uploaded documents are no longer available on the server — please upload them again.");
        }

        List<SalesContractExtractionResult> results = new ArrayList<>(inputs.size());
        for (InputFile input : inputs) {
            Path file = inputStore.resolveInput(job.getInputRef(), input.storedName());
            if (!Files.isRegularFile(file)) {
                throw new IllegalStateException(
                        "One of the uploaded documents is missing from storage — please upload the batch again.");
            }
            results.add(extractionService.extractFile(input.originalName(), file));
        }
        return mapper.writeValueAsString(results);
    }

    /** Reads the staged-input manifest written at submission time. */
    private List<InputFile> readManifest(String manifestJson) throws Exception {
        List<InputFile> inputs = new ArrayList<>();
        if (manifestJson == null || manifestJson.isBlank()) {
            return inputs;
        }
        JsonNode node = mapper.readTree(manifestJson);
        if (!node.isArray()) {
            return inputs;
        }
        for (JsonNode entry : node) {
            String storedName = entry.path("storedName").asText(null);
            if (storedName == null || storedName.isBlank()) {
                continue;
            }
            String originalName = entry.path("originalName").asText(null);
            inputs.add(new InputFile(storedName,
                    originalName == null || originalName.isBlank() ? "document" : originalName));
        }
        return inputs;
    }

    private record InputFile(String storedName, String originalName) {
    }
}
