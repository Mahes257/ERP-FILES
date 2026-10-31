package com.vishatech.erp.crm.service;

import com.vishatech.erp.crm.dto.CustomerActivityEntry;
import com.vishatech.erp.crm.dto.CustomerDuplicateMatch;
import com.vishatech.erp.crm.dto.CustomerRequest;
import com.vishatech.erp.crm.dto.CustomerResponse;
import com.vishatech.erp.crm.dto.CustomerStatementResponse;
import com.vishatech.erp.crm.dto.CustomerTimelineEntry;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.CustomerAttachment;
import com.vishatech.erp.crm.entity.CustomerContact;
import com.vishatech.erp.crm.entity.CustomerShippingAddress;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.service.DocumentRepositoryService;
import com.vishatech.erp.service.FileStorageService;
import com.vishatech.erp.service.EditHistoryService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

@Service
@Transactional
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final InvoiceRepository invoiceRepository;
    private final PaymentReceiptRepository paymentReceiptRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    /**
     * CRM Contacts: creating a client from a lead (the existing "Convert to
     * Client" flow) LINKS that lead's captured contacts to the new client — the
     * same rows get the client reference, so conversion never duplicates a
     * contact and the person keeps both references.
     */
    private final ContactService contactService;
    private final String baseUrl;

    public CustomerService(CustomerRepository customerRepository, InvoiceRepository invoiceRepository,
                           PaymentReceiptRepository paymentReceiptRepository,
                           EditHistoryRepository editHistoryRepository,
                           RecordRevisionRepository recordRevisionRepository,
                           FileStorageService fileStorageService,
                           DocumentRepositoryService documentRepositoryService,
                           ContactService contactService,
                           @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.customerRepository = customerRepository;
        this.invoiceRepository = invoiceRepository;
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.contactService = contactService;
        this.baseUrl = baseUrl;
    }

    public List<CustomerResponse> list(String q, String status) {
        List<Customer> customers = customerRepository.search(clean(q), clean(status));
        return customers.stream().map(this::toResponse).toList();
    }

    public CustomerResponse get(Long id) {
        return toResponse(find(id));
    }

    public CustomerResponse create(CustomerRequest request) {
        Customer customer = new Customer();
        apply(customer, request);
        if (customer.getClientCode() == null || customer.getClientCode().isBlank()) {
            customer.setClientCode(nextClientCode());
        } else if (customerRepository.existsByClientCode(customer.getClientCode())) {
            throw new DuplicateResourceException("Client code already exists: " + customer.getClientCode());
        }
        customer.setCreatedAt(LocalDateTime.now());
        customer.setUpdatedAt(LocalDateTime.now());
        syncContacts(customer, request);
        syncShipping(customer, request);
        Customer saved = customerRepository.save(customer);
        linkContacts(saved, request);
        return toResponse(saved);
    }

    /**
     * Link the CRM contacts this client creation/update refers to.
     *
     * Two sources, both real ids: the lead the client was converted from, and the
     * contacts the operator explicitly picked. Linking ADDS the client reference
     * to the existing contact rows — it never writes new contact rows, so a
     * conversion cannot duplicate a person, and the contacts keep their lead
     * reference as well.
     */
    private void linkContacts(Customer client, CustomerRequest request) {
        if (request.leadId() != null) {
            contactService.linkLeadContactsToClient(request.leadId(), client.getId());
        }
        if (request.linkedContactIds() != null && !request.linkedContactIds().isEmpty()) {
            contactService.linkContactsToClient(request.linkedContactIds(), client.getId());
        }
    }

    public CustomerResponse update(Long id, CustomerRequest request) {
        Customer customer = find(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(customer);
        com.vishatech.erp.service.RecordRevisionService.get().record("customer", customer.getId(), customer);
        apply(customer, request);
        if (customer.getClientCode() != null && !customer.getClientCode().isBlank()) {
            customerRepository.findByClientCode(customer.getClientCode())
                    .filter(other -> !other.getId().equals(id))
                    .ifPresent(other -> {
                        throw new DuplicateResourceException("Client code already exists: " + customer.getClientCode());
                    });
        }
        customer.setUpdatedAt(LocalDateTime.now());
        syncContacts(customer, request);
        syncShipping(customer, request);
        Customer saved = customerRepository.save(customer);
        linkContacts(saved, request);
        editHistory.recordEdit("customer", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }

    public void delete(Long id) {
        // Soft delete (trash): the row stays in MySQL with status "Deleted" and
        // can be restored — mirrors the sales-module behavior.
        Customer customer = find(id);
        customer.setStatus("Deleted");
        customer.setUpdatedAt(LocalDateTime.now());
        customerRepository.save(customer);
    }

    public void permanentDelete(Long id) {
        Customer customer = find(id);
        // Hard delete: purge edit-history + revision snapshots so the removed
        // record leaves no orphaned rows behind.
        editHistoryRepository.deleteByModuleTypeAndRecordId("customer", id);
        recordRevisionRepository.deleteByModuleTypeAndRecordId("customer", id);
        customerRepository.delete(customer);
    }

    public int bulkDelete(List<Long> ids) {
        // Soft delete for trash parity with the single-delete endpoint.
        int count = 0;
        for (Long id : ids) {
            Customer customer = find(id);
            if (!"Deleted".equals(customer.getStatus())) {
                customer.setStatus("Deleted");
                customer.setUpdatedAt(LocalDateTime.now());
                customerRepository.save(customer);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            Customer customer = find(id);
            if (!"Active".equals(customer.getStatus())) {
                customer.setStatus("Active");
                customer.setUpdatedAt(LocalDateTime.now());
                customerRepository.save(customer);
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

    public CustomerResponse archive(Long id) {
        Customer customer = find(id);
        customer.setStatus("Archived");
        customer.setUpdatedAt(LocalDateTime.now());
        return toResponse(customerRepository.save(customer));
    }

    public CustomerResponse restore(Long id) {
        Customer customer = find(id);
        customer.setStatus("Active");
        customer.setUpdatedAt(LocalDateTime.now());
        return toResponse(customerRepository.save(customer));
    }

    public CustomerResponse duplicate(Long id) {
        Customer source = find(id);
        Customer copy = new Customer();
        copy.setBusinessName(source.getBusinessName() + " (Copy)");
        copy.setClientCode(nextClientCode());
        copy.setAlias(source.getAlias());
        copy.setContactPerson(source.getContactPerson());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setGstin(source.getGstin());
        copy.setPan(source.getPan());
        copy.setBillingAddress(source.getBillingAddress());
        copy.setBillingCity(source.getBillingCity());
        copy.setBillingState(source.getBillingState());
        copy.setBillingPin(source.getBillingPin());
        copy.setShippingAddress(source.getShippingAddress());
        copy.setShippingCity(source.getShippingCity());
        copy.setShippingState(source.getShippingState());
        copy.setShippingPin(source.getShippingPin());
        copy.setCountry(source.getCountry());
        copy.setPaymentTerms(source.getPaymentTerms());
        copy.setCreditLimit(source.getCreditLimit());
        copy.setSalesPerson(source.getSalesPerson());
        copy.setCategory(source.getCategory());
        copy.setStatus("Active");
        copy.setNotes(source.getNotes());
        copy.setIndustry(source.getIndustry());
        copy.setWebsite(source.getWebsite());
        copy.setClientType(source.getClientType());
        copy.setTaxTreatment(source.getTaxTreatment());
        copy.setMapNo(source.getMapNo());
        copy.setCurrency(source.getCurrency());
        copy.setBankName(source.getBankName());
        copy.setAccountHolderName(source.getAccountHolderName());
        copy.setAccountNumber(source.getAccountNumber());
        copy.setIfsc(source.getIfsc());
        copy.setBranch(source.getBranch());
        copy.setUpiId(source.getUpiId());
        copy.setOpeningBalance(source.getOpeningBalance());
        copy.setCreatedAt(LocalDateTime.now());
        copy.setUpdatedAt(LocalDateTime.now());
        source.getContacts().forEach(contact -> {
            CustomerContact c = new CustomerContact();
            c.setName(contact.getName());
            c.setEmail(contact.getEmail());
            c.setPhone(contact.getPhone());
            c.setDesignation(contact.getDesignation());
            copy.addContact(c);
        });
        source.getShippingAddresses().forEach(address -> {
            CustomerShippingAddress a = new CustomerShippingAddress();
            a.setCountry(address.getCountry());
            a.setState(address.getState());
            a.setCity(address.getCity());
            a.setPostal(address.getPostal());
            a.setStreet(address.getStreet());
            copy.addShippingAddress(a);
        });
        return toResponse(customerRepository.save(copy));
    }

    public CustomerResponse setStatus(Long id, String status) {
        Customer customer = find(id);
        String normalized = status == null ? null : status.trim();
        if (normalized == null || normalized.isBlank()) {
            throw new BadRequestException("Status is required");
        }
        if (!normalized.equalsIgnoreCase("Active") && !normalized.equalsIgnoreCase("Inactive")) {
            throw new BadRequestException("Invalid status: " + status);
        }
        String capitalized = normalized.equalsIgnoreCase("Active") ? "Active" : "Inactive";
        customer.setStatus(capitalized);
        customer.setUpdatedAt(LocalDateTime.now());
        return toResponse(customerRepository.save(customer));
    }

    // ============================== Client records ==============================
    // Client Timeline / Documents / Statement / Activities — real data derived
    // from the customer's own lifecycle, attachments and sales documents.

    public List<CustomerTimelineEntry> getTimeline(Long id) {
        Customer customer = find(id);
        List<CustomerTimelineEntry> entries = new ArrayList<>();
        if (customer.getCreatedAt() != null) {
            entries.add(new CustomerTimelineEntry("created", "Client created",
                    "Client '" + display(customer.getBusinessName()) + "' was added to the client master.",
                    customer.getCreatedAt().toString()));
        }
        if (customer.getUpdatedAt() != null && customer.getUpdatedAt().isAfter(
                customer.getCreatedAt() == null ? LocalDateTime.MIN : customer.getCreatedAt())) {
            entries.add(new CustomerTimelineEntry("updated", "Client updated",
                    "Client details were last updated.", customer.getUpdatedAt().toString()));
        }
        customer.getAttachments().forEach(attachment -> entries.add(
                new CustomerTimelineEntry("attachment", "Document uploaded",
                        attachment.getName(),
                        attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString())));
        entries.sort(Comparator.comparing(CustomerTimelineEntry::createdAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return entries;
    }

    public List<CustomerActivityEntry> getActivities(Long id) {
        Customer customer = find(id);
        List<CustomerActivityEntry> entries = new ArrayList<>();
        getTimeline(id).forEach(entry -> entries.add(new CustomerActivityEntry(
                entry.type(), entry.title(), entry.detail(), entry.createdAt())));
        invoiceRepository.findByClientId(id).forEach(invoice -> entries.add(
                new CustomerActivityEntry("invoice", "Invoice created",
                        invoice.getInvoiceNo() + (invoice.getStatus() == null ? "" : " (" + invoice.getStatus() + ")"),
                        invoice.getInvoiceDate() == null ? null : invoice.getInvoiceDate().toString())));
        paymentReceiptRepository.findByClientId(id).forEach(receipt -> entries.add(
                new CustomerActivityEntry("payment", "Payment received",
                        receipt.getReceiptNo() + (receipt.getStatus() == null ? "" : " (" + receipt.getStatus() + ")"),
                        receipt.getPaymentDate() == null ? null : receipt.getPaymentDate().toString())));
        entries.sort(Comparator.comparing(CustomerActivityEntry::createdAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return entries;
    }

    public CustomerStatementResponse getStatement(Long id) {
        Customer customer = find(id);
        List<CustomerStatementResponse.Entry> entries = new ArrayList<>();
        invoiceRepository.findByClientId(id).forEach(invoice -> entries.add(
                new CustomerStatementResponse.Entry(
                        invoice.getInvoiceDate() == null ? null : invoice.getInvoiceDate().toLocalDate().toString(),
                        "Invoice",
                        invoice.getInvoiceNo(),
                        invoice.getStatus() == null ? "" : invoice.getStatus(),
                        invoice.getGrandTotal() == null ? BigDecimal.ZERO : invoice.getGrandTotal(),
                        BigDecimal.ZERO,
                        BigDecimal.ZERO)));
        paymentReceiptRepository.findByClientId(id).forEach(receipt -> entries.add(
                new CustomerStatementResponse.Entry(
                        receipt.getPaymentDate() == null ? null : receipt.getPaymentDate().toLocalDate().toString(),
                        "Payment Receipt",
                        receipt.getReceiptNo(),
                        receipt.getStatus() == null ? "" : receipt.getStatus(),
                        BigDecimal.ZERO,
                        receipt.getAmount() == null ? BigDecimal.ZERO : receipt.getAmount(),
                        BigDecimal.ZERO)));
        entries.sort(Comparator.comparing(CustomerStatementResponse.Entry::date,
                Comparator.nullsLast(Comparator.naturalOrder())));

        BigDecimal opening = customer.getOpeningBalance() == null ? BigDecimal.ZERO : customer.getOpeningBalance();
        BigDecimal running = opening;
        for (int i = 0; i < entries.size(); i++) {
            CustomerStatementResponse.Entry current = entries.get(i);
            running = running.add(current.debit()).subtract(current.credit());
            entries.set(i, new CustomerStatementResponse.Entry(current.date(), current.type(), current.refNo(),
                    current.description(), current.debit(), current.credit(), running));
        }
        return new CustomerStatementResponse(customer.getId(), customer.getBusinessName(), opening, entries, running);
    }

    public List<CustomerResponse.CustomerAttachmentResponse> getAttachments(Long id) {
        return find(id).getAttachments().stream().map(this::attachmentResponse).toList();
    }

    public CustomerResponse.CustomerAttachmentResponse addAttachment(Long id, MultipartFile file) {
        Customer customer = find(id);
        String storedName = fileStorageService.store(file);
        CustomerAttachment attachment = new CustomerAttachment();
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        customer.addAttachment(attachment);
        customer.setUpdatedAt(LocalDateTime.now());
        customerRepository.save(customer);
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Clients", id,
                customer.getClientCode(), customer.getId(), customer.getBusinessName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.CUSTOMER);
        return attachmentResponse(attachment);
    }

    // ============================== Helpers ==============================

    private Customer find(Long id) {
        return customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found: " + id));
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String display(String value) {
        return value == null ? "" : value;
    }

    /**
     * Next sequential client code. Only the code column is projected out of the
     * database (never the customer rows with their contacts, shipping addresses
     * and attachments), so code generation stays O(codes) instead of hydrating
     * every client aggregate.
     */
    private String nextClientCode() {
        int max = 0;
        for (String code : customerRepository.findClientCodes()) {
            if (code != null && code.startsWith("CL-")) {
                try {
                    max = Math.max(max, Integer.parseInt(code.substring(3)));
                } catch (NumberFormatException ignored) {
                    // ignore non-numeric suffixes
                }
            }
        }
        return String.format("CL-%04d", max + 1);
    }

    private void apply(Customer customer, CustomerRequest r) {
        customer.setBusinessName(r.businessName());
        customer.setClientCode(clean(r.clientCode()));
        customer.setAlias(clean(r.alias()));
        customer.setContactPerson(clean(r.contactPerson()));
        customer.setEmail(clean(r.email()));
        customer.setPhone(clean(r.phone()));
        customer.setGstin(clean(r.gstin()));
        customer.setPan(clean(r.pan()));
        customer.setBillingAddress(clean(r.billingAddress()));
        customer.setBillingCity(clean(r.billingCity()));
        customer.setBillingState(clean(r.billingState()));
        customer.setBillingPin(clean(r.billingPin()));
        customer.setShippingAddress(clean(r.shippingAddress()));
        customer.setShippingCity(clean(r.shippingCity()));
        customer.setShippingState(clean(r.shippingState()));
        customer.setShippingPin(clean(r.shippingPin()));
        customer.setCountry(r.country() == null || r.country().isBlank() ? "India" : r.country());
        customer.setPaymentTerms(clean(r.paymentTerms()));
        customer.setCreditLimit(r.creditLimit() == null ? BigDecimal.ZERO : r.creditLimit());
        customer.setSalesPerson(clean(r.salesPerson()));
        customer.setCategory(clean(r.category()));
        customer.setStatus(r.status() == null || r.status().isBlank() ? "Active" : r.status());
        customer.setNotes(clean(r.notes()));
        customer.setIndustry(clean(r.industry()));
        customer.setWebsite(clean(r.website()));
        customer.setClientType(clean(r.clientType()));
        customer.setTaxTreatment(clean(r.taxTreatment()));
        customer.setMapNo(clean(r.mapNo()));
        customer.setCurrency(r.currency() == null || r.currency().isBlank() ? "INR" : r.currency());
        customer.setBankName(clean(r.bankName()));
        customer.setAccountHolderName(clean(r.accountHolderName()));
        customer.setAccountNumber(clean(r.accountNumber()));
        customer.setIfsc(clean(r.ifsc()));
        customer.setBranch(clean(r.branch()));
        customer.setUpiId(clean(r.upiId()));
        customer.setOpeningBalance(r.openingBalance() == null ? BigDecimal.ZERO : r.openingBalance());
    }

    private void syncContacts(Customer customer, CustomerRequest request) {
        customer.getContacts().clear();
        if (request.contacts() != null) {
            request.contacts().forEach(c -> {
                CustomerContact contact = new CustomerContact();
                contact.setName(c.name());
                contact.setEmail(c.email());
                contact.setPhone(c.phone());
                contact.setDesignation(c.designation());
                customer.addContact(contact);
            });
        }
    }

    private void syncShipping(Customer customer, CustomerRequest request) {
        customer.getShippingAddresses().clear();
        if (request.shippingAddresses() != null) {
            request.shippingAddresses().forEach(s -> {
                CustomerShippingAddress address = new CustomerShippingAddress();
                address.setCountry(s.country());
                address.setState(s.state());
                address.setCity(s.city());
                address.setPostal(s.postal());
                address.setStreet(s.street());
                customer.addShippingAddress(address);
            });
        }
    }

    // ---- Duplicate detection ----

    /**
     * Check whether a customer with the given business name, GSTIN, or PAN
     * already exists (excluding soft-deleted records). Returns a list of
     * matching reasons so the frontend can display specific warnings.
     */
    public List<CustomerDuplicateMatch> checkDuplicate(String businessName, String gstin, String pan, Long excludeId) {
        List<CustomerDuplicateMatch> matches = new ArrayList<>();
        if (gstin != null && !gstin.isBlank()) {
            customerRepository.findByGstinIgnoreCase(gstin.trim())
                    .filter(c -> isMatch(c, excludeId))
                    .ifPresent(c -> matches.add(new CustomerDuplicateMatch(
                            "gstin",
                            "GSTIN '" + gstin + "' already exists for client: " + c.getBusinessName() + " (" + c.getClientCode() + ")",
                            String.valueOf(c.getId()),
                            c.getBusinessName())));
        }
        if (pan != null && !pan.isBlank()) {
            customerRepository.findByPanIgnoreCase(pan.trim())
                    .filter(c -> isMatch(c, excludeId))
                    .ifPresent(c -> matches.add(new CustomerDuplicateMatch(
                            "pan",
                            "PAN '" + pan + "' already exists for client: " + c.getBusinessName() + " (" + c.getClientCode() + ")",
                            String.valueOf(c.getId()),
                            c.getBusinessName())));
        }
        if (businessName != null && !businessName.isBlank()) {
            customerRepository.findByBusinessNameIgnoreCase(businessName.trim())
                    .filter(c -> isMatch(c, excludeId))
                    .ifPresent(c -> matches.add(new CustomerDuplicateMatch(
                            "businessName",
                            "Business name '" + businessName + "' already exists for client: " + c.getClientCode(),
                            String.valueOf(c.getId()),
                            c.getBusinessName())));
        }
        return matches;
    }

    /** A trashed client and the client being edited never count as duplicates. */
    private boolean isMatch(Customer candidate, Long excludeId) {
        return (excludeId == null || !candidate.getId().equals(excludeId))
                && !"Deleted".equals(candidate.getStatus());
    }

    private CustomerResponse toResponse(Customer c) {
        return new CustomerResponse(
                c.getId(), c.getBusinessName(), c.getClientCode(), c.getAlias(),
                c.getContactPerson(), c.getEmail(), c.getPhone(), c.getGstin(), c.getPan(),
                c.getBillingAddress(), c.getBillingCity(), c.getBillingState(), c.getBillingPin(),
                c.getShippingAddress(), c.getShippingCity(), c.getShippingState(), c.getShippingPin(),
                c.getCountry(), c.getPaymentTerms(), c.getCreditLimit(), c.getSalesPerson(),
                c.getCategory(), c.getStatus(), c.getNotes(), c.getCreatedAt(),
                c.getIndustry(), c.getWebsite(), c.getClientType(), c.getTaxTreatment(), c.getMapNo(),
                c.getCurrency(), c.getBankName(), c.getAccountHolderName(), c.getAccountNumber(),
                c.getIfsc(), c.getBranch(), c.getUpiId(), c.getOpeningBalance(), c.getUpdatedAt(),
                c.getContacts().stream()
                        .map(contact -> new CustomerResponse.CustomerContactResponse(
                                contact.getId(), contact.getName(), contact.getEmail(),
                                contact.getPhone(), contact.getDesignation()))
                        .toList(),
                c.getShippingAddresses().stream()
                        .map(address -> new CustomerResponse.CustomerShippingResponse(
                                address.getId(), address.getCountry(), address.getState(),
                                address.getCity(), address.getPostal(), address.getStreet()))
                        .toList(),
                c.getAttachments().stream().map(this::attachmentResponse).toList()
        );
    }

    private CustomerResponse.CustomerAttachmentResponse attachmentResponse(CustomerAttachment attachment) {
        return new CustomerResponse.CustomerAttachmentResponse(attachment.getId(), attachment.getName(),
                attachment.getContentType(), attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString());
    }

    private String currentUserName() {
        Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }
}
