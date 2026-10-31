package com.vishatech.erp.service;

import com.vishatech.erp.entity.*;
import com.vishatech.erp.repository.*;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DocumentBackfillService {

    private final DocumentRepositoryEntryRepository docRepo;
    private final LeadRepository leadRepo;
    private final CustomerRepository customerRepo;
    private final FollowUpRepository followUpRepo;
    private final QuotationRepository quotationRepo;
    private final SalesOrderRepository salesOrderRepo;
    private final SalesContractRepository salesContractRepo;
    private final InvoiceRepository invoiceRepo;
    private final PaymentReceiptRepository paymentReceiptRepo;
    private final CreditNoteRepository creditNoteRepo;
    private final CprRepository cprRepo;
    private final CostWorkoutRepository costWorkoutRepo;
    private final ProfitWorkoutRepository profitWorkoutRepo;
    private final CprTechnicalVerificationRepository tvRepo;
    private final MarketingVisitRepository visitRepo;
    private final MarketingTravelPlanRepository travelPlanRepo;
    private final QuestionnaireFormRepository qFormRepo;
    private final MarketingExpenseRepository expenseRepo;

    public DocumentBackfillService(
            DocumentRepositoryEntryRepository docRepo,
            LeadRepository leadRepo,
            CustomerRepository customerRepo,
            FollowUpRepository followUpRepo,
            QuotationRepository quotationRepo,
            SalesOrderRepository salesOrderRepo,
            SalesContractRepository salesContractRepo,
            InvoiceRepository invoiceRepo,
            PaymentReceiptRepository paymentReceiptRepo,
            CreditNoteRepository creditNoteRepo,
            CprRepository cprRepo,
            CostWorkoutRepository costWorkoutRepo,
            ProfitWorkoutRepository profitWorkoutRepo,
            CprTechnicalVerificationRepository tvRepo,
            MarketingVisitRepository visitRepo,
            MarketingTravelPlanRepository travelPlanRepo,
            QuestionnaireFormRepository qFormRepo,
            MarketingExpenseRepository expenseRepo) {
        this.docRepo = docRepo;
        this.leadRepo = leadRepo;
        this.customerRepo = customerRepo;
        this.followUpRepo = followUpRepo;
        this.quotationRepo = quotationRepo;
        this.salesOrderRepo = salesOrderRepo;
        this.salesContractRepo = salesContractRepo;
        this.invoiceRepo = invoiceRepo;
        this.paymentReceiptRepo = paymentReceiptRepo;
        this.creditNoteRepo = creditNoteRepo;
        this.cprRepo = cprRepo;
        this.costWorkoutRepo = costWorkoutRepo;
        this.profitWorkoutRepo = profitWorkoutRepo;
        this.tvRepo = tvRepo;
        this.visitRepo = visitRepo;
        this.travelPlanRepo = travelPlanRepo;
        this.qFormRepo = qFormRepo;
        this.expenseRepo = expenseRepo;
    }

    /**
     * Create the missing record-level document for every source record.
     *
     * <p>Sales-area records are no longer mirrored into the document repository:
     * that repository holds the documents an operator explicitly uploaded or
     * selected (see
     * {@link DocumentModuleScope#allowsAutomaticRecordDocuments}), so the
     * Sales/CRM backfill passes are skipped while the Marketing ones keep
     * running exactly as before. Nothing is deleted by this endpoint.
     */
    @Transactional
    public Map<String, Object> runBackfill() {
        Map<String, Object> result = new LinkedHashMap<>();
        int totalCreated = 0;

        // One decision covers every Sales-area module (CRM, Sales Execution, CPR
        // and the workouts), since the policy is defined per ERP area.
        boolean salesMirrorsAllowed = DocumentModuleScope.allowsAutomaticRecordDocuments("Lead");
        if (salesMirrorsAllowed) {
            totalCreated += backfillLeads(result);
            totalCreated += backfillClients(result);
            totalCreated += backfillFollowUps(result);
            totalCreated += backfillQuotations(result);
            totalCreated += backfillSalesOrders(result);
            totalCreated += backfillSalesContracts(result);
            totalCreated += backfillInvoices(result);
            totalCreated += backfillPaymentReceipts(result);
            totalCreated += backfillCreditNotes(result);
            totalCreated += backfillCprs(result);
            totalCreated += backfillCostWorkouts(result);
            totalCreated += backfillProfitWorkouts(result);
            totalCreated += backfillTechnicalVerifications(result);
        }
        totalCreated += backfillMarketingVisits(result);
        totalCreated += backfillTravelPlans(result);
        totalCreated += backfillQForms(result);
        totalCreated += backfillExpenses(result);

        result.put("totalCreated", totalCreated);
        result.put("salesMirrorsSkipped", !salesMirrorsAllowed);
        return result;
    }

    // ============================== CRM ==============================

    private int backfillLeads(Map<String, Object> result) {
        int count = 0;
        for (Lead lead : leadRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CRM", lead.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CRM");
            e.setDocumentType("Lead");
            e.setDocumentName("Lead — " + (lead.getBusinessName() != null ? lead.getBusinessName() : lead.getName()));
            e.setRelatedRecordId(lead.getId());
            e.setRecordNumber("LEAD-" + String.format("%06d", lead.getId()));
            e.setCustomerName(lead.getBusinessName());
            e.setFilePath("metadata-only");
            e.setStatus(lead.getStatus() != null ? lead.getStatus().name().toLowerCase() : "active");
            e.setUploadedBy(lead.getOwner());
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("leads", count);
        return count;
    }

    private int backfillClients(Map<String, Object> result) {
        int count = 0;
        for (Customer c : customerRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CRM", c.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CRM");
            e.setDocumentType("Client");
            e.setDocumentName("Client — " + (c.getBusinessName() != null ? c.getBusinessName() : "Client #" + c.getId()));
            e.setRelatedRecordId(c.getId());
            e.setRecordNumber(c.getClientCode() != null ? c.getClientCode() : "CLI-" + String.format("%06d", c.getId()));
            e.setCustomerName(c.getBusinessName());
            e.setCustomerId(c.getId());
            e.setFilePath("metadata-only");
            e.setStatus(c.getStatus() != null ? c.getStatus().toLowerCase() : "active");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("clients", count);
        return count;
    }

    private int backfillFollowUps(Map<String, Object> result) {
        int count = 0;
        for (FollowUp fu : followUpRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CRM", fu.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CRM");
            e.setDocumentType("Follow-up");
            String name = fu.getCompanyName() != null ? fu.getCompanyName() : fu.getLeadName();
            e.setDocumentName("Follow-up — " + (name != null ? name : "Record #" + fu.getId()));
            e.setRelatedRecordId(fu.getId());
            e.setRecordNumber("FU-" + String.format("%06d", fu.getId()));
            e.setCustomerName(name);
            e.setCustomerId(fu.getClientId());
            e.setFilePath("metadata-only");
            e.setStatus(fu.getStatus() != null ? fu.getStatus().toLowerCase() : "open");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("followUps", count);
        return count;
    }

    // ============================== SALES ==============================

    private int backfillQuotations(Map<String, Object> result) {
        int count = 0;
        for (Quotation q : quotationRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Sales", q.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Sales");
            e.setDocumentType("Quotation");
            e.setDocumentName("Quotation " + (q.getQuotationNo() != null ? q.getQuotationNo() : ""));
            e.setRelatedRecordId(q.getId());
            e.setRecordNumber(q.getQuotationNo());
            e.setCustomerName(q.getClientName());
            e.setCustomerId(q.getClientId());
            e.setFilePath("metadata-only");
            e.setStatus(q.getStatus() != null ? q.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("quotations", count);
        return count;
    }

    private int backfillSalesOrders(Map<String, Object> result) {
        int count = 0;
        for (SalesOrder so : salesOrderRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Customer Purchase Order", so.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Customer Purchase Order");
            e.setDocumentType("Customer Purchase Order");
            e.setDocumentName("Customer Purchase Order " + (so.getSoNo() != null ? so.getSoNo() : ""));
            e.setRelatedRecordId(so.getId());
            e.setRecordNumber(so.getSoNo());
            e.setCustomerId(so.getClientId());
            e.setFilePath("metadata-only");
            e.setStatus(so.getStatus() != null ? so.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("salesOrders", count);
        return count;
    }

    private int backfillSalesContracts(Map<String, Object> result) {
        int count = 0;
        for (SalesContract sc : salesContractRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Sales", sc.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Sales");
            e.setDocumentType("Sales Contract");
            e.setDocumentName("Sales Contract " + (sc.getScNo() != null ? sc.getScNo() : ""));
            e.setRelatedRecordId(sc.getId());
            e.setRecordNumber(sc.getScNo());
            e.setCustomerId(sc.getClientId());
            e.setFilePath("metadata-only");
            e.setStatus(sc.getStatus() != null ? sc.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("salesContracts", count);
        return count;
    }

    private int backfillInvoices(Map<String, Object> result) {
        int count = 0;
        for (Invoice inv : invoiceRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Finance", inv.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Finance");
            e.setDocumentType("Invoice");
            e.setDocumentName("Invoice " + (inv.getInvoiceNo() != null ? inv.getInvoiceNo() : ""));
            e.setRelatedRecordId(inv.getId());
            e.setRecordNumber(inv.getInvoiceNo());
            e.setCustomerName(inv.getCompanyName());
            e.setFilePath("metadata-only");
            e.setStatus(inv.getStatus() != null ? inv.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("invoices", count);
        return count;
    }

    private int backfillPaymentReceipts(Map<String, Object> result) {
        int count = 0;
        for (PaymentReceipt pr : paymentReceiptRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Finance", pr.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Finance");
            e.setDocumentType("Payment Receipt");
            e.setDocumentName("Payment Receipt " + (pr.getReceiptNo() != null ? pr.getReceiptNo() : ""));
            e.setRelatedRecordId(pr.getId());
            e.setRecordNumber(pr.getReceiptNo());
            e.setFilePath("metadata-only");
            e.setStatus(pr.getStatus() != null ? pr.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("paymentReceipts", count);
        return count;
    }

    private int backfillCreditNotes(Map<String, Object> result) {
        int count = 0;
        for (CreditNote cn : creditNoteRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Finance", cn.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Finance");
            e.setDocumentType("Credit Note");
            e.setDocumentName("Credit Note " + (cn.getCnNo() != null ? cn.getCnNo() : ""));
            e.setRelatedRecordId(cn.getId());
            e.setRecordNumber(cn.getCnNo());
            e.setCustomerName(cn.getCompanyName());
            e.setFilePath("metadata-only");
            e.setStatus(cn.getStatus() != null ? cn.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("creditNotes", count);
        return count;
    }

    // ============================== CPR ==============================

    private int backfillCprs(Map<String, Object> result) {
        int count = 0;
        for (Cpr cpr : cprRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CPR", cpr.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CPR");
            e.setDocumentType("CPR");
            e.setDocumentName("CPR " + (cpr.getPrNo() != null ? cpr.getPrNo() : ""));
            e.setRelatedRecordId(cpr.getId());
            e.setRecordNumber(cpr.getPrNo());
            e.setCustomerName(cpr.getClientName());
            e.setFilePath("metadata-only");
            e.setStatus(cpr.getStatus() != null ? cpr.getStatus().name().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("cprs", count);
        return count;
    }

    private int backfillCostWorkouts(Map<String, Object> result) {
        int count = 0;
        for (CostWorkout cw : costWorkoutRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CPR", cw.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CPR");
            e.setDocumentType("Cost Workout");
            e.setDocumentName("Cost Workout " + (cw.getCwNo() != null ? cw.getCwNo() : ""));
            e.setRelatedRecordId(cw.getId());
            e.setRecordNumber(cw.getCwNo());
            e.setCustomerName(cw.getCustomerName());
            e.setFilePath("metadata-only");
            e.setStatus(cw.getStatus() != null ? cw.getStatus().name().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("costWorkouts", count);
        return count;
    }

    private int backfillProfitWorkouts(Map<String, Object> result) {
        int count = 0;
        for (ProfitWorkout pw : profitWorkoutRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CPR", pw.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CPR");
            e.setDocumentType("Profit Workout");
            e.setDocumentName("Profit Workout " + (pw.getPwNo() != null ? pw.getPwNo() : ""));
            e.setRelatedRecordId(pw.getId());
            e.setRecordNumber(pw.getPwNo());
            e.setFilePath("metadata-only");
            e.setStatus(pw.getStatus() != null ? pw.getStatus().name().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("profitWorkouts", count);
        return count;
    }

    private int backfillTechnicalVerifications(Map<String, Object> result) {
        int count = 0;
        for (CprTechnicalVerification tv : tvRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("CPR", tv.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("CPR");
            e.setDocumentType("Technical Verification");
            e.setDocumentName("TV " + (tv.getTvNo() != null ? tv.getTvNo() : ""));
            e.setRelatedRecordId(tv.getId());
            e.setRecordNumber(tv.getTvNo());
            e.setFilePath("metadata-only");
            e.setStatus(tv.getStatus() != null ? tv.getStatus().name().toLowerCase() : "draft");
            e.setUploadedBy(tv.getCreatedBy());
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("technicalVerifications", count);
        return count;
    }

    // ============================== MARKETING ==============================

    private int backfillMarketingVisits(Map<String, Object> result) {
        int count = 0;
        for (MarketingVisit v : visitRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Marketing", v.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Marketing");
            e.setDocumentType("Marketing Visit");
            e.setDocumentName("Marketing Visit #" + v.getId());
            e.setRelatedRecordId(v.getId());
            e.setRecordNumber("VISIT-" + String.format("%06d", v.getId()));
            e.setCustomerId(v.getCustomerId());
            e.setFilePath("metadata-only");
            e.setStatus(v.getVisitStatus() != null ? v.getVisitStatus().toLowerCase() : "planned");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("marketingVisits", count);
        return count;
    }

    private int backfillTravelPlans(Map<String, Object> result) {
        int count = 0;
        for (MarketingTravelPlan tp : travelPlanRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Marketing", tp.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Marketing");
            e.setDocumentType("Travel Planner");
            e.setDocumentName("Travel Plan #" + tp.getId());
            e.setRelatedRecordId(tp.getId());
            e.setRecordNumber("TP-" + String.format("%06d", tp.getId()));
            e.setFilePath("metadata-only");
            e.setStatus(tp.getStatus() != null ? tp.getStatus().toLowerCase() : "draft");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("travelPlans", count);
        return count;
    }

    private int backfillQForms(Map<String, Object> result) {
        int count = 0;
        for (QuestionnaireForm qf : qFormRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Marketing", qf.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Marketing");
            e.setDocumentType("Q Form");
            e.setDocumentName("Q Form #" + qf.getId());
            e.setRelatedRecordId(qf.getId());
            e.setRecordNumber("QF-" + String.format("%06d", qf.getId()));
            e.setFilePath("metadata-only");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("qForms", count);
        return count;
    }

    private int backfillExpenses(Map<String, Object> result) {
        int count = 0;
        for (MarketingExpense ex : expenseRepo.findAll()) {
            if (docRepo.existsByModuleAndRelatedRecordId("Marketing", ex.getId())) continue;
            DocumentRepositoryEntry e = new DocumentRepositoryEntry();
            e.setModule("Marketing");
            e.setDocumentType("Marketing Expense");
            e.setDocumentName("Expense #" + ex.getId());
            e.setRelatedRecordId(ex.getId());
            e.setRecordNumber("EXP-" + String.format("%06d", ex.getId()));
            e.setFilePath("metadata-only");
            e.setVisibility(DocumentVisibility.TEAM_ONLY);
            docRepo.save(e);
            count++;
        }
        result.put("expenses", count);
        return count;
    }
}
