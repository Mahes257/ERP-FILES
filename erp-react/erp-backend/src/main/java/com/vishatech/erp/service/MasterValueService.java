package com.vishatech.erp.service;

import com.vishatech.erp.dto.MasterValueResponse;
import com.vishatech.erp.entity.MasterValue;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.CostWorkoutRepository;
import com.vishatech.erp.repository.CprItemRepository;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.DeliveryChallanRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.MasterValueRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.ProformaInvoiceRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.util.MasterDataCache;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRUD for generic master lists (departments, priorities, requested-by names,
 * UOMs, cost-workout preparers, payment terms, currencies, etc.). Every value
 * is persisted in the {@code master_values} table. Delete is blocked while the
 * value is referenced by any CPR / Cost Workout / Sales Execution document so
 * no orphan references can appear.
 *
 * <p>The list method is cached via {@link MasterDataCache} so that the same
 * master key is read from the database at most once per cache TTL window.
 * Create / update / delete evict the cached list for the affected key so that
 * subsequent reads always return fresh data.
 */
@Service
public class MasterValueService {

    private final MasterValueRepository masterValueRepository;
    private final CustomerRepository customerRepository;
    private final CprRepository cprRepository;
    private final CprItemRepository cprItemRepository;
    private final CostWorkoutRepository costWorkoutRepository;
    private final QuotationRepository quotationRepository;
    private final SalesContractRepository salesContractRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final DeliveryChallanRepository deliveryChallanRepository;
    private final InvoiceRepository invoiceRepository;
    private final ProformaInvoiceRepository proformaInvoiceRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final MasterDataCache cache;

    public MasterValueService(MasterValueRepository masterValueRepository,
                              CustomerRepository customerRepository,
                              CprRepository cprRepository,
                              CprItemRepository cprItemRepository,
                              CostWorkoutRepository costWorkoutRepository,
                              QuotationRepository quotationRepository,
                              SalesContractRepository salesContractRepository,
                              SalesOrderRepository salesOrderRepository,
                              DeliveryChallanRepository deliveryChallanRepository,
                              InvoiceRepository invoiceRepository,
                              ProformaInvoiceRepository proformaInvoiceRepository,
                              PaymentReceiptRepository paymentReceiptRepository,
                              CreditNoteRepository creditNoteRepository,
                              MasterDataCache cache) {
        this.masterValueRepository = masterValueRepository;
        this.customerRepository = customerRepository;
        this.cprRepository = cprRepository;
        this.cprItemRepository = cprItemRepository;
        this.costWorkoutRepository = costWorkoutRepository;
        this.quotationRepository = quotationRepository;
        this.salesContractRepository = salesContractRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.deliveryChallanRepository = deliveryChallanRepository;
        this.invoiceRepository = invoiceRepository;
        this.proformaInvoiceRepository = proformaInvoiceRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.cache = cache;
    }

    /**
     * List all values for a given master key.
     *
     * <p>Result is cached in an in-memory TTL cache. The TTL and maximum size
     * are configured in application.properties ({@code app.cache.masters.*}).
     */
    @Transactional(readOnly = true)
    public List<MasterValueResponse> list(String key) {
        @SuppressWarnings("unchecked")
        List<MasterValueResponse> cached = cache.get(key);
        if (cached != null) {
            return cached;
        }
        List<MasterValueResponse> result = masterValueRepository.findByMasterKeyOrderByValueAsc(key).stream()
                .map(mv -> new MasterValueResponse(mv.getId(), mv.getValue()))
                .toList();
        cache.put(key, result);
        return result;
    }

    /**
     * Create (or reuse) a master value. Duplicates are ignored case-insensitively
     * and after trimming; if an equal value already exists the existing row is
     * returned so the UI never creates duplicates.
     */
    @Transactional
    public MasterValueResponse create(String key, String value) {
        String clean = normalize(value);
        if (masterValueRepository.existsByMasterKeyAndValueIgnoreCase(key, clean)) {
            MasterValue existing = masterValueRepository
                    .findByMasterKeyAndValueIgnoreCase(key, clean)
                    .orElseThrow(() -> new ResourceNotFoundException("Master value not found"));
            return toResponse(existing);
        }
        MasterValue mv = new MasterValue();
        mv.setMasterKey(key);
        mv.setValue(clean);
        MasterValueResponse response = toResponse(masterValueRepository.save(mv));
        cache.evict(key);
        return response;
    }

    @Transactional
    public MasterValueResponse update(String key, Long id, String value) {
        String clean = normalize(value);
        MasterValue mv = masterValueRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Master value not found"));
        if (!mv.getMasterKey().equals(key)) {
            throw new BadRequestException("Master value does not belong to this list");
        }
        masterValueRepository.findByMasterKeyAndValueIgnoreCase(key, clean)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new DuplicateResourceException("Value \"" + clean + "\" already exists");
                });
        mv.setValue(clean);
        MasterValueResponse response = toResponse(masterValueRepository.save(mv));
        cache.evict(key);
        return response;
    }

    @Transactional
    public void delete(String key, Long id) {
        MasterValue mv = masterValueRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Master value not found"));
        if (!mv.getMasterKey().equals(key)) {
            throw new BadRequestException("Master value does not belong to this list");
        }
        long usage = usageCount(key, mv.getValue());
        if (usage > 0) {
            throw new BadRequestException(
                    "\"" + mv.getValue() + "\" is used by " + usage + " record(s) and cannot be deleted");
        }
        masterValueRepository.delete(mv);
        cache.evict(key);
    }

    /** How many live records reference this master value (delete protection). */
    private long usageCount(String key, String value) {
        return switch (key) {
            case "pr_departments" ->
                    cprRepository.countByDepartmentIgnoreCase(value)
                            + costWorkoutRepository.countByDepartmentIgnoreCase(value);
            case "pr_priorities" -> cprRepository.countByPriorityIgnoreCase(value);
            case "pr_requested_by" ->
                    cprRepository.countByRequestedByIgnoreCase(value)
                            + costWorkoutRepository.countByPreparedByIgnoreCase(value);
            case "pr_units" -> cprItemRepository.countByUnitIgnoreCase(value);
            case "cw_departments" -> costWorkoutRepository.countByDepartmentIgnoreCase(value);
            case "cw_preparers" -> costWorkoutRepository.countByPreparedByIgnoreCase(value);
            case "currencies" ->
                    quotationRepository.countByCurrencyIgnoreCase(value)
                            + salesContractRepository.countByCurrencyIgnoreCase(value)
                            + salesOrderRepository.countByCurrencyIgnoreCase(value);
            case "companies" -> quotationRepository.countByFromCompanyIgnoreCase(value);
            case "payment_terms" ->
                    quotationRepository.countByPaymentTermsIgnoreCase(value)
                            + salesContractRepository.countByPaymentTermsIgnoreCase(value)
                            + salesOrderRepository.countByPaymentTermsIgnoreCase(value);
            case "delivery_terms" ->
                    quotationRepository.countByDeliveryTermsIgnoreCase(value)
                            + salesContractRepository.countByDeliveryTermsIgnoreCase(value)
                            + salesOrderRepository.countByDeliveryTermsIgnoreCase(value);
            case "sales_executives" ->
                    salesContractRepository.countBySalesExecutiveIgnoreCase(value)
                            + salesOrderRepository.countBySalesExecutiveIgnoreCase(value);
            case "durations" -> salesContractRepository.countByDurationIgnoreCase(value);
            case "warranty_terms" -> salesContractRepository.countByWarrantyIgnoreCase(value);
            case "transport_companies" -> deliveryChallanRepository.countByTransportCompanyIgnoreCase(value);
            case "payment_modes" -> paymentReceiptRepository.countByPaymentModeIgnoreCase(value);
            case "bank_types" ->
                    invoiceRepository.countByBankTypeIgnoreCase(value)
                            + proformaInvoiceRepository.countByBankTypeIgnoreCase(value);
            case "credit_note_reasons" -> creditNoteRepository.countByReasonIgnoreCase(value);
            case "client_industries" -> customerRepository.countByIndustryIgnoreCase(value);
            case "client_types" -> customerRepository.countByClientTypeIgnoreCase(value);
            case "tax_treatments" -> customerRepository.countByTaxTreatmentIgnoreCase(value);
            case "client_categories" -> customerRepository.countByCategoryIgnoreCase(value);
            case "client_payment_terms" -> customerRepository.countByPaymentTermsIgnoreCase(value);
            case "client_statuses" -> customerRepository.countByStatusIgnoreCase(value);
            case "sales_persons" -> customerRepository.countBySalesPersonIgnoreCase(value);
            case "states" ->
                    quotationRepository.countByStateIgnoreCase(value)
                            + salesContractRepository.countByStateIgnoreCase(value)
                            + salesOrderRepository.countByStateIgnoreCase(value)
                            + deliveryChallanRepository.countByStateIgnoreCase(value);
            case "cities" ->
                    quotationRepository.countByCityIgnoreCase(value)
                            + salesContractRepository.countByCityIgnoreCase(value)
                            + salesOrderRepository.countByCityIgnoreCase(value)
                            + deliveryChallanRepository.countByCityIgnoreCase(value);
            default -> 0L;
        };
    }

    private String normalize(String value) {
        String clean = value == null ? "" : value.trim();
        if (clean.isEmpty()) {
            throw new BadRequestException("Value is required");
        }
        if (clean.length() > 120) {
            throw new BadRequestException("Value must be 120 characters or less");
        }
        return clean;
    }

    private MasterValueResponse toResponse(MasterValue mv) {
        return new MasterValueResponse(mv.getId(), mv.getValue());
    }
}
