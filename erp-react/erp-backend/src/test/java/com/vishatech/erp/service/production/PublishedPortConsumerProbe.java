package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.sales.api.AttachmentStorePort.AttachmentRef;
import com.vishatech.erp.sales.api.SalesOrderLookupPort;
import com.vishatech.erp.sales.api.SalesOrderLookupPort.SalesOrderRef;
import com.vishatech.erp.service.FileStorageService;
import com.vishatech.erp.util.AuditContext;
import java.util.List;
import java.util.Optional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Test-only probe: what a production service <em>is</em> allowed to depend on.
 *
 * <p>The other half of the P5/P6/P7 proof. Removing a freeze is only safe if the contracts
 * the migration introduced stay legal, so this class depends on the published Sales ports
 * — {@code AttachmentStorePort} and {@code SalesOrderLookupPort} — on the neutral contracts
 * those ports publish as nested types ({@code AttachmentRef}, {@code SalesOrderRef}), and
 * on shared platform types (file storage, the audit context, the API envelope). The
 * Production → Sales rule must report none of it.
 *
 * <p><b>Inert by construction</b>: no Spring annotation, never instantiated, and only ever
 * imported explicitly by {@code ProductionSalesBoundaryTests}.
 */
public final class PublishedPortConsumerProbe {

    private final AttachmentStorePort attachmentStore;
    private final SalesOrderLookupPort salesOrderLookup;
    private final FileStorageService fileStorageService;
    private final AuditContext auditContext;
    private final ApiResponse<String> envelope;

    public PublishedPortConsumerProbe(AttachmentStorePort attachmentStore,
                                      SalesOrderLookupPort salesOrderLookup,
                                      FileStorageService fileStorageService,
                                      AuditContext auditContext,
                                      ApiResponse<String> envelope) {
        this.attachmentStore = attachmentStore;
        this.salesOrderLookup = salesOrderLookup;
        this.fileStorageService = fileStorageService;
        this.auditContext = auditContext;
        this.envelope = envelope;
    }

    List<AttachmentRef> attachments(String moduleType, Long moduleId) {
        return attachmentStore.list(moduleType, moduleId);
    }

    Optional<SalesOrderRef> cpo(Long id) {
        return salesOrderLookup.findById(id);
    }

    String storedFile(MultipartFile file) {
        return fileStorageService.store(file);
    }

    String actor() {
        return auditContext.currentUserName();
    }

    ApiResponse<String> envelope() {
        return envelope;
    }
}
