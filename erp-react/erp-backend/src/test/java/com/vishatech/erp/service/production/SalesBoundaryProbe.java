package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.service.QuotationService;
import com.vishatech.erp.service.SalesOrderService;
import java.util.List;

/**
 * Test-only probe: the Production → Sales dependencies the P4 freeze used to excuse,
 * deliberately re-introduced so the guard can prove it still catches them.
 *
 * <p>P4 froze three offenders; P5, P6 and P7 migrated every one of them onto a published
 * Sales port, and the freeze was deleted. A guard whose freeze disappears is only credible
 * if it is shown to fail when the offending shape comes back — so this class is that shape:
 * a production service (same package as the real ones, and a name a
 * {@code haveSimpleNameStartingWith("Production")} scope would have skipped) that injects
 * Sales persistence, reads a Sales entity, returns a Sales DTO, calls a Sales service
 * implementation and touches a Sales document chain — while also depending on the
 * published {@code AttachmentStorePort}, which stays legal.
 *
 * <p><b>Inert by construction.</b> No Spring annotation, no component scan, never
 * instantiated, and excluded from every production-wide ArchUnit import
 * ({@code ImportOption.DoNotIncludeTests}). It exists in {@code src/test/java} only, so no
 * class file of it ever reaches the application jar.
 */
public final class SalesBoundaryProbe {

    private final SalesOrderRepository salesOrderRepository;
    private final SalesAttachmentRepository salesAttachmentRepository;
    private final SalesOrderService salesOrderService;
    private final QuotationService quotationService;
    private final AttachmentStorePort attachmentStore;

    public SalesBoundaryProbe(SalesOrderRepository salesOrderRepository,
                              SalesAttachmentRepository salesAttachmentRepository,
                              SalesOrderService salesOrderService,
                              QuotationService quotationService,
                              AttachmentStorePort attachmentStore) {
        this.salesOrderRepository = salesOrderRepository;
        this.salesAttachmentRepository = salesAttachmentRepository;
        this.salesOrderService = salesOrderService;
        this.quotationService = quotationService;
        this.attachmentStore = attachmentStore;
    }

    /** Sales entity + repository: the CPO lookup P6 removed. */
    SalesOrder findCpo(Long id) {
        return salesOrderRepository.findById(id).orElse(null);
    }

    /** Sales entity + repository: the attachment write/delete P5 removed. */
    List<SalesAttachment> attachments(String moduleType, Long moduleId) {
        return salesAttachmentRepository
                .findByModuleTypeAndModuleIdOrderByUploadedAtAsc(moduleType, moduleId);
    }

    /** Sales DTO + service implementation, i.e. Sales internals rather than a port. */
    SalesAttachmentResponse firstAttachment(Long salesOrderId) {
        return salesOrderService.getAttachments(salesOrderId).stream().findFirst().orElse(null);
    }

    /** A Sales document-chain service: Sales-owned even though it is not named Sales*. */
    Object quotationStats() {
        return quotationService.stats();
    }

    /** The legal dependency: the published port (never reported by the rule). */
    List<AttachmentStorePort.AttachmentRef> publishedContract(String moduleType, Long moduleId) {
        return attachmentStore.list(moduleType, moduleId);
    }
}
