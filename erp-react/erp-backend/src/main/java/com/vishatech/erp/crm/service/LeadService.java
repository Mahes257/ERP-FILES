package com.vishatech.erp.crm.service;

import com.vishatech.erp.crm.dto.ActivityResponse;
import com.vishatech.erp.crm.dto.AttachmentResponse;
import com.vishatech.erp.crm.dto.ExportRequest;
import com.vishatech.erp.crm.dto.HistoryResponse;
import com.vishatech.erp.crm.dto.LeadRequest;
import com.vishatech.erp.crm.dto.LeadResponse;
import com.vishatech.erp.crm.dto.NoteResponse;
import com.vishatech.erp.crm.dto.TimelineResponse;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.Activity;
import com.vishatech.erp.entity.Attachment;
import com.vishatech.erp.entity.HistoryEntry;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.entity.LeadStage;
import com.vishatech.erp.crm.entity.LeadStatus;
import com.vishatech.erp.entity.Note;
import com.vishatech.erp.entity.TimelineEntry;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.util.UploadStreams;
import com.vishatech.erp.service.DocumentRepositoryService;
import com.vishatech.erp.service.FileStorageService;
import com.vishatech.erp.service.LocationMasterService;
import com.vishatech.erp.service.EditHistoryService;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

@Service
@Transactional
public class LeadService {

    private static final int MAX_IMPORT_ROWS = 5000;

    /** UI/audit label of the persisted closed state ({@link LeadStatus#INACTIVE}). */
    public static final String CLOSED_STATUS_LABEL = "Closed";

    /**
     * The lead reference downstream documents carry ("LEAD-000117", see the CRM
     * screens' formatLeadNo). Documents store the lead as a display number rather
     * than a foreign key, so that canonical form is the only one that can be
     * resolved back to a lead.
     */
    private static final java.util.regex.Pattern LEAD_NO_PATTERN =
            java.util.regex.Pattern.compile("^LEAD-(\\d+)$", java.util.regex.Pattern.CASE_INSENSITIVE);

    /** Bytes read from a CSV import before it is refused — see app.upload.lead-import-max-bytes. */
    private static final long DEFAULT_IMPORT_MAX_BYTES = 20L * 1024 * 1024;

    private final LeadRepository leadRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final LocationMasterService locationMasterService;
    /**
     * CRM Contacts: the lead's primary and secondary contacts are mirrored into
     * the contacts module here, so the Contacts list always reflects real saved
     * lead data. The sync is idempotent — it upserts the (lead, contact_type)
     * row and never appends duplicates, whatever the save path (form, import,
     * bulk edit).
     */
    private final ContactService contactService;
    private final String baseUrl;
    private final long importMaxBytes;

    public LeadService(LeadRepository leadRepository, EditHistoryRepository editHistoryRepository,
                       RecordRevisionRepository recordRevisionRepository, FileStorageService fileStorageService,
                       DocumentRepositoryService documentRepositoryService,
                       LocationMasterService locationMasterService,
                       ContactService contactService,
                       @Value("${app.base-url:http://localhost:8080}") String baseUrl,
                       @Value("${app.upload.lead-import-max-bytes:20971520}") long importMaxBytes) {
        this.leadRepository = leadRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.locationMasterService = locationMasterService;
        this.contactService = contactService;
        this.baseUrl = baseUrl;
        this.importMaxBytes = importMaxBytes > 0 ? importMaxBytes : DEFAULT_IMPORT_MAX_BYTES;
    }

    // ============================== Read ==============================

    @Transactional
    public Page<LeadResponse> list(int page, int size, String search, String sort,
                                   String stage, String status, String owner, String source,
                                   String dateFrom, String dateTo, BigDecimal minValue, BigDecimal maxValue) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<Lead> spec = buildSpecification(search, stage, status, owner, source, dateFrom, dateTo, minValue, maxValue);
        return leadRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<LeadResponse> listScoped(String scope, int page, int size, String search, String sort,
                                         String stage, String status, String owner, String source,
                                         String dateFrom, String dateTo, BigDecimal minValue, BigDecimal maxValue) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<Lead> spec = buildSpecification(search, stage, status, owner, source, dateFrom, dateTo, minValue, maxValue)
                .and(scopePredicate(scope));
        return leadRepository.findAll(spec, pageable).map(this::toResponse);
    }

    private Specification<Lead> scopePredicate(String scope) {
        return (root, query, cb) -> switch (scope) {
            case "clients" -> cb.equal(root.get("stage"), LeadStage.WON);
            case "followups" -> cb.not(root.get("stage").in(List.of(LeadStage.WON, LeadStage.LOST)));
            default -> cb.conjunction();
        };
    }

    @Transactional
    public LeadResponse get(Long id) {
        return toResponse(getLead(id));
    }

    // ============================== Write ==============================

    public LeadResponse create(LeadRequest request) {
        Lead lead = new Lead();
        applyRequest(lead, request);
        applySubmittedNote(lead, request.notes());
        lead.addTimeline(entry("created", "Lead created", "Lead '" + display(lead.getName()) + "' was added to the pipeline."));
        lead.addActivity(activity("created", "Lead created", "Lead was created.", null));
        lead.addHistory(history("Lead", null, lead.getName(), currentUserName()));
        Lead saved = leadRepository.save(lead);
        // Mirror the captured primary/secondary person into the Contacts module.
        contactService.syncFromLead(saved);
        return toResponse(saved);
    }

    public LeadResponse update(Long id, LeadRequest request) {
        Lead lead = getLead(id);
        assertNotClosed(lead);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(lead);
        com.vishatech.erp.service.RecordRevisionService.get().record("lead", lead.getId(), lead);
        applyRequest(lead, request);
        applySubmittedNote(lead, request.notes());
        lead.addTimeline(entry("updated", "Lead updated", "Lead details were updated by " + currentUserName() + "."));
        Lead saved = leadRepository.save(lead);
        editHistory.recordEdit("lead", saved.getId(), editBefore, editHistory.snapshot(saved));
        // Keep the contact mirrors in step with the edited lead (no duplicates:
        // the sync matches the existing (lead, contact_type) rows).
        contactService.syncFromLead(saved);
        return toResponse(saved);
    }

    /**
     * Persist the create/edit form's public "Notes" textarea as a lead note.
     *
     * The form edits notes as one text block while the model stores a list of
     * notes, so a note is appended only when the submitted text actually
     * differs from the notes already recorded — re-saving an untouched edit
     * form (which prefills the joined history) never duplicates that history.
     */
    private void applySubmittedNote(Lead lead, String notes) {
        if (notes == null || notes.isBlank()) {
            return;
        }
        String submitted = notes.trim();
        String existing = lead.getNotes().stream()
                .map(Note::getText)
                .filter(text -> text != null && !text.isBlank())
                .collect(Collectors.joining("\n"));
        if (submitted.equals(existing.trim())) {
            return;
        }
        Note note = new Note();
        note.setText(submitted);
        note.setAuthor(currentUserName());
        lead.addNote(note);
        lead.addTimeline(entry("note", "Note added",
                submitted.length() > 120 ? submitted.substring(0, 120) + "..." : submitted));
    }

    public LeadResponse delete(Long id) {
        // Soft delete (trash): the row stays in MySQL with status DELETED and can
        // be restored from the Deleted tab — mirrors the sales-module behavior.
        Lead lead = getLead(id);
        LeadStatus previous = lead.getStatus();
        lead.setStatus(LeadStatus.DELETED);
        lead.setArchivedAt(LocalDateTime.now());
        lead.addTimeline(entry("deleted", "Lead deleted",
                "Lead was moved to trash by " + currentUserName() + "."));
        lead.addHistory(history("Status", label(previous), "Deleted", currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public void permanentDelete(Long id) {
        Lead lead = getLead(id);
        // Hard delete: purge edit-history + revision snapshots so the removed
        // record leaves no orphaned rows behind.
        editHistoryRepository.deleteByModuleTypeAndRecordId("lead", id);
        recordRevisionRepository.deleteByModuleTypeAndRecordId("lead", id);
        leadRepository.delete(lead);
    }

    public LeadResponse archive(Long id) {
        Lead lead = getLead(id);
        LeadStatus previous = lead.getStatus();
        lead.setStatus(LeadStatus.ARCHIVED);
        lead.setArchivedAt(LocalDateTime.now());
        lead.addTimeline(entry("archived", "Lead archived", "Lead was archived by " + currentUserName() + "."));
        lead.addHistory(history("Status", label(previous), "Archived", currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public LeadResponse restore(Long id) {
        Lead lead = getLead(id);
        LeadStatus previous = lead.getStatus();
        lead.setStatus(LeadStatus.ACTIVE);
        lead.setArchivedAt(null);
        lead.addTimeline(entry("restored", "Lead restored", "Lead was restored by " + currentUserName() + "."));
        lead.addHistory(history("Status", label(previous), "Active", currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    /**
     * Closes a lead: it becomes INACTIVE — no longer an active lead — while the
     * record itself, its number, contacts, notes, attachments, follow-ups,
     * timeline/activity log, version history and every linked document are kept.
     *
     * <p>Closing is deliberately NOT the same as the other lifecycle states:
     * it is not archive ({@code ARCHIVED}), not trash ({@code DELETED}), and it
     * never touches the pipeline stage, so a closed lead is not silently marked
     * Won or Lost. The existing INACTIVE state is reused (the stored status
     * column only accepts ACTIVE / INACTIVE / ARCHIVED / DELETED, so no schema
     * change is needed) and is presented as "Closed" by the CRM lead screens.
     *
     * <p>The row is read under a pessimistic lock and an already-closed lead is
     * returned unchanged, so repeated clicks / retries cannot record the close
     * twice or add a second audit entry.
     */
    public LeadResponse close(Long id) {
        Lead lead = leadRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lead not found with id: " + id));
        if (lead.getStatus() == LeadStatus.DELETED) {
            throw new BadRequestException(
                    "A deleted lead cannot be closed — restore it from the Deleted tab first.");
        }
        if (lead.getStatus() == LeadStatus.ARCHIVED) {
            throw new BadRequestException("An archived lead cannot be closed — restore it first.");
        }
        if (lead.getStatus() == LeadStatus.INACTIVE) {
            // Already closed: idempotent, no second timeline/history entry.
            return toResponse(lead);
        }
        LeadStatus previous = lead.getStatus();
        lead.setStatus(LeadStatus.INACTIVE);
        lead.setArchivedAt(null);
        lead.addTimeline(entry("closed", "Lead closed",
                "Lead was closed by " + currentUserName()
                        + " and is no longer available for new follow-ups, CPRs or quotations."));
        lead.addHistory(history("Status", label(previous), CLOSED_STATUS_LABEL, currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    /**
     * Rejects a NEW business document (CPR / quotation) whose lead reference
     * points at a closed lead. Creation-only guard: previously created documents
     * keep working and are never invalidated by closing their lead.
     */
    @Transactional(readOnly = true)
    public void assertLeadReferenceOpen(String leadNo) {
        if (leadNo == null || leadNo.isBlank()) {
            return;
        }
        var matcher = LEAD_NO_PATTERN.matcher(leadNo.trim());
        if (!matcher.matches()) {
            // Not a resolvable lead reference (free-text lead name): leave it alone
            // rather than guessing which lead was meant.
            return;
        }
        long leadId;
        try {
            leadId = Long.parseLong(matcher.group(1));
        } catch (NumberFormatException ignored) {
            return;
        }
        leadRepository.findById(leadId)
                .filter(lead -> lead.getStatus() == LeadStatus.INACTIVE)
                .ifPresent(lead -> {
                    throw new BadRequestException("Lead '" + display(lead.getName()) + "' (" + leadNo.trim()
                            + ") is closed — no new document can be created for it.");
                });
    }

    public LeadResponse markInactive(Long id) {
        Lead lead = getLead(id);
        LeadStatus previous = lead.getStatus();
        if (previous == LeadStatus.INACTIVE) {
            return toResponse(lead);
        }
        lead.setStatus(LeadStatus.INACTIVE);
        lead.setArchivedAt(null);
        lead.addTimeline(entry("status", "Lead marked inactive", "Lead was marked inactive by " + currentUserName() + "."));
        lead.addHistory(history("Status", label(previous), "Inactive", currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public LeadResponse activate(Long id) {
        Lead lead = getLead(id);
        LeadStatus previous = lead.getStatus();
        if (previous == LeadStatus.ACTIVE) {
            return toResponse(lead);
        }
        lead.setStatus(LeadStatus.ACTIVE);
        lead.setArchivedAt(null);
        lead.addTimeline(entry("status", "Lead activated", "Lead was activated by " + currentUserName() + "."));
        lead.addHistory(history("Status", label(previous), "Active", currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Lead lead = getLead(id);
            if (lead.getStatus() != LeadStatus.ARCHIVED) {
                lead.setStatus(LeadStatus.ARCHIVED);
                lead.setArchivedAt(LocalDateTime.now());
                lead.addTimeline(entry("archived", "Lead archived", "Lead was archived by " + currentUserName() + "."));
                leadRepository.save(lead);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Lead lead = getLead(id);
            if (lead.getStatus() != LeadStatus.ACTIVE) {
                lead.setStatus(LeadStatus.ACTIVE);
                lead.setArchivedAt(null);
                lead.addTimeline(entry("restored", "Lead restored", "Lead was restored by " + currentUserName() + "."));
                leadRepository.save(lead);
                count++;
            }
        }
        return count;
    }

    public int bulkDelete(List<Long> ids) {
        // Soft delete for trash parity with the single-delete endpoint.
        int count = 0;
        for (Long id : ids) {
            Lead lead = getLead(id);
            if (lead.getStatus() != LeadStatus.DELETED) {
                LeadStatus previous = lead.getStatus();
                lead.setStatus(LeadStatus.DELETED);
                lead.setArchivedAt(LocalDateTime.now());
                lead.addTimeline(entry("deleted", "Lead deleted",
                        "Lead was moved to trash by " + currentUserName() + "."));
                lead.addHistory(history("Status", label(previous), "Deleted", currentUserName()));
                leadRepository.save(lead);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            permanentDelete(id);
            count++;
        }
        return count;
    }

    public LeadResponse assignOwner(Long id, String owner) {
        Lead lead = getLead(id);
        String previous = lead.getOwner();
        if (owner.equals(previous)) {
            return toResponse(lead);
        }
        lead.setOwner(owner);
        lead.addTimeline(entry("owner", "Owner assigned",
                "Owner changed from '" + display(previous) + "' to '" + owner + "'."));
        lead.addHistory(history("Owner", previous, owner, currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public LeadResponse changeStage(Long id, String stage) {
        Lead lead = getLead(id);
        LeadStage previous = lead.getStage();
        LeadStage next = parseStage(stage);
        if (next == previous) {
            return toResponse(lead);
        }
        lead.setStage(next);
        lead.addTimeline(entry("stage", "Stage changed",
                "Stage changed from '" + label(previous) + "' to '" + label(next) + "'."));
        lead.addHistory(history("Stage", label(previous), label(next), currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public LeadResponse changePriority(Long id, String priority) {
        Lead lead = getLead(id);
        String previous = lead.getPriority();
        String next = normalizePriority(priority);
        if (next.equalsIgnoreCase(previous == null ? "" : previous)) {
            return toResponse(lead);
        }
        lead.setPriority(next);
        lead.addTimeline(entry("priority", "Priority changed",
                "Priority changed from '" + display(previous) + "' to '" + next + "'."));
        lead.addHistory(history("Priority", previous, next, currentUserName()));
        return toResponse(leadRepository.save(lead));
    }

    public LeadResponse duplicate(Long id) {
        Lead source = getLead(id);
        Lead copy = new Lead();
        copy.setName(source.getName() + " (Copy)");
        copy.setCompany(source.getCompany());
        copy.setTitle(source.getTitle());
        copy.setStage(LeadStage.NEW);
        copy.setStatus(LeadStatus.ACTIVE);
        copy.setSource(source.getSource());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setWebsite(source.getWebsite());
        copy.setValue(source.getValue());
        copy.setOwner(source.getOwner());
        copy.setBusinessName(source.getBusinessName());
        copy.setBusinessType(source.getBusinessType());
        copy.setIndustry(source.getIndustry());
        copy.setTaxId(source.getTaxId());
        copy.setSecondaryName(source.getSecondaryName());
        copy.setSecondaryEmail(source.getSecondaryEmail());
        copy.setSecondaryPhone(source.getSecondaryPhone());
        copy.setAddress(source.getAddress());
        copy.setCity(source.getCity());
        copy.setState(source.getState());
        copy.setPincode(source.getPincode());
        copy.setCountry(source.getCountry());
        copy.setInternalNotes(source.getInternalNotes());
        copy.setDescription(source.getDescription());
        copy.setPriority(source.getPriority());
        copy.addTimeline(entry("created", "Lead created", "Duplicated from lead '" + display(source.getName()) + "'."));
        return toResponse(leadRepository.save(copy));
    }

    // ============================== Export / Import ==============================

    @Transactional
    public List<LeadResponse> export(ExportRequest request) {
        Specification<Lead> spec = buildExportSpecification(request);
        return leadRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    public String buildCsv(List<LeadResponse> leads) {
        StringBuilder sb = new StringBuilder();
        sb.append("Name,Company,Email,Phone,Value,Stage,Source,Owner,Status,CreatedAt\n");
        for (LeadResponse l : leads) {
            sb.append(escapeCsv(l.name())).append(',')
              .append(escapeCsv(l.company())).append(',')
              .append(escapeCsv(l.email())).append(',')
              .append(escapeCsv(l.phone())).append(',')
              .append(l.value() == null ? "" : l.value().toPlainString()).append(',')
              .append(escapeCsv(l.stage())).append(',')
              .append(escapeCsv(l.source())).append(',')
              .append(escapeCsv(l.owner())).append(',')
              .append(escapeCsv(l.status())).append(',')
              .append(escapeCsv(l.createdAt())).append('\n');
        }
        return sb.toString();
    }

    public int importLeads(MultipartFile file) {
        String content;
        try {
            // Bounded read: the import is capped so a huge upload cannot inflate
            // the heap to the size of whatever the client sent.
            content = new String(
                    UploadStreams.readBounded(file, importMaxBytes,
                            "Import file is too large — the limit is "
                                    + (importMaxBytes / (1024 * 1024)) + " MB."),
                    java.nio.charset.StandardCharsets.UTF_8);
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Could not read the uploaded file");
        }
        String[] lines = content.split("\\r?\\n");
        int imported = 0;
        int headerOffset = 0;
        if (lines.length > 0 && looksLikeHeader(lines[0])) {
            headerOffset = 1;
        }
        for (int i = headerOffset; i < lines.length && imported < MAX_IMPORT_ROWS; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }
            String[] cols = splitCsvLine(line);
            Lead lead = new Lead();
            lead.setName(trim(col(cols, 0)));
            if (lead.getName() == null || lead.getName().isBlank()) {
                continue;
            }
            lead.setCompany(trim(col(cols, 1)));
            lead.setEmail(trim(col(cols, 2)));
            lead.setPhone(trim(col(cols, 3)));
            lead.setValue(parseNumber(trim(col(cols, 4))));
            lead.setStage(parseStageSafe(trim(col(cols, 5))));
            lead.setSource(trim(col(cols, 6)));
            lead.setOwner(trim(col(cols, 7)));
            lead.setWebsite(trim(col(cols, 8)));
            lead.setCity(trim(col(cols, 9)));
            lead.setState(trim(col(cols, 10)));
            lead.setCountry(trim(col(cols, 11)));
            lead.setAddress(trim(col(cols, 12)));
            lead.addTimeline(entry("imported", "Lead imported", "Lead '" + lead.getName() + "' was imported from a file."));
            // Imported leads carry contact details too — the Contacts module
            // mirrors them exactly like a lead saved through the form (the CSV
            // only supplies the primary contact, so that is all that is created).
            contactService.syncFromLead(leadRepository.save(lead));
            imported++;
        }
        return imported;
    }

    private boolean looksLikeHeader(String line) {
        String lower = line.toLowerCase();
        return lower.contains("name") || lower.contains("company") || lower.contains("email");
    }

    private String[] splitCsvLine(String line) {
        return line.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", -1);
    }

    private String col(String[] cols, int index) {
        if (index >= cols.length) {
            return null;
        }
        String value = cols[index];
        if (value == null) {
            return null;
        }
        value = value.trim();
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1).replace("\"\"", "\"");
        }
        return value;
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private BigDecimal parseNumber(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(value.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String escapeCsv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    // ============================== Sub-resources ==============================

    @Transactional
    public List<TimelineResponse> getTimeline(Long id) {
        return getLead(id).getTimeline().stream().map(this::timelineResponse).toList();
    }

    @Transactional
    public List<ActivityResponse> getActivities(Long id) {
        return getLead(id).getActivities().stream().map(this::activityResponse).toList();
    }

    @Transactional
    public List<NoteResponse> getNotes(Long id) {
        return getLead(id).getNotes().stream().map(this::noteResponse).toList();
    }

    public NoteResponse addNote(Long id, String text) {
        Lead lead = getLead(id);
        Note note = new Note();
        note.setText(text);
        note.setAuthor(currentUserName());
        lead.addNote(note);
        String preview = text.length() > 120 ? text.substring(0, 120) + "..." : text;
        lead.addTimeline(entry("note", "Note added", preview));
        leadRepository.save(lead);
        return noteResponse(note);
    }

    @Transactional
    public List<AttachmentResponse> getAttachments(Long id) {
        return getLead(id).getAttachments().stream().map(this::attachmentResponse).toList();
    }

    public AttachmentResponse addAttachment(Long id, MultipartFile file) {
        Lead lead = getLead(id);
        String storedName = fileStorageService.store(file);
        Attachment attachment = new Attachment();
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        lead.addAttachment(attachment);
        lead.addTimeline(entry("attachment", "File attached", file.getOriginalFilename()));
        leadRepository.save(lead);
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Leads", id,
                lead.getName(), null, null,
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(attachment);
    }

    @Transactional
    public List<HistoryResponse> getHistory(Long id) {
        return getLead(id).getHistory().stream().map(this::historyResponse).toList();
    }

    // ============================== Mapping ==============================

    private LeadResponse toResponse(Lead lead) {
        return new LeadResponse(
                lead.getId(),
                lead.getName(),
                lead.getCompany(),
                lead.getTitle(),
                label(lead.getStage()),
                label(lead.getStatus()),
                lead.getSource(),
                lead.getEmail(),
                lead.getPhone(),
                lead.getWebsite(),
                lead.getValue(),
                lead.getOwner(),
                lead.getBusinessName(),
                lead.getBusinessType(),
                lead.getIndustry(),
                lead.getTaxId(),
                lead.getSecondaryName(),
                lead.getSecondaryEmail(),
                lead.getSecondaryPhone(),
                lead.getAddress(),
                lead.getCity(),
                lead.getState(),
                lead.getPincode(),
                lead.getCountry(),
                lead.getInternalNotes(),
                lead.getDescription(),
                lead.getPan(),
                lead.getPreferredVendor(),
                lead.getProject(),
                lead.getPriority(),
                lead.getCreatedAt() == null ? null : lead.getCreatedAt().toLocalDate().toString(),
                lead.getCreatedAt() == null ? null : lead.getCreatedAt().toString(),
                lead.getUpdatedAt() == null ? null : lead.getUpdatedAt().toString(),
                lead.getArchivedAt() == null ? null : lead.getArchivedAt().toString(),
                lead.getNotes().stream().map(this::noteResponse).toList(),
                lead.getActivities().stream().map(this::activityResponse).toList(),
                lead.getAttachments().stream().map(this::attachmentResponse).toList(),
                lead.getTimeline().stream().map(this::timelineResponse).toList(),
                lead.getHistory().stream().map(this::historyResponse).toList()
        );
    }

    private NoteResponse noteResponse(Note note) {
        return new NoteResponse(note.getId(), note.getText(), note.getAuthor(),
                note.getCreatedAt() == null ? null : note.getCreatedAt().toString());
    }

    private ActivityResponse activityResponse(Activity activity) {
        return new ActivityResponse(activity.getId(), activity.getType(), activity.getTitle(), activity.getDetail(),
                activity.getOwner(), activity.getCreatedAt() == null ? null : activity.getCreatedAt().toString());
    }

    private AttachmentResponse attachmentResponse(Attachment attachment) {
        return new AttachmentResponse(attachment.getId(), attachment.getName(), attachment.getContentType(),
                attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString());
    }

    private TimelineResponse timelineResponse(TimelineEntry entry) {
        return new TimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private HistoryResponse historyResponse(HistoryEntry entry) {
        return new HistoryResponse(entry.getId(), entry.getField(), entry.getOldValue(), entry.getNewValue(),
                entry.getChangedBy(), entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private TimelineEntry entry(String type, String title, String detail) {
        TimelineEntry entry = new TimelineEntry();
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        return entry;
    }

    private Activity activity(String type, String title, String detail, String owner) {
        Activity activity = new Activity();
        activity.setType(type);
        activity.setTitle(title);
        activity.setDetail(detail);
        activity.setOwner(owner);
        return activity;
    }

    private HistoryEntry history(String field, String oldValue, String newValue, String changedBy) {
        HistoryEntry entry = new HistoryEntry();
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        entry.setChangedBy(changedBy);
        return entry;
    }

    // ============================== Helpers ==============================

    private Lead getLead(Long id) {
        return leadRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lead not found with id: " + id));
    }

    /**
     * A closed lead is read-only: editing it would let a closed record be
     * reshaped (or its closed state be worked around) from the edit form or a
     * direct PUT, so the write is refused server-side.
     */
    private void assertNotClosed(Lead lead) {
        if (lead.getStatus() == LeadStatus.INACTIVE) {
            throw new BadRequestException("Lead '" + display(lead.getName())
                    + "' is closed and can no longer be edited.");
        }
    }

    private void applyRequest(Lead lead, LeadRequest request) {
        lead.setName(request.leadName());
        lead.setCompany(request.companyName());
        lead.setTitle(request.designation());
        lead.setEmail(request.email());
        lead.setPhone(request.phone());
        lead.setWebsite(request.website());
        lead.setValue(request.estimatedValue());
        if (request.pipelineStage() != null && !request.pipelineStage().isBlank()) {
            lead.setStage(parseStage(request.pipelineStage()));
        } else if (lead.getStage() == null) {
            lead.setStage(LeadStage.NEW);
        }
        lead.setSource(request.leadSource());
        lead.setOwner(request.assignedTo());
        lead.setBusinessName(request.businessName());
        lead.setBusinessType(request.businessType());
        lead.setIndustry(request.industry());
        lead.setTaxId(request.taxId());
        lead.setSecondaryName(request.secondaryName());
        lead.setSecondaryEmail(request.secondaryEmail());
        lead.setSecondaryPhone(request.secondaryPhone());
        lead.setAddress(request.address());
        lead.setCity(request.city());
        lead.setState(request.state());
        lead.setPincode(request.pincode());
        lead.setCountry(request.country());
        // Centralized Location Master validation: reject impossible
        // Country→State→City combinations (backend-side, not just UI).
        var locationCheck = locationMasterService.validateNames(
                request.country(), request.state(), null, request.city());
        if (!locationCheck.valid()) {
            throw new BadRequestException(locationCheck.message());
        }
        lead.setInternalNotes(request.internalNotes());
        // Preserve an existing description when a caller omits the field, while
        // still allowing the edit form to clear it with an explicit empty value.
        if (request.description() != null) {
            lead.setDescription(request.description().isBlank() ? null : request.description());
        }
        lead.setPan(request.pan());
        lead.setPreferredVendor(request.preferredVendor());
        lead.setProject(request.project());
        if (request.priority() != null && !request.priority().isBlank()) {
            lead.setPriority(normalizePriority(request.priority()));
        } else if (lead.getId() == null) {
            lead.setPriority(null);
        }
    }

    private Specification<Lead> buildSpecification(String search, String stage, String status, String owner,
                                                   String source, String dateFrom, String dateTo,
                                                   BigDecimal minValue, BigDecimal maxValue) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("company")), like),
                        cb.like(cb.lower(root.get("email")), like),
                        cb.like(cb.lower(root.get("phone")), like),
                        cb.like(cb.lower(root.get("owner")), like),
                        cb.like(cb.lower(root.get("city")), like)
                ));
            }
            if (stage != null && !stage.isBlank()) {
                predicates.add(cb.equal(root.get("stage"), parseStage(stage)));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), parseStatus(status)));
            } else {
                // Default (Active) view: trashed leads live in the Deleted tab and
                // closed (INACTIVE) leads in the Closed tab, so neither belongs in
                // the normal active list, its search or its record total. Archived
                // leads keep their existing behavior of being listed here.
                predicates.add(root.get("status").in(List.of(LeadStatus.ACTIVE, LeadStatus.ARCHIVED)));
            }
            if (owner != null && !owner.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("owner")), "%" + owner.trim().toLowerCase() + "%"));
            }
            if (source != null && !source.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("source")), source.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
            }
            if (minValue != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("value"), minValue));
            }
            if (maxValue != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("value"), maxValue));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<Lead> buildExportSpecification(ExportRequest request) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (request != null && request.ids() != null && !request.ids().isEmpty()) {
                predicates.add(root.get("id").in(request.ids()));
            }
            if (request != null && request.stage() != null && !request.stage().isBlank()) {
                predicates.add(cb.equal(root.get("stage"), parseStage(request.stage())));
            }
            if (request != null && request.status() != null && !request.status().isBlank()) {
                predicates.add(cb.equal(root.get("status"), parseStatus(request.status())));
            } else {
                // Exports also default to non-deleted records.
                predicates.add(cb.notEqual(root.get("status"), LeadStatus.DELETED));
            }
            if (request != null && request.search() != null && !request.search().isBlank()) {
                String like = "%" + request.search().trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("company")), like),
                        cb.like(cb.lower(root.get("email")), like),
                        cb.like(cb.lower(root.get("owner")), like)
                ));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "name", "company", "value", "stage", "owner", "source", "status" -> field;
            case "date" -> "createdAt";
            case "createdAt" -> "createdAt";
            case "updatedAt" -> "updatedAt";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    // ERP priority set (ERP/js/leads.js showChangePriorityModal) — stored
    // capitalized exactly as displayed (Low / Medium / High / Urgent).
    private static final List<String> LEAD_PRIORITIES = List.of("Low", "Medium", "High", "Urgent");

    private String normalizePriority(String value) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("Priority is required");
        }
        String trimmed = value.trim();
        for (String candidate : LEAD_PRIORITIES) {
            if (candidate.equalsIgnoreCase(trimmed)) {
                return candidate;
            }
        }
        throw new BadRequestException("Invalid priority: " + value);
    }

    private LeadStage parseStage(String value) {
        try {
            return LeadStage.valueOf(value.trim().toUpperCase().replace(' ', '_'));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid stage: " + value);
        }
    }

    private LeadStage parseStageSafe(String value) {
        try {
            return LeadStage.valueOf(value.trim().toUpperCase().replace(' ', '_'));
        } catch (IllegalArgumentException | NullPointerException e) {
            return LeadStage.NEW;
        }
    }

    private LeadStatus parseStatus(String value) {
        try {
            return LeadStatus.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + value);
        }
    }

    private String label(Enum<?> value) {
        if (value == null) {
            return null;
        }
        // "PROPOSAL_SENT" -> "Proposal Sent" (multi-word enum names word-capitalized).
        String name = value.name().toLowerCase().replace('_', ' ');
        StringBuilder sb = new StringBuilder(name.length());
        boolean capitalize = true;
        for (char c : name.toCharArray()) {
            if (c == ' ') {
                sb.append(c);
                capitalize = true;
            } else {
                sb.append(capitalize ? Character.toUpperCase(c) : c);
                capitalize = false;
            }
        }
        return sb.toString();
    }

    private String display(String value) {
        return value == null ? "" : value;
    }

    private String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }
}
