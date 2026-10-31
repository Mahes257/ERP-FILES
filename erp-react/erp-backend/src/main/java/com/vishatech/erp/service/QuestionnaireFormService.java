package com.vishatech.erp.service;

import com.vishatech.erp.dto.QuestionnaireFormListResponse;
import com.vishatech.erp.dto.QuestionnaireFormRequest;
import com.vishatech.erp.dto.QuestionnaireFormResponse;
import com.vishatech.erp.entity.MarketingVisit;
import com.vishatech.erp.entity.PlantContact;
import com.vishatech.erp.entity.PlantOemDetail;
import com.vishatech.erp.entity.QuestionnaireForm;
import com.vishatech.erp.entity.QFormAttachment;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.MarketingVisitRepository;
import com.vishatech.erp.repository.MarketingTravelPlanRepository;
import com.vishatech.erp.repository.PlantContactRepository;
import com.vishatech.erp.repository.PlantOemDetailRepository;
import com.vishatech.erp.repository.QuestionnaireFormRepository;
import com.vishatech.erp.repository.QFormAttachmentRepository;
import com.vishatech.erp.util.AuditContext;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Offline Marketing Questionnaire Form service.  Handles the full lifecycle:
 * create → draft → submit, plus read/update/list/search operations.
 *
 * <p>Each Q Form belongs to exactly one Marketing Visit.  A visit may have at
 * most one Q Form (enforced by the unique visitId lookup).  The form carries
 * structured data across child tables (OEM details, part list, plant contacts)
 * and narrative sections on the main entity.
 */
@Service
@Transactional
public class QuestionnaireFormService {

    private static final List<String> QFORM_STATUSES =
            List.of("Not Prepared", "Draft", "Filled & Submitted");



    private final QuestionnaireFormRepository formRepository;
    private final PlantOemDetailRepository oemDetailRepository;
    private final PlantContactRepository plantContactRepository;
    private final QFormAttachmentRepository attachmentRepository;
    private final MarketingVisitRepository visitRepository;
    private final MarketingTravelPlanRepository travelPlanRepository;
    private final AuditContext auditContext;

    public QuestionnaireFormService(QuestionnaireFormRepository formRepository,
                                     PlantOemDetailRepository oemDetailRepository,
                                     PlantContactRepository plantContactRepository,
                                     QFormAttachmentRepository attachmentRepository,
                                     MarketingVisitRepository visitRepository,
                                     MarketingTravelPlanRepository travelPlanRepository,
                                     AuditContext auditContext) {
        this.formRepository = formRepository;
        this.oemDetailRepository = oemDetailRepository;
        this.plantContactRepository = plantContactRepository;
        this.attachmentRepository = attachmentRepository;
        this.visitRepository = visitRepository;
        this.travelPlanRepository = travelPlanRepository;
        this.auditContext = auditContext;
    }

    // ============================== CRUD ====================================

    /**
     * Create a new Q Form.  If visitId is provided, links to that visit
     * (one Q Form per visit).  If visitId is null, creates a standalone Q Form.
     */
    @Transactional
    public QuestionnaireFormResponse create(QuestionnaireFormRequest request) {
        User user = requireUser();
        MarketingVisit visit = null;
        if (request.visitId() != null) {
            visit = findVisit(request.visitId());
            assertCanAccessVisit(visit);
            // One real Q Form per visit. Legacy standalone rows used userId as a
            // NOT NULL visit_id fallback and left plant_name null — those must
            // not block creating the visit's actual form.
            QuestionnaireForm existing = formRepository.findByVisitIdOrderByIdAsc(visit.getId()).stream()
                    .filter(f -> f.getPlantName() != null && !f.getPlantName().isBlank())
                    .reduce((a, b) -> b)
                    .orElse(null);
            if (existing != null) {
                return toResponse(existing, visit);
            }
        }

        QuestionnaireForm form = new QuestionnaireForm();
        // DB column visit_id is NOT NULL — use a negative userId sentinel for
        // standalone Q Forms so they never collide with a real visit id.
        form.setVisitId(request.visitId() != null ? request.visitId() : -user.getId());
        form.setMarketerUserId(user.getId());
        form.setMarketer(visit != null ? visit.getMarketer() : (user.getFullName() != null && !user.getFullName().isBlank() ? user.getFullName() : user.getEmail()));
        form.setStatus("Not Prepared");
        form.setTravelPlanId(request.travelPlanId());

        // Pre-populate from visit if linked
        if (visit != null && visit.getScheduleDate() != null) {
            form.setDateOfVisit(visit.getScheduleDate());
        }
        if (visit != null && visit.getCompanyName() != null) {
            form.setPlantName(visit.getCompanyName());
        }
        if (visit != null && visit.getLocation() != null) {
            form.setPlantLocation(visit.getLocation());
        }

        applyBasicFields(form, request);

        QuestionnaireForm saved = formRepository.save(form);

        // Save child data
        saveChildData(saved.getId(), request);

        return toResponse(saved, visit);
    }

    /**
     * Get a Q Form by ID.
     */
    public QuestionnaireFormResponse get(Long id) {
        QuestionnaireForm form = findForm(id);
        MarketingVisit visit = null;
        if (form.getVisitId() != null) {
            visit = visitRepository.findById(form.getVisitId()).orElse(null);
        }
        if (visit != null) assertCanAccessVisit(visit);
        return toResponse(form, resolveVisit(form));
    }

    /**
     * Get the Q Form for a specific visit (returns null if none exists).
     */
    public QuestionnaireFormResponse getByVisitId(Long visitId) {
        MarketingVisit visit = findVisit(visitId);
        assertCanAccessVisit(visit);
        QuestionnaireForm form = formRepository.findByVisitIdOrderByIdAsc(visitId).stream()
                .filter(f -> f.getPlantName() != null && !f.getPlantName().isBlank())
                .reduce((a, b) -> b)
                .orElseGet(() -> formRepository.findFirstByVisitIdOrderByIdDesc(visitId).orElse(null));
        if (form == null) {
            return null;
        }
        return toResponse(form, resolveVisit(form));
    }

    /**
     * Update an existing Q Form (draft or not-yet-submitted).
     */
    @Transactional
    public QuestionnaireFormResponse update(Long id, QuestionnaireFormRequest request) {
        QuestionnaireForm form = findForm(id);
        assertCanAccessForm(form);

        if ("Filled & Submitted".equals(form.getStatus())) {
            throw new BadRequestException("A submitted Q Form cannot be edited. Create a new visit or contact an administrator.");
        }

        applyBasicFields(form, request);
        formRepository.save(form);

        // Replace child data
        replaceChildData(form.getId(), request);

        return toResponse(form, resolveVisit(form));
    }

    /**
     * Save as Draft — saves all data and sets status to "Draft".
     */
    @Transactional
    public QuestionnaireFormResponse saveDraft(Long id, QuestionnaireFormRequest request) {
        QuestionnaireForm form = findForm(id);
        assertCanAccessForm(form);

        if ("Filled & Submitted".equals(form.getStatus())) {
            throw new BadRequestException("A submitted Q Form cannot be edited");
        }

        applyBasicFields(form, request);
        form.setStatus("Draft");
        formRepository.save(form);

        replaceChildData(form.getId(), request);

        return toResponse(form, resolveVisit(form));
    }

    /**
     * Submit — saves all data, sets status to "Filled & Submitted", and
     * updates the parent visit's qFormStatus.
     */
    @Transactional
    public QuestionnaireFormResponse submit(Long id, QuestionnaireFormRequest request) {
        QuestionnaireForm form = findForm(id);
        assertCanAccessForm(form);

        if ("Filled & Submitted".equals(form.getStatus())) {
            throw new BadRequestException("This Q Form has already been submitted");
        }

        applyBasicFields(form, request);
        form.setStatus("Filled & Submitted");
        form.setSubmittedAt(LocalDateTime.now());
        formRepository.save(form);

        replaceChildData(form.getId(), request);

        // Update parent visit if linked
        MarketingVisit visit = resolveVisit(form);
        if (visit != null) {
            visit.setQFormStatus("Filled & Submitted");
            visit.setQFormSubmittedAt(LocalDateTime.now());
            visitRepository.save(visit);
        }

        return toResponse(form, resolveVisit(form));
    }

    // ============================== List & Search ============================

    /**
     * List Q Forms with filtering, search, pagination, and sorting.
     */
    public Page<QuestionnaireFormListResponse> list(int page, int size, String search, String sort,
                                                     String status, String marketer,
                                                     String dateFrom, String dateTo,
                                                     String location) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort, "createdAt"));

        Specification<QuestionnaireForm> spec = buildSpecification(search, status, marketer, dateFrom, dateTo)
                .and(scopeSpecification());

        return formRepository.findAll(spec, pageable).map(f -> toListResponse(f));
    }

    // ============================== Signatures ===============================

    /**
     * Update only the marketing lead signature (binary data).
     */
    @Transactional
    public QuestionnaireFormResponse saveMarketingLeadSignature(Long id, String base64Data) {
        QuestionnaireForm form = findForm(id);
        assertCanAccessForm(form);

        if (base64Data != null && !base64Data.isBlank()) {
            form.setMarketingLeadSignature(Base64.getDecoder().decode(base64Data));
        } else {
            form.setMarketingLeadSignature(null);
        }
        formRepository.save(form);
        return toResponse(form, resolveVisit(form));
    }

    /**
     * Update only the authority signature (binary data).
     */
    @Transactional
    public QuestionnaireFormResponse saveAuthoritySignature(Long id, String base64Data) {
        QuestionnaireForm form = findForm(id);
        assertCanAccessForm(form);

        if (base64Data != null && !base64Data.isBlank()) {
            form.setAuthoritySignature(Base64.getDecoder().decode(base64Data));
        } else {
            form.setAuthoritySignature(null);
        }
        formRepository.save(form);
        return toResponse(form, resolveVisit(form));
    }

    // ============================== Delete ===================================

    /**
     * Soft-delete a Q Form (project convention: records are flagged, not
     * destroyed).  Child data is removed; the parent visit's Q Form status is
     * reset to "Not Prepared".
     */
    @Transactional
    public void delete(Long id) {
        QuestionnaireForm form = findForm(id);
        assertCanAccessForm(form);

        if ("Filled & Submitted".equals(form.getStatus())) {
            throw new BadRequestException("A submitted Q Form cannot be deleted");
        }

        oemDetailRepository.deleteByFormId(form.getId());
        plantContactRepository.deleteByFormId(form.getId());
        attachmentRepository.deleteByFormId(form.getId());
        form.setDeleted(true);
        formRepository.save(form);

        // Reset parent visit if linked
        MarketingVisit visit = resolveVisit(form);
        if (visit != null) {
            visit.setQFormStatus("Not Prepared");
            visitRepository.save(visit);
        }
    }

    // ============================== Helpers =================================

    private void applyBasicFields(QuestionnaireForm form, QuestionnaireFormRequest request) {
        form.setTravelPlanId(request.travelPlanId());
        if (request.dateOfVisit() != null) form.setDateOfVisit(request.dateOfVisit());
        if (request.plantName() != null) form.setPlantName(request.plantName().trim());
        if (request.plantLocation() != null) form.setPlantLocation(request.plantLocation().trim());
        if (request.activeLines() != null) form.setActiveLines(request.activeLines());
        if (request.shutdownPeriod() != null) form.setShutdownPeriod(request.shutdownPeriod().trim());
        if (request.productionPerDay() != null) form.setProductionPerDay(request.productionPerDay().trim());
        if (request.approximatePrDate() != null) form.setApproximatePrDate(request.approximatePrDate().trim());
        if (request.basicRemarks() != null) form.setBasicRemarks(request.basicRemarks());
        if (request.limestoneCrusherDetails() != null) form.setLimestoneCrusherDetails(request.limestoneCrusherDetails());
        if (request.bossCommand() != null) form.setBossCommand(request.bossCommand());

        // Signatures
        if (request.marketingLeadSignatureBase64() != null && !request.marketingLeadSignatureBase64().isBlank()) {
            form.setMarketingLeadSignature(Base64.getDecoder().decode(request.marketingLeadSignatureBase64()));
        }
        if (request.authoritySignatureBase64() != null && !request.authoritySignatureBase64().isBlank()) {
            form.setAuthoritySignature(Base64.getDecoder().decode(request.authoritySignatureBase64()));
        }
    }

    /** Save child data on initial creation. */
    private void saveChildData(Long formId, QuestionnaireFormRequest request) {
        // OEM details (sections 3, 4, 5, 6, 8)
        saveOemDetails(formId, request.plantOemDetails());
        saveOemDetails(formId, request.vrmOemDetails());
        saveOemDetails(formId, request.cementMillOemDetails());
        saveOemDetails(formId, request.clinkerCrusherDetails());
        saveOemDetails(formId, request.packingPlantOemDetails());

        // Plant contacts (section 9)
        savePlantContacts(formId, request.plantContacts());
    }

    /** Delete and re-insert child data on update. */
    private void replaceChildData(Long formId, QuestionnaireFormRequest request) {
        oemDetailRepository.deleteByFormId(formId);
        plantContactRepository.deleteByFormId(formId);
        saveChildData(formId, request);
    }

    private void saveOemDetails(Long formId, List<QuestionnaireFormRequest.OemDetailDto> dtos) {
        if (dtos == null) return;
        int order = 0;
        for (QuestionnaireFormRequest.OemDetailDto dto : dtos) {
            PlantOemDetail entity = new PlantOemDetail();
            entity.setFormId(formId);
            entity.setSection(dto.section());
            entity.setMachine(dto.machine());
            entity.setIkn(dto.ikn());
            entity.setFlSmith(dto.flSmith());
            entity.setPolysius(dto.polysius());
            entity.setKhd(dto.khd());
            entity.setClaudiusPeters(dto.claudiusPeters());
            entity.setSinoma(dto.sinoma());
            entity.setLoesche(dto.loesche());
            entity.setGebrPfeiffer(dto.gebrPfeiffer());
            entity.setPfeiffer(dto.pfeiffer());
            entity.setPfeifferPartNumber(dto.pfeifferPartNumber());
            entity.setAtox(dto.atox());
            entity.setChristianPfeiffer(dto.christianPfeiffer());
            entity.setVega(dto.vega());
            entity.setMegatoux(dto.megatoux());
            entity.setRollerIkn(dto.rollerIkn());
            entity.setRollerFlSmith(dto.rollerFlSmith());
            entity.setHammerImpact(dto.hammerImpact());
            entity.setVendomatic(dto.vendomatic());
            entity.setBuemer(dto.buemer());
            entity.setHaverBooker(dto.haverBooker());
            entity.setChina(dto.china());
            entity.setPackingOemOther(dto.packingOemOther());
            entity.setSortOrder(dto.sortOrder() != null ? dto.sortOrder() : order);
            oemDetailRepository.save(entity);
            order++;
        }
    }



    private void savePlantContacts(Long formId, List<QuestionnaireFormRequest.PlantContactDto> dtos) {
        if (dtos == null) return;
        int order = 0;
        for (QuestionnaireFormRequest.PlantContactDto dto : dtos) {
            PlantContact contact = new PlantContact();
            contact.setFormId(formId);
            contact.setDepartment(dto.department());
            contact.setPersonInCharge(dto.personInCharge());
            contact.setMobile(dto.mobile());
            contact.setMailId(dto.mailId());
            contact.setSortOrder(dto.sortOrder() != null ? dto.sortOrder() : order);
            plantContactRepository.save(contact);
            order++;
        }
    }

    // ---- Finders ----

    private QuestionnaireForm findForm(Long id) {
        QuestionnaireForm form = formRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire Form not found with id: " + id));
        if (form.isDeleted()) {
            throw new ResourceNotFoundException("Questionnaire Form not found with id: " + id);
        }
        return form;
    }

    private MarketingVisit findVisit(Long id) {
        if (id == null) return null;
        return visitRepository.findById(id).orElse(null);
    }

    /** Safely resolve the visit for a Q Form — returns null for standalone forms. */
    private MarketingVisit resolveVisit(QuestionnaireForm form) {
        if (form.getVisitId() == null) return null;
        return visitRepository.findById(form.getVisitId()).orElse(null);
    }

    private User requireUser() {
        User user = auditContext.currentUser();
        if (user == null) {
            throw new AccessDeniedException("Authentication required");
        }
        return user;
    }

    // ---- Access control ----

    /** Access check that works for both standalone and visit-linked Q Forms. */
    private void assertCanAccessForm(QuestionnaireForm form) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return;
        if (form.getMarketerUserId() != null && form.getMarketerUserId().equals(user.getId())) return;
        // Fallback: check via visit
        MarketingVisit visit = resolveVisit(form);
        if (visit != null && visit.getMarketerUserId() != null && visit.getMarketerUserId().equals(user.getId())) return;
        throw new AccessDeniedException("You do not have access to this Q Form");
    }

    private void assertCanAccessVisit(MarketingVisit visit) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
            return;
        }
        if (visit.getMarketerUserId() == null || !visit.getMarketerUserId().equals(user.getId())) {
            throw new AccessDeniedException("You can only access your own marketing visits");
        }
    }

    private boolean isAccessible(QuestionnaireForm form) {
        User user = auditContext.currentUser();
        if (user == null) return false;
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return true;
        return form.getMarketerUserId() != null && form.getMarketerUserId().equals(user.getId());
    }

    // ---- Number generation ----

    private String formNo(Long id, LocalDateTime createdAt) {
        if (id == null) return "QF-";
        int year = createdAt == null ? Year.now().getValue() : createdAt.getYear();
        return "QF-" + year + "-" + String.format("%04d", id);
    }

    private String visitNo(MarketingVisit v) {
        if (v == null || v.getId() == null) return "VST-";
        int year = v.getCreatedAt() == null ? LocalDate.now().getYear() : v.getCreatedAt().getYear();
        return "VST-" + year + "-" + String.format("%03d", v.getId());
    }

    private String travelPlanNo(Long travelPlanId) {
        if (travelPlanId == null) return null;
        return travelPlanRepository.findById(travelPlanId)
                .map(p -> {
                    if (p.getCreatedAt() == null) return "TP-" + travelPlanId;
                    return "TP-" + p.getCreatedAt().getYear() + "-" + String.format("%04d", p.getId());
                })
                .orElse(null);
    }

    // ---- Specification builder ----

    private Specification<QuestionnaireForm> buildSpecification(String search, String status,
                                                                 String marketer, String dateFrom,
                                                                 String dateTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("deleted"), false));

            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.toString(root.get("id"))), like),
                        cb.like(cb.lower(root.get("plantName")), like),
                        cb.like(cb.lower(root.get("plantLocation")), like),
                        cb.like(cb.lower(root.get("marketer")), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (marketer != null && !marketer.isBlank()) {
                predicates.add(cb.equal(root.get("marketer"), marketer));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dateOfVisit"), LocalDate.parse(dateFrom)));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dateOfVisit"), LocalDate.parse(dateTo)));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<QuestionnaireForm> scopeSpecification() {
        return (root, query, cb) -> {
            User user = auditContext.currentUser();
            if (user == null) return cb.disjunction();
            if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return cb.conjunction();
            return cb.equal(root.get("marketerUserId"), user.getId());
        };
    }

    private Sort buildSort(String sort, String defaultField) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, defaultField);
        }
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "formNo", "dateOfVisit", "plantName", "companyName", "customerName",
                 "marketer", "location", "status", "createdAt", "updatedAt" -> field;
            default -> defaultField;
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    // ---- Mapping ----

    private QuestionnaireFormListResponse toListResponse(QuestionnaireForm form) {
        // Visit info is denormalised on the list row
        MarketingVisit visit = visitRepository.findById(form.getVisitId()).orElse(null);
        return new QuestionnaireFormListResponse(
                form.getId(),
                formNo(form.getId(), form.getCreatedAt()),
                form.getVisitId(),
                visit != null ? visitNo(visit) : null,
                form.getDateOfVisit(),
                form.getPlantName(),
                visit != null ? visit.getCompanyName() : null,
                visit != null ? visit.getCustomerName() : null,
                form.getMarketer(),
                form.getPlantLocation(),
                form.getStatus(),
                form.getTravelPlanId(),
                travelPlanNo(form.getTravelPlanId()),
                form.getCreatedAt(),
                form.getUpdatedAt()
        );
    }

    private QuestionnaireFormResponse toResponse(QuestionnaireForm form, MarketingVisit visit) {
        List<PlantOemDetail> allOem = oemDetailRepository.findByFormIdOrderBySortOrderAscIdAsc(form.getId());
        List<PlantContact> contacts = plantContactRepository.findByFormIdOrderBySortOrderAscIdAsc(form.getId());
        List<QFormAttachment> attachments = attachmentRepository.findByFormIdOrderByUploadedAtDesc(form.getId());

        return new QuestionnaireFormResponse(
                form.getId(),
                formNo(form.getId(), form.getCreatedAt()),
                form.getVisitId(),
                visitNo(visit),
                form.getMarketer(),
                form.getStatus(),
                form.getTravelPlanId(),
                travelPlanNo(form.getTravelPlanId()),
                form.getDateOfVisit(),
                form.getPlantName(),
                form.getPlantLocation(),
                form.getActiveLines(),
                form.getShutdownPeriod(),
                form.getProductionPerDay(),
                form.getApproximatePrDate(),
                form.getBasicRemarks(),
                filterOem(allOem, "PLANT_OEM"),
                filterOem(allOem, "VRM_OEM"),
                filterOem(allOem, "CEMENT_MILL_OEM"),
                filterOem(allOem, "CLINKER_CRUSHER"),
                form.getLimestoneCrusherDetails(),
                filterOem(allOem, "PACKING_PLANT_OEM"),
                contacts.stream().map(this::toContactDto).toList(),
                form.getBossCommand(),
                form.getMarketingLeadSignature() != null
                        ? Base64.getEncoder().encodeToString(form.getMarketingLeadSignature()) : null,
                form.getAuthoritySignature() != null
                        ? Base64.getEncoder().encodeToString(form.getAuthoritySignature()) : null,
                attachments.stream().map(this::toAttachmentDto).toList(),
                form.getCreatedAt(),
                form.getUpdatedAt(),
                form.getSubmittedAt(),
                visit != null ? visit.getCompanyName() : null,
                visit != null ? visit.getCustomerName() : null,
                visit != null ? visit.getContactPerson() : null,
                visit != null ? visit.getLocation() : null
        );
    }

    private List<QuestionnaireFormResponse.OemDetailDto> filterOem(List<PlantOemDetail> all, String section) {
        return all.stream()
                .filter(o -> section.equals(o.getSection()))
                .map(this::toOemDto)
                .toList();
    }

    private QuestionnaireFormResponse.OemDetailDto toOemDto(PlantOemDetail o) {
        return new QuestionnaireFormResponse.OemDetailDto(
                o.getId(), o.getSection(), o.getMachine(),
                o.getIkn(), o.getFlSmith(), o.getPolysius(), o.getKhd(),
                o.getClaudiusPeters(), o.getSinoma(),
                o.getLoesche(), o.getGebrPfeiffer(), o.getPfeiffer(),
                o.getPfeifferPartNumber(), o.getAtox(),
                o.getChristianPfeiffer(), o.getVega(), o.getMegatoux(),
                o.getRollerIkn(), o.getRollerFlSmith(), o.getHammerImpact(),
                o.getVendomatic(), o.getBuemer(), o.getHaverBooker(),
                o.getChina(), o.getPackingOemOther(),
                o.getSortOrder()
        );
    }



    private QuestionnaireFormResponse.PlantContactDto toContactDto(PlantContact c) {
        return new QuestionnaireFormResponse.PlantContactDto(
                c.getId(), c.getDepartment(), c.getPersonInCharge(),
                c.getMobile(), c.getMailId(), c.getSortOrder()
        );
    }

    private QuestionnaireFormResponse.AttachmentDto toAttachmentDto(QFormAttachment a) {
        return new QuestionnaireFormResponse.AttachmentDto(
                a.getId(), a.getName(), a.getStoredName(),
                a.getContentType(), a.getSize(), a.getLabel(), a.getUploadedAt()
        );
    }
}
