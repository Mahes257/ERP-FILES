package com.vishatech.erp.service;

import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Sales-owned adapter behind {@link AttachmentStorePort}.
 *
 * <p>Mechanical delegation: each method performs exactly the call the Production
 * attachment service used to make itself — the same repository methods, the same
 * entity fields, the same {@code url} construction, the same
 * {@code ResourceNotFoundException} on a mismatched or unknown id, the same
 * ordering. No SQL, no schema and no route changes.
 *
 * <p>Lives in the flat Sales implementation package on purpose: the published
 * surface is {@code com.vishatech.erp.sales.api} only, so a consuming module can
 * depend on the port but never on this class.
 *
 * <p>The {@code app.base-url} property is read here, where the URL is built, so
 * callers no longer pass it through — the produced URL is identical because it is
 * the same property with the same default.
 */
@Service
public class SalesAttachmentStoreAdapter implements AttachmentStorePort {

    private final SalesAttachmentRepository attachmentRepository;
    private final FileStorageService fileStorageService;
    private final String baseUrl;

    public SalesAttachmentStoreAdapter(
            SalesAttachmentRepository attachmentRepository,
            FileStorageService fileStorageService,
            @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.attachmentRepository = attachmentRepository;
        this.fileStorageService = fileStorageService;
        this.baseUrl = baseUrl;
    }

    /** {@inheritDoc} */
    @Override
    @Transactional(readOnly = true)
    public List<AttachmentRef> list(String moduleType, Long moduleId) {
        return attachmentRepository
                .findByModuleTypeAndModuleIdOrderByUploadedAtAsc(moduleType, moduleId)
                .stream()
                .map(SalesAttachmentStoreAdapter::toRef)
                .toList();
    }

    /** {@inheritDoc} */
    @Override
    @Transactional
    public AttachmentRef add(String moduleType, Long moduleId, MultipartFile file) {
        String storedName = fileStorageService.store(file);
        SalesAttachment attachment = new SalesAttachment();
        attachment.setModuleType(moduleType);
        attachment.setModuleId(moduleId);
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        return toRef(attachmentRepository.save(attachment));
    }

    /** {@inheritDoc} */
    @Override
    @Transactional
    public void delete(String moduleType, Long moduleId, Long attachmentId) {
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> moduleType.equals(a.getModuleType()) && moduleId.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    /** The published contract view of a stored row — same fields, same values. */
    private static AttachmentRef toRef(SalesAttachment a) {
        return new AttachmentRef(
                a.getId(),
                a.getName(),
                a.getContentType(),
                a.getSize(),
                a.getUrl(),
                a.getUploadedAt() != null ? a.getUploadedAt().toString() : null);
    }
}
