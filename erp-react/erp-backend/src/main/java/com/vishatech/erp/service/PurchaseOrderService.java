package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseOrder;
import com.vishatech.erp.entity.PurchaseOrderItem;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PurchaseQuotation;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.PurchaseOrderRepository;
import com.vishatech.erp.repository.PurchaseQuotationRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.util.PurchaseNumbering;
import com.vishatech.erp.util.PurchaseTotals;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseOrderService {
    private final PurchaseOrderRepository orders;
    private final PurchaseRequisitionRepository requisitions;
    private final PurchaseRfqRepository rfqs;
    private final PurchaseQuotationRepository quotations;
    private final PurchaseSupportService support;
    private final PurchaseNumbering numbering;
    private final AuditContext audit;
    private final PurchaseNotificationPublisher notifications;
    private final ObjectMapper mapper = new ObjectMapper();

    public PurchaseOrderService(PurchaseOrderRepository orders, PurchaseRequisitionRepository requisitions,
            PurchaseRfqRepository rfqs, PurchaseQuotationRepository quotations,
            PurchaseSupportService support, PurchaseNumbering numbering, AuditContext audit,
            PurchaseNotificationPublisher notifications) {
        this.orders = orders; this.requisitions = requisitions; this.rfqs = rfqs;
        this.quotations = quotations; this.support = support; this.numbering = numbering; this.audit = audit;
        this.notifications = notifications;
    }

    @Transactional
    public Map<String,Object> create(Map<String,Object> r) {
        PurchaseOrder po = new PurchaseOrder();
        String no = text(r,"poNo");
        if (no.isBlank()) no = numbering.nextPoNo(numbering.maxSequence(orders.findAll().stream().map(PurchaseOrder::getPoNo).toList(),"PO"));
        if (orders.existsByPoNo(no)) throw new BadRequestException("PO number already exists");
        po.setPoNo(no); apply(po,r,true); orders.save(po);
        support.log(PurchaseSupportService.DOC_PO, po.getId(),"create","Purchase order created",no);
        return response(po);
    }

    @Transactional
    public Map<String,Object> update(Long id, Map<String,Object> r) {
        PurchaseOrder po = get(id);
        if (r.containsKey("status") && r.size() == 1) return transition(id, text(r, "status"));
        if (!List.of("Draft","Pending Approval").contains(po.getStatus())) throw new BadRequestException("Only draft or pending POs can be edited");
        apply(po,r,false); orders.save(po); support.log(PurchaseSupportService.DOC_PO,id,"update","Purchase order updated","");
        return response(po);
    }

    @Transactional
    public Map<String,Object> approve(Long id, String note) {
        PurchaseOrder po=get(id); require(po,"Pending Approval");
        po.setStatus("Approved"); po.setApprovalStatus("Approved"); po.setApprovedBy(audit.currentUserName()); po.setApprovalDate(LocalDateTime.now());
        orders.save(po); support.log(PurchaseSupportService.DOC_PO,id,"approve","Purchase order approved",note,"Pending Approval","Approved");
        notifications.publish(PurchaseNotificationPublisher.EVENT_PO_APPROVED,
                "PO " + po.getPoNo() + " approved",
                "Purchase order " + po.getPoNo() + " was approved by " + po.getApprovedBy()
                        + (note == null || note.isBlank() ? "." : " — " + note),
                po.getId(), "PurchaseOrder");
        return response(po);
    }
    @Transactional
    public Map<String,Object> reject(Long id, String note) {
        PurchaseOrder po=get(id); require(po,"Pending Approval");
        po.setStatus("Cancelled"); po.setApprovalStatus("Rejected"); po.setRejectedBy(audit.currentUserName()); po.setRejectedReason(note);
        orders.save(po); support.log(PurchaseSupportService.DOC_PO,id,"reject","Purchase order rejected",note,"Pending Approval","Cancelled");
        notifications.publish(PurchaseNotificationPublisher.EVENT_PO_REJECTED,
                "PO " + po.getPoNo() + " rejected",
                "Purchase order " + po.getPoNo() + " was rejected by " + po.getRejectedBy()
                        + (note == null || note.isBlank() ? "." : ": " + note),
                po.getId(), "PurchaseOrder", Notification.Priority.HIGH);
        return response(po);
    }
    @Transactional
    public Map<String,Object> submit(Long id) {
        PurchaseOrder po=get(id); require(po,"Draft"); po.setStatus("Pending Approval"); po.setApprovalStatus("Pending");
        orders.save(po); support.log(PurchaseSupportService.DOC_PO,id,"submit","Submitted for approval","");
        notifications.publish(PurchaseNotificationPublisher.EVENT_PO_SUBMITTED,
                "PO " + po.getPoNo() + " submitted for approval",
                "Purchase order " + po.getPoNo() + " (" + po.getTitle() + ") is awaiting approval.",
                po.getId(), "PurchaseOrder");
        return response(po);
    }
    @Transactional
    public Map<String,Object> release(Long id) {
        PurchaseOrder po=get(id); require(po,"Approved");
        po.setStatus("Released"); po.setReleasedBy(audit.currentUserName()); po.setReleasedAt(LocalDateTime.now()); po.setDeliveryStatus("Released");
        orders.save(po); support.log(PurchaseSupportService.DOC_PO,id,"release","Purchase order released","Approved","Approved","Released");
        notifications.publish(PurchaseNotificationPublisher.EVENT_PO_RELEASED,
                "PO " + po.getPoNo() + " released",
                "Purchase order " + po.getPoNo() + " (" + po.getVendor() + ") was released to the supplier by "
                        + po.getReleasedBy() + ".",
                po.getId(), "PurchaseOrder");
        return response(po);
    }
    @Transactional
    public Map<String,Object> transition(Long id, String status) {
        return switch (status) {
            case "Pending Approval" -> submit(id);
            case "Approved" -> approve(id, "");
            case "Released" -> release(id);
            case "Supplier Acknowledged" -> acknowledge(id, status, "");
            case "In Progress", "Partially Delivered", "Completed" -> delivery(id, status);
            case "Closed" -> { PurchaseOrder po = get(id); require(po, "Completed"); po.setStatus("Closed"); orders.save(po); yield response(po); }
            case "Cancelled" -> { PurchaseOrder po = get(id); if (List.of("Closed", "Cancelled").contains(po.getStatus())) throw new BadRequestException("PO cannot be cancelled"); po.setStatus("Cancelled"); orders.save(po); yield response(po); }
            default -> throw new BadRequestException("Invalid PO status: " + status);
        };
    }
    @Transactional
    public Map<String,Object> acknowledge(Long id, String status, String note) {
        PurchaseOrder po=get(id);
        if (!"Released".equals(po.getStatus())) throw new BadRequestException("Only released POs can be acknowledged");
        String next = status == null || status.isBlank() ? "Supplier Acknowledged" : status;
        if (!List.of("Supplier Acknowledged","Partially Acknowledged","Acknowledgement Rejected").contains(next)) throw new BadRequestException("Invalid acknowledgement status");
        po.setStatus(next); po.setAcknowledgedAt(LocalDateTime.now()); po.setAcknowledgedBy(po.getVendor()); po.setVendorNotes(note);
        orders.save(po); support.log(PurchaseSupportService.DOC_PO,id,"acknowledge",next,note,"Released",next);
        notifications.publish(PurchaseNotificationPublisher.EVENT_SUPPLIER_ACKNOWLEDGEMENT,
                "PO " + po.getPoNo() + " " + next.toLowerCase(),
                "Supplier acknowledgement \"" + next + "\" recorded for purchase order "
                        + po.getPoNo() + " (" + po.getVendor() + ")"
                        + (note == null || note.isBlank() ? "." : ": " + note),
                po.getId(), "PurchaseOrder");
        return response(po);
    }
    /**
     * Records a supplier acknowledgement reminder on the PO activity trail.
     * Allowed at any stage — the generic edit endpoint refuses released POs,
     * which made "Send Reminder" fail with 400 exactly when it is offered.
     * Nothing on the document itself changes; only the activity log gains an
     * entry.
     */
    @Transactional
    public Map<String,Object> remind(Long id, String note) {
        PurchaseOrder po = get(id);
        support.log(PurchaseSupportService.DOC_PO, id, "reminder", "Acknowledgement reminder sent", note);
        return response(po);
    }

    @Transactional
    public Map<String,Object> delivery(Long id, String status) {
        PurchaseOrder po=get(id);
        if (!List.of("Released","Supplier Acknowledged","In Progress","Partially Delivered").contains(po.getStatus())) throw new BadRequestException("Invalid delivery transition");
        if (!List.of("In Progress","Partially Delivered","Completed").contains(status)) throw new BadRequestException("Invalid delivery status");
        po.setStatus(status); po.setDeliveryStatus(status); orders.save(po); return response(po);
    }
    @Transactional(readOnly=true) public Map<String,Object> getResponse(Long id){return response(get(id));}
    @Transactional(readOnly=true) public List<Map<String,Object>> list(){return orders.findAll().stream().map(this::response).toList();}
    /**
     * Status buckets PLUS the two aggregates the PO list's KPI row reads
     * (`total` = every PO, `value` = summed order amount). Without them the
     * "Total Orders" and "Order Value" cards rendered 0 against the backend.
     */
    @Transactional(readOnly=true) public Map<String,Object> stats(){List<PurchaseOrder> all=orders.findAll();Map<String,Object> m=new LinkedHashMap<>();m.put("total",all.size());BigDecimal value=BigDecimal.ZERO;for(PurchaseOrder p:all){if(p.getAmount()!=null)value=value.add(p.getAmount());}m.put("value",value);for(String s:List.of("Draft","Pending Approval","Approved","Released","Supplier Acknowledged","In Progress","Partially Delivered","Completed","Cancelled")) m.put(s,all.stream().filter(p->s.equals(p.getStatus())).count()); return m;}
    public PurchaseOrder get(Long id){return orders.findById(id).orElseThrow(()->new ResourceNotFoundException("Purchase order not found: "+id));}
    @Transactional public void delete(Long id){PurchaseOrder p=get(id); if(!"Draft".equals(p.getStatus()))throw new BadRequestException("Only draft POs can be deleted"); orders.delete(p);}

    /** Next PO number derived from the DATABASE — the create form pre-fills its number from here (the local store is empty in API mode, which used to hand out an already-used number and 400 on save). */
    @Transactional(readOnly=true) public Map<String,Object> nextNumber(){List<String> numbers=orders.findAll().stream().map(PurchaseOrder::getPoNo).toList(); long max=numbering.maxSequence(numbers,"PO"); return Map.of("poNo",numbering.nextPoNo(max),"nextNumber",max+1);}

    private void apply(PurchaseOrder p, Map<String,Object> r, boolean create) {
        if (create || r.containsKey("title")) p.setTitle(required(r,"title","PO title"));
        if (create || r.containsKey("vendor")) p.setVendor(required(r,"vendor","Supplier"));
        if (create || r.containsKey("prNo") || r.containsKey("reference")) { p.setPrNo(text(r,"prNo").isBlank()?text(r,"reference"):text(r,"prNo")); p.setReference(p.getPrNo()); }
        if (create || r.containsKey("rfqNo")) p.setRfqNo(text(r,"rfqNo"));
        if (create || r.containsKey("quotationNo")) p.setQuotationNo(text(r,"quotationNo"));
        if(!p.getPrNo().isBlank()) requisitions.findByPrNo(p.getPrNo()).orElseThrow(()->new BadRequestException("Linked PR not found"));
        if(!p.getRfqNo().isBlank()) { PurchaseRfq f=rfqs.findByRfqNo(p.getRfqNo()).orElseThrow(()->new BadRequestException("Linked RFQ not found")); if(!"Awarded".equals(f.getStatus())) throw new BadRequestException("RFQ must be awarded before creating a PO"); }
        if(!p.getQuotationNo().isBlank()) quotations.findAll().stream().filter(q->p.getQuotationNo().equals(q.getQuotationNo())&&p.getVendor().equals(q.getVendor())).findFirst().orElseThrow(()->new BadRequestException("Linked quotation not found"));
        /* Every field is applied only when the request actually carries it, so
           a partial PATCH-style body (activity log, payment terms, status +
           approvalStatus) never blanks the rest of the document. This mirrors
           the frontend/mock contract, whose updateOrder accepts partial
           patches — the endpoint previously demanded a full replacement and
           returned 400 "PO title is required" for anything smaller. */
        if (create || r.containsKey("orderDate")) p.setOrderDate(text(r,"orderDate"));
        if (create || r.containsKey("expectedDate")) p.setExpectedDate(text(r,"expectedDate"));
        if (create || r.containsKey("deliveryDate")) p.setDeliveryDate(text(r,"deliveryDate"));
        if (create || r.containsKey("currency")) p.setCurrency(text(r,"currency"));
        if (create || r.containsKey("terms")) p.setTerms(text(r,"terms"));
        if (create || r.containsKey("gstType")) p.setGstType(text(r,"gstType"));
        if (create || r.containsKey("incoterm")) p.setIncoterm(text(r,"incoterm"));
        if (create || r.containsKey("transportMode")) p.setTransportMode(text(r,"transportMode"));
        if (create || r.containsKey("warehouse")) p.setWarehouse(text(r,"warehouse"));
        if (create || r.containsKey("costCenter")) p.setCostCenter(text(r,"costCenter"));
        if (create || r.containsKey("location")) p.setLocation(text(r,"location"));
        if (create || r.containsKey("department")) p.setDepartment(text(r,"department"));
        if (create || r.containsKey("project")) p.setProject(text(r,"project"));
        if (create || r.containsKey("deliveryAddress")) p.setDeliveryAddress(text(r,"deliveryAddress"));
        if (create || r.containsKey("deliveryInstructions")) p.setDeliveryInstructions(text(r,"deliveryInstructions"));
        if (create || r.containsKey("deliveryTerms")) p.setDeliveryTerms(text(r,"deliveryTerms"));
        if (create || r.containsKey("warranty")) p.setWarranty(text(r,"warranty"));
        if (create || r.containsKey("notes")) p.setNotes(text(r,"notes"));
        if (create || r.containsKey("internalNotes")) p.setInternalNotes(text(r,"internalNotes"));
        if (create || r.containsKey("vendorNotes")) p.setVendorNotes(text(r,"vendorNotes"));
        if (create || r.containsKey("termsAndConditions")) p.setTermsAndConditions(text(r,"termsAndConditions"));
        if (create || r.containsKey("nfaId")) p.setNfaId(text(r,"nfaId"));
        if (create || r.containsKey("nfaNo")) p.setNfaNo(text(r,"nfaNo"));
        if (create || r.containsKey("freight")) p.setFreight(decimal(r,"freight"));
        if (create || r.containsKey("insurance")) p.setInsurance(decimal(r,"insurance"));
        if (create || r.containsKey("discount")) p.setDiscount(decimal(r,"discount"));
        if (create || r.containsKey("charges")) p.setCharges(decimal(r,"charges"));
        if (create || r.containsKey("paymentTermsRequired")) p.setPaymentTermsRequired(Boolean.parseBoolean(text(r,"paymentTermsRequired")));
        if (create || r.containsKey("paymentTerms")) { Object pt=r.get("paymentTerms"); try { p.setPaymentTermsJson(pt==null||"".equals(pt)?"":mapper.writeValueAsString(pt)); } catch(Exception e){ throw new BadRequestException("Invalid payment terms"); } }
        if (create) p.setCreatedBy(audit.currentUserName());
        Object raw=r.get("items");
        if(create || r.containsKey("items")){
        if(!(raw instanceof List<?> list)||list.isEmpty())throw new BadRequestException("At least one PO item is required");
        p.getItems().clear();
        List<BigDecimal> amounts=new ArrayList<>(), discounts=new ArrayList<>(), gst=new ArrayList<>();
        for(Object x:list){ if(!(x instanceof Map<?,?>))throw new BadRequestException("Invalid PO item"); Map<String,Object> i=(Map<String,Object>)x; PurchaseOrderItem line=new PurchaseOrderItem(); line.setOrder(p); line.setItemCode(text(i,"itemCode")); line.setProduct(required(i,"product","PO item")); line.setUom(text(i,"uom")); line.setQty(decimal(i,"qty")); line.setRate(decimal(i,"rate")); line.setDiscount(decimal(i,"discount")); line.setGstRate(decimal(i,"gstRate")); line.setExpectedDate(text(i,"expectedDate")); line.setReceivedQty(decimal(i,"receivedQty")); line.setCancelledQty(decimal(i,"cancelledQty")); if(line.getQty().signum()<=0||line.getRate().signum()<0)throw new BadRequestException("PO quantity must be positive and price non-negative"); p.getItems().add(line); amounts.add(line.getQty().multiply(line.getRate())); discounts.add(line.getDiscount()); gst.add(line.getGstRate()); }
        PurchaseTotals.DocumentTotals totals=PurchaseTotals.compute(amounts,discounts,gst,p.getDiscount(),p.getCharges().add(p.getFreight()==null?BigDecimal.ZERO:p.getFreight()).add(p.getInsurance()==null?BigDecimal.ZERO:p.getInsurance()),""); p.setAmount(totals.total()); p.setAwardedValue(totals.total());
        }
        if(create){p.setStatus("Draft");p.setApprovalStatus("Pending");}
    }
    private Map<String,Object> response(PurchaseOrder p){Map<String,Object> m=new LinkedHashMap<>();m.put("id",p.getId());m.put("poNo",p.getPoNo());m.put("title",p.getTitle());m.put("vendor",p.getVendor());m.put("reference",p.getReference());m.put("prNo",p.getPrNo());m.put("rfqNo",p.getRfqNo());m.put("quotationNo",p.getQuotationNo());m.put("orderDate",p.getOrderDate());m.put("expectedDate",p.getExpectedDate());m.put("currency",p.getCurrency());m.put("terms",p.getTerms());m.put("deliveryTerms",p.getDeliveryTerms());m.put("deliveryAddress",p.getDeliveryAddress());m.put("deliveryDate",p.getDeliveryDate());m.put("deliveryInstructions",p.getDeliveryInstructions());m.put("gstType",p.getGstType());m.put("incoterm",p.getIncoterm());m.put("transportMode",p.getTransportMode());m.put("warehouse",p.getWarehouse());m.put("department",p.getDepartment());m.put("project",p.getProject());m.put("costCenter",p.getCostCenter());m.put("location",p.getLocation());m.put("warranty",p.getWarranty());m.put("notes",p.getNotes());m.put("internalNotes",p.getInternalNotes());m.put("vendorNotes",p.getVendorNotes());m.put("termsAndConditions",p.getTermsAndConditions());m.put("freight",p.getFreight());m.put("insurance",p.getInsurance());m.put("paymentTerms",paymentTerms(p));m.put("paymentTermsRequired",p.getPaymentTermsRequired());m.put("nfaId",p.getNfaId());m.put("nfaNo",p.getNfaNo());m.put("amount",p.getAmount());m.put("discount",p.getDiscount());m.put("charges",p.getCharges());m.put("status",p.getStatus());m.put("approvalStatus",p.getApprovalStatus());m.put("approvedBy",p.getApprovedBy());m.put("approvalDate",p.getApprovalDate());m.put("rejectedBy",p.getRejectedBy());m.put("releasedBy",p.getReleasedBy());m.put("releasedAt",p.getReleasedAt());m.put("acknowledgedAt",p.getAcknowledgedAt());m.put("acknowledgedBy",p.getAcknowledgedBy());m.put("deliveryStatus",p.getDeliveryStatus());m.put("items",p.getItems().stream().map(i->{Map<String,Object>x=new LinkedHashMap<>();x.put("itemCode",i.getItemCode());x.put("product",i.getProduct());x.put("uom",i.getUom());x.put("qty",i.getQty());x.put("rate",i.getRate());x.put("discount",i.getDiscount());x.put("gstRate",i.getGstRate());x.put("receivedQty",i.getReceivedQty());x.put("pendingQty",i.getQty().subtract(i.getReceivedQty()).subtract(i.getCancelledQty()));x.put("cancelledQty",i.getCancelledQty());x.put("expectedDate",i.getExpectedDate());return x;}).toList());return m;}
    private Object paymentTerms(PurchaseOrder p){String j=p.getPaymentTermsJson();if(j==null||j.isBlank())return null;try{return mapper.readValue(j,Map.class);}catch(Exception e){return null;}}
    private void require(PurchaseOrder p,String s){if(!s.equals(p.getStatus()))throw new BadRequestException("Expected status "+s+" but was "+p.getStatus());}
    private String text(Map<String,Object> m,String k){Object v=m.get(k);return v==null?"":String.valueOf(v);}
    private String required(Map<String,Object>m,String k,String l){String v=text(m,k);if(v.isBlank())throw new BadRequestException(l+" is required");return v;}
    private BigDecimal decimal(Map<String,Object>m,String k){String v=text(m,k);if(v.isBlank())return BigDecimal.ZERO;try{return new BigDecimal(v).setScale(2,RoundingMode.HALF_UP);}catch(Exception e){throw new BadRequestException("Invalid amount: "+k);}}
}
