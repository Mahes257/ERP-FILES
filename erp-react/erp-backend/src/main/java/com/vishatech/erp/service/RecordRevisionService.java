package com.vishatech.erp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.dto.RecordRevisionResponse;
import com.vishatech.erp.entity.RecordRevision;
import com.vishatech.erp.repository.RecordRevisionRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Persists a full-state snapshot of a CRM record (Customer / Lead / Follow-up)
 * every time it is edited.  The master row is never duplicated or overwritten —
 * each edit appends one immutable snapshot row, so the complete version history
 * is preserved in MySQL.
 */
@Service
public class RecordRevisionService {

    private static final Logger log = LoggerFactory.getLogger(RecordRevisionService.class);

    private final RecordRevisionRepository repository;
    private final ObjectMapper objectMapper;
    private final EditHistoryService editHistoryService;

    public RecordRevisionService(RecordRevisionRepository repository,
                                 ObjectMapper objectMapper,
                                 EditHistoryService editHistoryService) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.editHistoryService = editHistoryService;
    }

    /** Static accessor used by services that inject this lazily. */
    public static RecordRevisionService get() {
        return com.vishatech.erp.config.SpringContext.getBean(RecordRevisionService.class);
    }

    /**
     * Capture the current state of {@code entity} as a new revision row for
     * {@code moduleType}/{@code recordId}.  Call this BEFORE applying edits.
     */
    public void record(String moduleType, Long recordId, Object entity) {
        if (entity == null) {
            return;
        }
        recordSnapshot(moduleType, recordId, editHistoryService.snapshot(entity));
    }

    /**
     * Persist an already-captured state as the next immutable version.
     *
     * <p>Used by records that edit in place and therefore must preserve the
     * state they are ABOUT to replace: the caller snapshots the entity before
     * applying the request, decides whether the request is a genuine change,
     * and only then stores that before-state here. Reusing the shared
     * {@code record_revisions} table keeps E-Actions on the same history
     * infrastructure as the rest of the Sales module (no schema change).
     */
    public void recordSnapshot(String moduleType, Long recordId, Map<String, String> snapshot) {
        if (moduleType == null || recordId == null || snapshot == null) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(snapshot);
            RecordRevision rev = new RecordRevision();
            rev.setModuleType(moduleType);
            rev.setRecordId(recordId);
            rev.setVersion(repository.findMaxVersion(moduleType, recordId) + 1);
            rev.setSnapshotJson(json);
            rev.setChangedBy(currentUserName());
            rev.setCreatedAt(LocalDateTime.now());
            repository.save(rev);
        } catch (JsonProcessingException e) {
            log.warn("Could not snapshot {} #{} for revision history: {}", moduleType, recordId, e.getMessage());
        }
    }

    /** Every saved version of a record, oldest first. */
    public List<RecordRevisionResponse> list(String moduleType, Long recordId) {
        return repository.findByModuleTypeAndRecordIdOrderByVersionAsc(moduleType, recordId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private RecordRevisionResponse toResponse(RecordRevision rev) {
        Map<String, String> fields = Map.of();
        if (rev.getSnapshotJson() != null && !rev.getSnapshotJson().isBlank()) {
            try {
                fields = objectMapper.readValue(rev.getSnapshotJson(), new TypeReference<Map<String, String>>() { });
            } catch (Exception e) {
                log.warn("Could not parse snapshot json for revision {}: {}", rev.getId(), e.getMessage());
            }
        }
        return new RecordRevisionResponse(
                rev.getId(),
                rev.getVersion(),
                rev.getChangedBy(),
                rev.getCreatedAt() == null ? null : rev.getCreatedAt().toString(),
                fields);
    }

    private static String currentUserName() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }
}
