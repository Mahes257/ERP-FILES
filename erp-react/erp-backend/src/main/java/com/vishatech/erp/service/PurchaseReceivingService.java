package com.vishatech.erp.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.*;
import com.vishatech.erp.exception.*;
import com.vishatech.erp.repository.*;
import com.vishatech.erp.util.*;
import java.math.BigDecimal;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseReceivingService {
 private final PurchaseGrnRepository grns; private final PurchaseInspectionRepository inspections; private final PurchaseOrderRepository orders; private final PurchaseNumbering numbering; private final AuditContext audit; private final PurchaseSupportService support; private final PurchaseNotificationPublisher notifications; private final PurchaseManufacturingJobRepository mfgJobs; private final PurchaseShipmentRepository shipments; private final PurchaseInventoryMovementRepository inventory; private final ObjectMapper mapper=new ObjectMapper();
 public PurchaseReceivingService(PurchaseGrnRepository g,PurchaseInspectionRepository i,PurchaseOrderRepository o,PurchaseNumbering n,AuditContext a,PurchaseSupportService s,PurchaseNotificationPublisher p,PurchaseManufacturingJobRepository m,PurchaseShipmentRepository sh,PurchaseInventoryMovementRepository inv){grns=g;inspections=i;orders=o;numbering=n;audit=a;support=s;notifications=p;mfgJobs=m;shipments=sh;inventory=inv;}
 @Transactional public Map<String,Object> createGrn(Map<String,Object> r){
  String poNo=text(r,"poNo"); PurchaseOrder po=orders.findByPoNo(poNo).orElseThrow(()->new ResourceNotFoundException("Purchase order not found"));
  if(!List.of("Released","Supplier Acknowledged","In Progress","Partially Delivered").contains(po.getStatus()))throw new BadRequestException("Only released POs can receive goods");
  String no=text(r,"grnNo"); if(no.isBlank())no=numbering.nextGrnNo(numbering.maxSequence(grns.findAll().stream().map(PurchaseGrn::getGrnNo).toList(),"GRN")); if(grns.existsByGrnNo(no))throw new BadRequestException("GRN number already exists");
  PurchaseGrn g=new PurchaseGrn();g.setGrnNo(no);g.setPoNo(poNo);g.setSupplier(po.getVendor());g.setWarehouse(text(r,"warehouse"));g.setReceivedBy(audit.currentUserName());g.setNotes(text(r,"notes"));g.setStatus("Expected");
  for(PurchaseOrderItem pi:po.getItems()){PurchaseGrnItem x=new PurchaseGrnItem();x.setGrn(g);x.setProduct(pi.getProduct());x.setPoItemCode(pi.getItemCode());x.setOrderedQty(pi.getQty());x.setPreviouslyReceivedQty(pi.getReceivedQty());x.setPendingQty(pi.getQty().subtract(pi.getReceivedQty()));g.getItems().add(x);}
  grns.save(g);support.log(PurchaseSupportService.DOC_PO,po.getId(),"grn","GRN created",no);
  notifications.publish(PurchaseNotificationPublisher.EVENT_GRN_PENDING,
          "GRN " + no + " pending receipt",
          "Goods receipt " + no + " for purchase order " + poNo + " (" + po.getVendor()
                  + ") is awaiting goods receipt.",
          g.getId(), "PurchaseGrn");
  return grn(g);
 }
 @Transactional public Map<String,Object> receive(String id,List<Map<String,Object>> input){
  PurchaseGrn g=resolveGrn(id);if(!"Expected".equals(g.getStatus()))throw new BadRequestException("GRN has already been received");PurchaseOrder po=orders.findByPoNo(g.getPoNo()).orElseThrow(()->new ResourceNotFoundException("Purchase order not found"));
  for(PurchaseGrnItem x:g.getItems()){Map<String,Object> in=input.stream().filter(m->text(m,"product").equals(x.getProduct())).findFirst().orElse(Map.of());BigDecimal qty=decimal(in,"received",x.getPendingQty());if(qty.signum()<0||qty.compareTo(x.getPendingQty())>0)throw new BadRequestException("Received quantity exceeds pending quantity for "+x.getProduct());x.setReceivedQty(qty);x.setPendingQty(x.getOrderedQty().subtract(x.getPreviouslyReceivedQty()).subtract(qty));PurchaseOrderItem pi=po.getItems().stream().filter(p->p.getProduct().equals(x.getProduct())).findFirst().orElseThrow(()->new BadRequestException("PO item not found"));pi.setReceivedQty(pi.getReceivedQty().add(qty));}
  g.setReceiptDate(LocalDate.now());g.setReceivedBy(audit.currentUserName());g.setStatus("Pending Inspection");
  boolean complete=po.getItems().stream().allMatch(p->p.getReceivedQty().compareTo(p.getQty())>=0);
  po.setStatus(complete?"Completed":"Partially Delivered");
  orders.save(po);grns.save(g);
  support.log(PurchaseSupportService.DOC_PO,po.getId(),"receive","Goods received",g.getGrnNo(),"Expected","Pending Inspection");
  support.log("GRN",g.getId(),"receive","Goods received against " + g.getGrnNo(),g.getSupplier(),"Expected","Pending Inspection");
  return grn(g);
 }
 @Transactional public Map<String,Object> createInspection(Map<String,Object> r){
  PurchaseGrn g=grns.findByGrnNo(text(r,"grnNo")).orElseThrow(()->new ResourceNotFoundException("GRN not found"));if("Expected".equals(g.getStatus()))throw new BadRequestException("GRN must be received before inspection");
  PurchaseInspection q=new PurchaseInspection();q.setInspectionNo(text(r,"inspectionNo").isBlank()?"QI-"+System.currentTimeMillis():text(r,"inspectionNo"));q.setGrnNo(g.getGrnNo());q.setInspectionDate(LocalDate.now());q.setInspector(text(r,"inspector"));q.setRemarks(text(r,"remarks"));q.setStatus("Pending");q.setItemsJson(json(r.get("items")));inspections.save(q);
  support.log("GRN",g.getId(),"inspection","Inspection " + q.getInspectionNo() + " created","Awaiting pass/fail decision",null,"Pending");
  notifications.publish(PurchaseNotificationPublisher.EVENT_INSPECTION_PENDING,
          "Inspection " + q.getInspectionNo() + " pending",
          "Quality inspection " + q.getInspectionNo() + " for GRN " + g.getGrnNo()
                  + " is awaiting the pass/fail decision.",
          q.getId(), "PurchaseInspection");
  return inspection(q);
 }
 @Transactional public Map<String,Object> updateInspection(Long id,Map<String,Object> r){
  PurchaseInspection q=inspections.findById(id).orElseThrow(()->new ResourceNotFoundException("Inspection not found"));String status=text(r,"status");if(!List.of("Pending","In Progress","Passed","Failed","Partially Accepted").contains(status))throw new BadRequestException("Invalid inspection status");if("Failed".equals(status)&&text(r,"rejectionReason").isBlank())throw new BadRequestException("Rejection reason is required");q.setStatus(status);q.setRejectionReason(text(r,"rejectionReason"));q.setRemarks(text(r,"remarks"));if(r.containsKey("items"))q.setItemsJson(json(r.get("items")));  inspections.save(q);PurchaseGrn g=grns.findByGrnNo(q.getGrnNo()).orElseThrow(()->new ResourceNotFoundException("GRN not found"));g.setStatus(List.of("Passed","Partially Accepted").contains(status)?"Received":g.getStatus());grns.save(g);
  support.log("GRN",g.getId(),"inspection","Inspection " + status,q.getInspector(),"Pending",status);
  return inspection(q);
 }
 public PurchaseGrn getGrn(Long id){return grns.findById(id).orElseThrow(()->new ResourceNotFoundException("GRN not found"));}
 /** Resolves a GRN by primary key OR by its business number — the UI routes
  * and links use the GRN number, while list rows carry the numeric id. */
 public PurchaseGrn resolveGrn(String id){String key=id==null?"":id.trim();if(key.isBlank())throw new ResourceNotFoundException("GRN not found");if(key.matches("\\d+"))return grns.findById(Long.valueOf(key)).orElseThrow(()->new ResourceNotFoundException("GRN not found"));return grns.findByGrnNo(key).orElseThrow(()->new ResourceNotFoundException("GRN not found"));}
 @Transactional public Map<String,Object> updateGrn(String id,Map<String,Object> r){
  PurchaseGrn g=resolveGrn(id);
  if(!"Expected".equals(g.getStatus()))throw new BadRequestException("Only expected GRNs can be edited");
  if(r.containsKey("warehouse"))g.setWarehouse(text(r,"warehouse"));
  if(r.containsKey("notes"))g.setNotes(text(r,"notes"));
  if(r.containsKey("items"))applyGrnItems(g,r.get("items"));
  grns.save(g);
  support.log("GRN",g.getId(),"update","GRN updated",g.getGrnNo());
  return grn(g);
 }
 @Transactional(readOnly=true) public Map<String,Object> getGrnResponse(String id){return grn(resolveGrn(id));}
 /**
  * Paged GRN list — ONE page of rows per request (default 25, never more
  * than {@link #MAX_PAGE_SIZE}). Filtering, searching and sorting run in
  * the database so the payload stays bounded no matter how large the
  * table grows. Line items for the page are loaded in a single query.
  */
 @Transactional(readOnly=true) public Page<Map<String,Object>> listGrns(int page,int size,String search,String status,String vendor,String poNo,String sort){
  Page<PurchaseGrn> result=grns.findAll(grnSpec(search,status,vendor,poNo),
    pageable(page,size,sort,"createdAt","createdAt","updatedAt","grnNo","poNo","supplier","warehouse","status","receivedBy","receiptDate"));
  List<Long> ids=result.getContent().stream().map(PurchaseGrn::getId).toList();
  Map<Long,PurchaseGrn> withItems=ids.isEmpty()?Map.of():grns.findAllWithItemsByIds(ids).stream().collect(Collectors.toMap(PurchaseGrn::getId,g->g,(a,b)->a));
  return result.map(g->grn(withItems.getOrDefault(g.getId(),g)));
 }
 @Transactional(readOnly=true) public Map<String,Object> nextGrnNumber(){List<String> numbers=grns.findAll().stream().map(PurchaseGrn::getGrnNo).toList();long max=numbering.maxSequence(numbers,"GRN");return Map.of("grnNo",numbering.nextGrnNo(max),"nextNumber",max+1);}
 /** Paged inspection list; the GRN behind each row is resolved in ONE query. */
 @Transactional(readOnly=true) public Page<Map<String,Object>> listInspections(int page,int size,String search,String status,String grnNo,String sort){
  Page<PurchaseInspection> result=inspections.findAll(inspectionSpec(search,status,grnNo),
    pageable(page,size,sort,"createdAt","createdAt","inspectionNo","grnNo","inspector","status","inspectionDate"));
  List<String> grnNos=result.getContent().stream().map(PurchaseInspection::getGrnNo).filter(Objects::nonNull).distinct().toList();
  Map<String,PurchaseGrn> index=new HashMap<>();
  if(!grnNos.isEmpty())for(PurchaseGrn g:grns.findByGrnNoIn(grnNos))index.put(g.getGrnNo(),g);
  return result.map(q->inspection(q,index));
 }

 /** Resolves an inspection by primary key OR by its business number. */
 @Transactional(readOnly=true) public Map<String,Object> getInspection(String id){
  String key=id==null?"":id.trim();
  if(key.isBlank())throw new ResourceNotFoundException("Inspection not found");
  PurchaseInspection q=key.matches("\\d+")?inspections.findById(Long.valueOf(key)).orElse(null):null;
  if(q==null)q=inspections.findByInspectionNo(key).orElseThrow(()->new ResourceNotFoundException("Inspection not found"));
  return inspection(q);
 }

 /** GRN dashboard counts — every figure is a database count. */
 @Transactional(readOnly=true) public Map<String,Object> grnStats(){
  Map<String,Object>m=new LinkedHashMap<>();
  m.put("total",grns.countBy());m.put("expected",grns.countByStatus("Expected"));
  m.put("received",grns.countByStatus("Received"));m.put("pendingInspection",grns.countByStatus("Pending Inspection"));
  return m;
 }

 /** Inspection dashboard counts — every figure is a database count. */
 @Transactional(readOnly=true) public Map<String,Object> inspectionStats(){
  Map<String,Object>m=new LinkedHashMap<>();
  m.put("total",inspections.countBy());m.put("pending",inspections.countByStatus("Pending"));
  m.put("inProgress",inspections.countByStatus("In Progress"));m.put("passed",inspections.countByStatus("Passed"));
  m.put("failed",inspections.countByStatus("Failed"));m.put("partiallyAccepted",inspections.countByStatus("Partially Accepted"));
  return m;
 }
 // ==================== Server-side paging ====================
 /*
  * Purchase Receiving lists are readable only as bounded pages: the client
  * asks for one page (page/size/sort) and the database answers with exactly
  * that slice plus the total. Size is clamped here, so no request — however
  * it is crafted — can ask the server to materialise the whole table.
  */
 private static final int DEFAULT_PAGE_SIZE=25;
 private static final int MAX_PAGE_SIZE=100;
 private static String trimmed(String v){return v==null||v.isBlank()?null:v.trim();}
 private static boolean hasText(String v){return v!=null&&!v.isBlank();}
 private static String like(String search){return "%"+search.trim().toLowerCase()+"%";}
 private static Predicate contains(CriteriaBuilder cb,Expression<String> path,String pattern){return cb.like(cb.lower(path),pattern);}
 private static Predicate allOf(CriteriaBuilder cb,List<Predicate> predicates){return predicates.isEmpty()?cb.conjunction():cb.and(predicates.toArray(new Predicate[0]));}
 /** Whitelisted sort: unknown fields fall back to the default, newest first. */
 private static Sort buildSort(String sort,String defaultField,String... allowed){
  String raw=trimmed(sort);String field=defaultField;boolean desc=true;
  if(raw!=null){
   String[] parts=raw.split(",");
   String candidate=parts[0].trim();
   if(candidate.startsWith("-"))candidate=candidate.substring(1);
   else if(parts.length>1&&hasText(parts[1]))desc=!"asc".equalsIgnoreCase(parts[1].trim());
   if(List.of(allowed).contains(candidate))field=candidate;
  }
  return Sort.by(desc?Sort.Direction.DESC:Sort.Direction.ASC,field);
 }
 /** One page, size clamped to [1, MAX_PAGE_SIZE] with a 25-row default. */
 private static Pageable pageable(int page,int size,String sort,String defaultField,String... allowed){
  return PageRequest.of(Math.max(0,page),size<=0?DEFAULT_PAGE_SIZE:Math.min(size,MAX_PAGE_SIZE),buildSort(sort,defaultField,allowed));
 }
 private static Specification<PurchaseGrn> grnSpec(String search,String status,String vendor,String poNo){
  return (root,query,cb)->{List<Predicate> p=new ArrayList<>();
   if(hasText(status))p.add(cb.equal(root.get("status"),status.trim()));
   if(hasText(vendor))p.add(cb.equal(root.get("supplier"),vendor.trim()));
   if(hasText(poNo))p.add(cb.equal(root.get("poNo"),poNo.trim()));
   if(hasText(search)){String q=like(search);
    p.add(cb.or(contains(cb,root.<String>get("grnNo"),q),contains(cb,root.<String>get("poNo"),q),contains(cb,root.<String>get("supplier"),q),contains(cb,root.<String>get("warehouse"),q),contains(cb,root.<String>get("receivedBy"),q),contains(cb,root.<String>get("status"),q),contains(cb,root.<String>get("notes"),q)));}
   return allOf(cb,p);};
 }
 private static Specification<PurchaseInspection> inspectionSpec(String search,String status,String grnNo){
  return (root,query,cb)->{List<Predicate> p=new ArrayList<>();
   if(hasText(status))p.add(cb.equal(root.get("status"),status.trim()));
   if(hasText(grnNo))p.add(cb.equal(root.get("grnNo"),grnNo.trim()));
   if(hasText(search)){String q=like(search);
    p.add(cb.or(contains(cb,root.<String>get("inspectionNo"),q),contains(cb,root.<String>get("grnNo"),q),contains(cb,root.<String>get("inspector"),q),contains(cb,root.<String>get("status"),q),contains(cb,root.<String>get("remarks"),q),contains(cb,root.<String>get("rejectionReason"),q)));}
   return allOf(cb,p);};
 }
 private static Specification<PurchaseManufacturingJob> mfgSpec(String search,String status,String poNo){
  return (root,query,cb)->{List<Predicate> p=new ArrayList<>();
   if(hasText(status))p.add(cb.equal(root.get("status"),status.trim()));
   if(hasText(poNo))p.add(cb.equal(root.get("poNo"),poNo.trim()));
   if(hasText(search)){String q=like(search);
    p.add(cb.or(contains(cb,root.<String>get("mfrNo"),q),contains(cb,root.<String>get("poNo"),q),contains(cb,root.<String>get("vendor"),q),contains(cb,root.<String>get("product"),q),contains(cb,root.<String>get("status"),q),contains(cb,root.<String>get("warehouse"),q),contains(cb,root.<String>get("notes"),q)));}
   return allOf(cb,p);};
 }
 private static Specification<PurchaseShipment> shipSpec(String search,String status,String poNo,String vendor){
  return (root,query,cb)->{List<Predicate> p=new ArrayList<>();
   if(hasText(status))p.add(cb.equal(root.get("status"),status.trim()));
   if(hasText(poNo))p.add(cb.equal(root.get("poNo"),poNo.trim()));
   if(hasText(vendor))p.add(cb.equal(root.get("vendor"),vendor.trim()));
   if(hasText(search)){String q=like(search);
    p.add(cb.or(contains(cb,root.<String>get("shipmentNo"),q),contains(cb,root.<String>get("poNo"),q),contains(cb,root.<String>get("packingNo"),q),contains(cb,root.<String>get("vendor"),q),contains(cb,root.<String>get("carrier"),q),contains(cb,root.<String>get("mode"),q),contains(cb,root.<String>get("destination"),q),contains(cb,root.<String>get("status"),q),contains(cb,root.<String>get("trackingNo"),q),contains(cb,root.<String>get("notes"),q)));}
   return allOf(cb,p);};
 }
 private static Specification<PurchaseInventoryMovement> movementSpec(String search,String type,String warehouse,String sku,String product,String reference,String inspectionNo){
  return (root,query,cb)->{List<Predicate> p=new ArrayList<>();
   if(hasText(type))p.add(cb.equal(root.get("type"),type.trim()));
   if(hasText(warehouse))p.add(cb.equal(root.get("warehouse"),warehouse.trim()));
   if(hasText(sku))p.add(cb.equal(root.get("sku"),sku.trim()));
   if(hasText(product))p.add(cb.equal(root.get("product"),product.trim()));
   if(hasText(reference))p.add(cb.equal(root.get("reference"),reference.trim()));
   if(hasText(inspectionNo))p.add(cb.equal(root.get("inspectionNo"),inspectionNo.trim()));
   if(hasText(search)){String q=like(search);
    p.add(cb.or(contains(cb,root.<String>get("movementNo"),q),contains(cb,root.<String>get("sku"),q),contains(cb,root.<String>get("product"),q),contains(cb,root.<String>get("warehouse"),q),contains(cb,root.<String>get("location"),q),contains(cb,root.<String>get("type"),q),contains(cb,root.<String>get("reference"),q),contains(cb,root.<String>get("notes"),q),contains(cb,root.<String>get("inspectionNo"),q),contains(cb,root.<String>get("poNo"),q),contains(cb,root.<String>get("grnNo"),q),contains(cb,root.<String>get("updatedBy"),q)));}
   return allOf(cb,p);};
 }
 /** Item ledger scope: by SKU when given, otherwise by product name. */
 private static Specification<PurchaseInventoryMovement> ledgerSpec(String sku,String product,String warehouse){
  return (root,query,cb)->{List<Predicate> p=new ArrayList<>();
   p.add(sku.isBlank()?cb.equal(root.get("product"),product):cb.equal(root.get("sku"),sku));
   if(!warehouse.isBlank())p.add(cb.equal(root.get("warehouse"),warehouse));
   return allOf(cb,p);};
 }

 private Map<String,Object> grn(PurchaseGrn g){Map<String,Object>m=new LinkedHashMap<>();m.put("id",g.getId());m.put("grnNo",g.getGrnNo());m.put("poNo",g.getPoNo());m.put("vendor",g.getSupplier());m.put("supplier",g.getSupplier());m.put("warehouse",g.getWarehouse());m.put("status",g.getStatus());m.put("receivedOn",g.getReceiptDate());m.put("receivedBy",g.getReceivedBy());m.put("notes",g.getNotes());m.put("items",g.getItems().stream().map(x->{Map<String,Object>i=new LinkedHashMap<>();i.put("product",x.getProduct());i.put("qty",x.getOrderedQty());i.put("orderedQty",x.getOrderedQty());i.put("previouslyReceived",x.getPreviouslyReceivedQty());i.put("received",x.getReceivedQty());i.put("pending",x.getPendingQty());i.put("acceptedQty",x.getAcceptedQty());i.put("rejectedQty",x.getRejectedQty());return i;}).toList());return m;}
 private Map<String,Object> inspection(PurchaseInspection q){return inspection(q,null);}
 private Map<String,Object> inspection(PurchaseInspection q,Map<String,PurchaseGrn> grnIndex){Map<String,Object>m=new LinkedHashMap<>();PurchaseGrn g=grnIndex!=null?grnIndex.get(q.getGrnNo()):grns.findByGrnNo(q.getGrnNo()).orElse(null);m.put("id",q.getId());m.put("inspectionNo",q.getInspectionNo());m.put("grnNo",q.getGrnNo());m.put("poNo",g==null?"":g.getPoNo());m.put("vendor",g==null?"":g.getSupplier());m.put("inspectionDate",q.getInspectionDate());m.put("inspectedOn",q.getInspectionDate());m.put("inspector",q.getInspector());m.put("status",q.getStatus());m.put("rejectionReason",q.getRejectionReason());m.put("remarks",q.getRemarks());m.put("items",parse(q.getItemsJson()));return m;}
 @SuppressWarnings("unchecked") private void applyGrnItems(PurchaseGrn g,Object raw){
  if(!(raw instanceof List<?> list))throw new BadRequestException("Invalid GRN items");
  for(Object entry:list){if(!(entry instanceof Map<?,?>))continue;Map<String,Object> m=(Map<String,Object>)entry;
   String product=text(m,"product");if(product.isBlank())continue;
   PurchaseGrnItem x=g.getItems().stream().filter(i->product.equals(i.getProduct())).findFirst().orElse(null);if(x==null)continue;
   BigDecimal qty=decimal(m,"qty",x.getOrderedQty());
   if(qty.signum()<0)throw new BadRequestException("Quantity cannot be negative for "+product);
   x.setOrderedQty(qty);x.setPendingQty(qty.subtract(x.getPreviouslyReceivedQty()).subtract(x.getReceivedQty()));}
 }
 // ==================== Manufacturing / Packing ====================
 @Transactional public Map<String,Object> createManufacturingJob(Map<String,Object> r){
  String poNo=text(r,"poNo"); PurchaseOrder po=orders.findByPoNo(poNo).orElseThrow(()->new ResourceNotFoundException("Purchase order not found"));
  String no=text(r,"mfrNo"); if(no.isBlank())no=numbering.nextMfrNo(numbering.maxSequence(mfgJobs.findAll().stream().map(PurchaseManufacturingJob::getMfrNo).toList(),"MFR"));
  if(mfgJobs.existsByMfrNo(no))throw new BadRequestException("MFR number already exists");
  if(mfgJobs.existsByPoNo(poNo))throw new BadRequestException("A packing job already exists for " + poNo);
  BigDecimal totalQty=po.getItems().stream().map(p->p.getQty()).reduce(BigDecimal.ZERO,BigDecimal::add);
  String itemsJson=json(po.getItems().stream().map(item->{Map<String,Object>m=new LinkedHashMap<>();m.put("product",item.getProduct());m.put("hsn",item.getHsn());m.put("uom",item.getUom());m.put("qty",item.getQty());m.put("packedQty",0);m.put("expectedRate",item.getRate());return m;}).toList());
  PurchaseManufacturingJob j=new PurchaseManufacturingJob();j.setMfrNo(no);j.setPoNo(poNo);j.setVendor(po.getVendor());j.setProduct(text(r,"product").isBlank()?po.getItems().get(0).getProduct():text(r,"product"));
  j.setQty(decimal(r,"qty",totalQty));j.setPackedQty(BigDecimal.ZERO);j.setStatus("In Production");j.setProgress(0);
  LocalDate start=parseDate(r,"startDate");j.setStartDate(start==null?LocalDate.now():start);j.setExpectedDate(parseDate(r,"expectedDate"));j.setWarehouse(text(r,"warehouse"));j.setNotes(text(r,"notes"));j.setItemsJson(itemsJson);
  mfgJobs.save(j);return mfr(j);
 }
 @Transactional public Map<String,Object> updateManufacturing(Long id,Map<String,Object> r){
  PurchaseManufacturingJob j=mfgJobs.findById(id).orElseThrow(()->new ResourceNotFoundException("Packing record not found"));
  if(r.containsKey("status"))j.setStatus(text(r,"status"));
  if(r.containsKey("progress"))j.setProgress((int)decimal(r,"progress",BigDecimal.valueOf(j.getProgress())).longValue());
  if(r.containsKey("packedQty"))j.setPackedQty(decimal(r,"packedQty",j.getPackedQty()));
  if(r.containsKey("notes"))j.setNotes(text(r,"notes"));
  if(r.containsKey("warehouse"))j.setWarehouse(text(r,"warehouse"));if(r.containsKey("qty")){BigDecimal q=decimal(r,"qty",j.getQty());if(q.signum()<0)throw new BadRequestException("Quantity cannot be negative");if(q.compareTo(j.getPackedQty())<0)throw new BadRequestException("Quantity cannot be less than the packed quantity");j.setQty(q);}if(r.containsKey("product"))j.setProduct(text(r,"product"));if(r.containsKey("startDate")){LocalDate s=parseDate(r,"startDate");if(s!=null)j.setStartDate(s);}if(r.containsKey("expectedDate"))j.setExpectedDate(parseDate(r,"expectedDate"));
  mfgJobs.save(j);return mfr(j);
 }
 @Transactional(readOnly=true) public Map<String,Object> getManufacturing(Long id){return mfr(mfgJobs.findById(id).orElseThrow(()->new ResourceNotFoundException("Packing record not found")));}
 @Transactional(readOnly=true) public Map<String,Object> getManufacturingByNo(String no){return mfr(mfgJobs.findByMfrNo(no).orElseThrow(()->new ResourceNotFoundException("Packing record not found")));}
 /** Paged packing-job list — one bounded page per request. */
 @Transactional(readOnly=true) public Page<Map<String,Object>> listManufacturing(int page,int size,String search,String status,String poNo,String sort){
  return mfgJobs.findAll(mfgSpec(search,status,poNo),
    pageable(page,size,sort,"createdAt","createdAt","updatedAt","mfrNo","poNo","vendor","product","status","startDate","expectedDate","warehouse")).map(this::mfr);
 }
 @Transactional(readOnly=true) public Map<String,Object> nextMfrNumber(){List<String> numbers=mfgJobs.findAll().stream().map(PurchaseManufacturingJob::getMfrNo).toList();long max=numbering.maxSequence(numbers,"MFR");return Map.of("mfrNo",numbering.nextMfrNo(max));}
 @Transactional(readOnly=true) public Map<String,Object> manufacturingStats(){
  Map<String,Object>m=new LinkedHashMap<>();
  m.put("total",mfgJobs.countBy());m.put("inProduction",mfgJobs.countByStatus("In Production"));
  m.put("packed",mfgJobs.countByStatus("Packed"));m.put("ready",mfgJobs.countByStatus("Ready to Ship"));
  return m;
 }
 private Map<String,Object> mfr(PurchaseManufacturingJob j){Map<String,Object>m=new LinkedHashMap<>();m.put("id",j.getId());m.put("packingNo",j.getMfrNo());m.put("mfrNo",j.getMfrNo());m.put("poNo",j.getPoNo());m.put("vendor",j.getVendor());m.put("product",j.getProduct());m.put("qty",j.getQty());m.put("packedQty",j.getPackedQty());m.put("status",j.getStatus());m.put("progress",j.getProgress());m.put("startDate",j.getStartDate());m.put("expectedDate",j.getExpectedDate());m.put("warehouse",j.getWarehouse());m.put("notes",j.getNotes());m.put("items",parse(j.getItemsJson()));m.put("createdAt",j.getCreatedAt());return m;}
 // ==================== Shipments ====================
 @Transactional public Map<String,Object> createShipment(Map<String,Object> r){
  String poNo=text(r,"poNo"); PurchaseOrder po=orders.findByPoNo(poNo).orElseThrow(()->new ResourceNotFoundException("Purchase order not found"));
  String no=text(r,"shipmentNo"); if(no.isBlank())no=numbering.nextShipmentNo(numbering.maxSequence(shipments.findAll().stream().map(PurchaseShipment::getShipmentNo).toList(),"SHP"));
  if(shipments.existsByShipmentNo(no))throw new BadRequestException("Shipment number already exists");
  PurchaseShipment s=new PurchaseShipment();s.setShipmentNo(no);s.setPoNo(poNo);s.setPackingNo(text(r,"packingNo"));s.setVendor(po.getVendor());
  s.setCarrier(text(r,"carrier"));s.setMode(text(r,"mode").isBlank()?"Road":text(r,"mode"));
  s.setDispatchDate(parseDate(r,"dispatchDate"));s.setEta(parseDate(r,"eta"));
  s.setDestination(text(r,"destination"));s.setStatus(text(r,"status").isBlank()?"Pending Dispatch":text(r,"status"));
  s.setTrackingNo(text(r,"trackingNo"));s.setNotes(text(r,"notes"));
  shipments.save(s);return ship(s);
 }
 @Transactional public Map<String,Object> updateShipment(Long id,Map<String,Object> r){
  PurchaseShipment s=shipments.findById(id).orElseThrow(()->new ResourceNotFoundException("Shipment not found"));
  if(r.containsKey("status"))s.setStatus(text(r,"status"));
  if(r.containsKey("carrier"))s.setCarrier(text(r,"carrier"));
  if(r.containsKey("mode"))s.setMode(text(r,"mode"));
  if(r.containsKey("trackingNo"))s.setTrackingNo(text(r,"trackingNo"));
  if(r.containsKey("dispatchDate"))s.setDispatchDate(parseDate(r,"dispatchDate"));
  if(r.containsKey("eta"))s.setEta(parseDate(r,"eta"));
  if(r.containsKey("destination"))s.setDestination(text(r,"destination"));
  if(r.containsKey("notes"))s.setNotes(text(r,"notes"));
  shipments.save(s);return ship(s);
 }
 @Transactional(readOnly=true) public Map<String,Object> getShipment(Long id){return ship(shipments.findById(id).orElseThrow(()->new ResourceNotFoundException("Shipment not found")));}
 /** Paged shipment list — one bounded page per request. */
 @Transactional(readOnly=true) public Page<Map<String,Object>> listShipments(int page,int size,String search,String status,String poNo,String vendor,String sort){
  return shipments.findAll(shipSpec(search,status,poNo,vendor),
    pageable(page,size,sort,"createdAt","createdAt","updatedAt","shipmentNo","poNo","packingNo","vendor","carrier","mode","status","dispatchDate","eta","destination")).map(this::ship);
 }
 @Transactional(readOnly=true) public Map<String,Object> shipmentStats(){
  Map<String,Object>m=new LinkedHashMap<>();
  m.put("total",shipments.countBy());m.put("pending",shipments.countByStatus("Pending Dispatch"));
  m.put("inTransit",shipments.countByStatus("In Transit"));m.put("delivered",shipments.countByStatus("Delivered"));
  m.put("delayed",shipments.countByStatus("Delayed"));
  return m;
 }
 private Map<String,Object> ship(PurchaseShipment s){Map<String,Object>m=new LinkedHashMap<>();m.put("id",s.getId());m.put("shipmentNo",s.getShipmentNo());m.put("poNo",s.getPoNo());m.put("packingNo",s.getPackingNo());m.put("vendor",s.getVendor());m.put("carrier",s.getCarrier());m.put("mode",s.getMode());m.put("dispatchDate",s.getDispatchDate());m.put("eta",s.getEta());m.put("destination",s.getDestination());m.put("status",s.getStatus());m.put("trackingNo",s.getTrackingNo());m.put("receivedOn",s.getReceivedOn());m.put("notes",s.getNotes());m.put("createdAt",s.getCreatedAt());return m;}
 // ==================== Inventory Update (stock movement ledger) ====================
 /** Paged inventory ledger list — one bounded page per request. */
 @Transactional(readOnly=true) public Page<Map<String,Object>> listInventory(int page,int size,String search,String type,String warehouse,String sku,String product,String reference,String inspectionNo,String sort){
  return inventory.findAll(movementSpec(search,type,warehouse,sku,product,reference,inspectionNo),
    pageable(page,size,sort,"createdAt","createdAt","updatedAt","movementNo","sku","product","warehouse","location","type","reference","updatedOn","inspectionNo","poNo","grnNo","updatedBy")).map(this::mov);
 }
 @Transactional(readOnly=true) public Map<String,Object> getInventoryMovement(String id){return mov(resolveMovement(id));}
 @Transactional(readOnly=true) public List<Map<String,Object>> inventoryByInspection(String inspectionNo){return inventory.findByInspectionNo(inspectionNo).stream().map(this::mov).toList();} @Transactional(readOnly=true) public Map<String,Object> inventoryStats(){
  Map<String,Object>m=new LinkedHashMap<>();
  m.put("total",inventory.countBy());
  m.put("receipts",inventory.countByType("Receipt"));
  m.put("issues",inventory.countByType("Issue"));
  m.put("adjustments",inventory.countByType("Adjustment"));
  m.put("transfers",inventory.countByTypeAndDirection("Transfer","Out"));
  m.put("netMovement",inventory.sumDelta());
  return m;
 }

 @Transactional(readOnly=true) public Map<String,Object> inventoryLedger(String sku,String product,String warehouse){
  String sk=sku==null?"":sku.trim(), pr=product==null?"":product.trim(), wh=warehouse==null?"":warehouse.trim();
  List<PurchaseInventoryMovement> rows=inventory.findAll(ledgerSpec(sk,pr,wh));
  List<Map<String,Object>> records=new ArrayList<>(rows.stream().map(this::mov).toList());
  records.sort((a,b)->String.valueOf(b.get("createdAt")).compareTo(String.valueOf(a.get("createdAt"))));
  BigDecimal onHand=rows.stream().map(PurchaseInventoryMovement::getDelta).reduce(BigDecimal.ZERO,BigDecimal::add);
  BigDecimal netIn=rows.stream().map(x->x.getDelta().max(BigDecimal.ZERO)).reduce(BigDecimal.ZERO,BigDecimal::add);
  BigDecimal netOut=rows.stream().map(x->x.getDelta().negate().max(BigDecimal.ZERO)).reduce(BigDecimal.ZERO,BigDecimal::add);
  Map<String,Object> m=new LinkedHashMap<>();
  m.put("records",records);m.put("onHand",onHand);m.put("netIn",netIn);m.put("netOut",netOut);
  m.put("totalMovements",rows.size());
  m.put("receipts",rows.stream().filter(x->"Receipt".equals(x.getType())).count());
  m.put("issues",rows.stream().filter(x->"Issue".equals(x.getType())).count());
  m.put("adjustments",rows.stream().filter(x->"Adjustment".equals(x.getType())).count());
  m.put("lastMovementOn",rows.isEmpty()?"":String.valueOf(rows.get(rows.size()-1).getCreatedAt()));
  return m;
 }
 @Transactional public Map<String,Object> createInventoryMovement(Map<String,Object> r){
  String type=text(r,"type");if(type.isBlank())type="Adjustment";
  if("Transfer".equals(type))throw new BadRequestException("Use the transfer action to move stock between warehouses");
  if(!List.of("Receipt","Issue","Adjustment").contains(type))throw new BadRequestException("Invalid movement type");
  String sku=text(r,"sku").trim(),product=text(r,"product").trim(),warehouse=text(r,"warehouse").trim();
  if(sku.isBlank()&&product.isBlank())throw new BadRequestException("Enter a SKU or product name");
  if(warehouse.isBlank())throw new BadRequestException("Select a warehouse");
  boolean hasQuantity=r.get("quantity")!=null&&!String.valueOf(r.get("quantity")).isBlank();
  boolean hasDelta=r.get("delta")!=null&&!String.valueOf(r.get("delta")).isBlank();
  BigDecimal raw=hasQuantity?decimal(r,"quantity",BigDecimal.ZERO):hasDelta?decimal(r,"delta",BigDecimal.ZERO):BigDecimal.ZERO;
  BigDecimal magnitude=raw.abs();
  /* A receipt always adds stock and an issue always removes it — a stray
     sign must not turn one into the other. Adjustments are signed by the user. */
  BigDecimal delta="Receipt".equals(type)?magnitude:"Issue".equals(type)?magnitude.negate():(hasQuantity||!hasDelta?raw:magnitude);
  boolean hasBefore=r.get("before")!=null&&!String.valueOf(r.get("before")).isBlank();
  BigDecimal before=hasBefore?decimal(r,"before",BigDecimal.ZERO):onHand(sku,product,warehouse);
  BigDecimal after=before.add(delta);
  if(after.compareTo(NEGATIVE_EPSILON)<0&&!Boolean.parseBoolean(text(r,"allowNegative")))
   throw new BadRequestException("Insufficient stock: this movement would take "+(product.isBlank()?sku:product)+" below zero (on hand "+before.stripTrailingZeros().toPlainString()+")");
  PurchaseInventoryMovement m=saveMovement(sku,product,warehouse,type,delta,before,after,r);
  return mov(m);
 }
 @Transactional public Map<String,Object> transferInventory(Map<String,Object> r){
  String sku=text(r,"sku").trim(),product=text(r,"product").trim();
  String fromWh=text(r,"fromWarehouse").trim(),toWh=text(r,"toWarehouse").trim();
  String fromLoc=text(r,"fromLocation").trim(),toLoc=text(r,"toLocation").trim();
  if(sku.isBlank()&&product.isBlank())throw new BadRequestException("Enter a SKU or product name to transfer");
  if(fromWh.isBlank()||toWh.isBlank())throw new BadRequestException("Both source and destination warehouses are required");
  if(fromWh.equals(toWh)&&(fromLoc.isBlank()||fromLoc.equals(toLoc)))throw new BadRequestException("Source and destination must differ (different warehouse or location)");
  BigDecimal qty=decimal(r,"quantity",BigDecimal.ZERO);
  if(qty.signum()<=0)throw new BadRequestException("Enter a quantity greater than zero to transfer");
  String label=product.isBlank()?sku:product;
  BigDecimal sourceBefore=onHand(sku,product,fromWh);
  if(sourceBefore.add(NEGATIVE_EPSILON).compareTo(qty)<0)
   throw new BadRequestException("Insufficient stock: transferring "+qty.stripTrailingZeros().toPlainString()+" would take "+label+" below zero (on hand "+sourceBefore.stripTrailingZeros().toPlainString()+" in "+fromWh+")");
  BigDecimal destinationBefore=onHand(sku,product,toWh);
  PurchaseInventoryMovement out=saveMovement(sku,product,fromWh,"Transfer",qty.negate(),sourceBefore,sourceBefore.subtract(qty),r);
  PurchaseInventoryMovement in=saveMovement(sku,product,toWh,"Transfer",qty,destinationBefore,destinationBefore.add(qty),r);
  String transferRef=text(r,"transferRef").isBlank()?out.getMovementNo():text(r,"transferRef");
  out.setTransferRef(transferRef);out.setDirection("Out");out.setCounterpartNo(in.getMovementNo());
  out.setFromWarehouse(fromWh);out.setToWarehouse(toWh);out.setFromLocation(fromLoc);out.setToLocation(toLoc);out.setLocation(fromLoc);
  in.setTransferRef(transferRef);in.setDirection("In");in.setCounterpartNo(out.getMovementNo());
  in.setFromWarehouse(fromWh);in.setToWarehouse(toWh);in.setFromLocation(fromLoc);in.setToLocation(toLoc);in.setLocation(toLoc);
  if(out.getReference()==null||out.getReference().isBlank())out.setReference("Transfer "+out.getMovementNo()+" → "+in.getMovementNo());
  if(in.getReference()==null||in.getReference().isBlank())in.setReference(out.getReference());
  inventory.save(out);inventory.save(in);
  Map<String,Object> result=new LinkedHashMap<>();result.put("source",mov(out));result.put("destination",mov(in));return result;
 }
 @Transactional public Map<String,Object> reverseInventoryMovement(String id,Map<String,Object> r){
  PurchaseInventoryMovement original=resolveMovement(id);
  if(original.getReversalOf()!=null&&!original.getReversalOf().isBlank())throw new BadRequestException("A reversal entry cannot be reversed");
  if(original.getReversalNo()!=null&&!original.getReversalNo().isBlank())throw new BadRequestException(original.getMovementNo()+" has already been reversed");
  if(original.getInspectionNo()!=null&&!original.getInspectionNo().isBlank())
   throw new BadRequestException(original.getMovementNo()+" was posted from inspection "+original.getInspectionNo()+" — reverse it at the source document instead");
  String reason=text(r,"notes").trim();
  String actor=text(r,"updatedBy").trim().isBlank()?"Stores Team":text(r,"updatedBy").trim();
  List<PurchaseInventoryMovement> reversals=new ArrayList<>();
  List<PurchaseInventoryMovement> targets=new ArrayList<>();targets.add(original);
  if("Transfer".equals(original.getType())){
   PurchaseInventoryMovement counterpart=inventory.findByTransferRef(original.getTransferRef()).stream()
    .filter(x->!x.getId().equals(original.getId())
      &&(x.getReversalNo()==null||x.getReversalNo().isBlank())&&(x.getReversalOf()==null||x.getReversalOf().isBlank()))
    .findFirst().orElseThrow(()->new BadRequestException("Cannot reverse transfer "+original.getTransferRef()+": its counterpart entry is missing or already reversed. Adjust stock manually instead."));
   targets.add(counterpart);
  }
  /* Persist one leg at a time so the next leg's on-hand already includes
     the reversal just written — the pair can never unbalance the ledger. */
  for(PurchaseInventoryMovement target:targets){
   PurchaseInventoryMovement reversal=reversalRow(target,reason,actor);
   target.setReversalNo(reversal.getMovementNo());target.setReversalOn(LocalDate.now());
   inventory.save(target);reversals.add(reversal);
  }
  if(reversals.size()==1)return mov(reversals.get(0));
  Map<String,Object> result=new LinkedHashMap<>();result.put("source",mov(reversals.get(0)));result.put("destination",mov(reversals.get(1)));return result;
 }
 private BigDecimal onHand(String sku,String product,String warehouse){
  String sk=sku==null?"":sku.trim(),pr=product==null?"":product.trim(),wh=warehouse==null?"":warehouse.trim();
  if(sk.isBlank()&&pr.isBlank())return BigDecimal.ZERO;
  /* Summed in the database — the ledger grows forever, the query does not. */
  BigDecimal sum=inventory.sumDeltaForItem(sk,pr,wh);
  return sum==null?BigDecimal.ZERO:sum;
 }
 private PurchaseInventoryMovement resolveMovement(String id){
  if(id==null||id.isBlank())throw new ResourceNotFoundException("Inventory movement not found");
  String key=id.trim();
  PurchaseInventoryMovement found=inventory.findByMovementNo(key).orElse(null);
  if(found==null&&key.matches("\\d+"))found=inventory.findById(Long.parseLong(key)).orElse(null);
  if(found==null)throw new ResourceNotFoundException("Inventory movement not found");
  return found;
 }
 private String nextInventoryNo(){
  return numbering.nextInventoryNo(numbering.maxSequence(inventory.findAll().stream().map(PurchaseInventoryMovement::getMovementNo).toList(),"INV"));
 }
 private PurchaseInventoryMovement saveMovement(String sku,String product,String warehouse,String type,BigDecimal delta,BigDecimal before,BigDecimal after,Map<String,Object> r){
  PurchaseInventoryMovement m=new PurchaseInventoryMovement();
  String no=text(r,"movementNo");if(no.isBlank())no=text(r,"id");if(no.isBlank())no=nextInventoryNo();
  if(inventory.existsByMovementNo(no))throw new BadRequestException("Inventory movement number already exists");
  m.setMovementNo(no);m.setSku(sku);m.setProduct(product);m.setUom(text(r,"uom"));
  m.setWarehouse(warehouse);m.setLocation(text(r,"location"));
  m.setType(type);m.setBeforeQty(before);m.setDelta(delta);m.setAfterQty(after);
  m.setReference(text(r,"reference"));m.setNotes(text(r,"notes"));
  m.setInspectionNo(text(r,"inspectionNo"));m.setPoNo(text(r,"poNo"));m.setGrnNo(text(r,"grnNo"));
  LocalDate on=parseDate(r,"date");m.setUpdatedOn(on==null?LocalDate.now():on);
  m.setUpdatedBy(text(r,"updatedBy").trim().isBlank()?"Stores Team":text(r,"updatedBy").trim());
  inventory.save(m);return m;
 }
 private PurchaseInventoryMovement reversalRow(PurchaseInventoryMovement target,String reason,String actor){
  String label=target.getProduct()==null||target.getProduct().isBlank()?target.getSku():target.getProduct();
  BigDecimal before=onHand(target.getSku(),target.getProduct(),target.getWarehouse());
  BigDecimal delta=target.getDelta().negate();
  BigDecimal after=before.add(delta);
  if(after.compareTo(NEGATIVE_EPSILON)<0)
   throw new BadRequestException("Cannot reverse "+target.getMovementNo()+": the reversal would take "+label+" below zero in "+(target.getWarehouse()==null||target.getWarehouse().isBlank()?"the warehouse":target.getWarehouse())+" (on hand "+before.stripTrailingZeros().toPlainString()+"). Adjust stock first.");
  PurchaseInventoryMovement m=new PurchaseInventoryMovement();
  m.setMovementNo(nextInventoryNo());m.setSku(target.getSku());m.setProduct(target.getProduct());m.setUom(target.getUom());
  m.setWarehouse(target.getWarehouse());m.setLocation(target.getLocation());
  m.setType("Adjustment");m.setBeforeQty(before);m.setDelta(delta);m.setAfterQty(after);
  m.setReference("Reversal of "+target.getMovementNo());m.setNotes(reason);m.setReversalOf(target.getMovementNo());
  m.setUpdatedOn(LocalDate.now());m.setUpdatedBy(actor);
  inventory.save(m);return m;
 }
 private Map<String,Object> mov(PurchaseInventoryMovement m){
  Map<String,Object> o=new LinkedHashMap<>();
  o.put("id",m.getMovementNo());o.put("dbId",m.getId());o.put("movementNo",m.getMovementNo());
  o.put("sku",m.getSku());o.put("product",m.getProduct());o.put("uom",m.getUom());
  o.put("warehouse",m.getWarehouse());o.put("location",m.getLocation());
  o.put("fromWarehouse",m.getFromWarehouse());o.put("toWarehouse",m.getToWarehouse());
  o.put("fromLocation",m.getFromLocation());o.put("toLocation",m.getToLocation());
  o.put("direction",m.getDirection());
  o.put("before",m.getBeforeQty());o.put("delta",m.getDelta());o.put("after",m.getAfterQty());
  o.put("type",m.getType());o.put("reference",m.getReference());o.put("notes",m.getNotes());
  o.put("transferRef",m.getTransferRef());o.put("counterpartId",m.getCounterpartNo());
  o.put("reversalOf",m.getReversalOf());o.put("reversalId",m.getReversalNo());o.put("reversedOn",m.getReversalOn());
  o.put("inspectionNo",m.getInspectionNo());o.put("poNo",m.getPoNo());o.put("grnNo",m.getGrnNo());
  o.put("updatedOn",m.getUpdatedOn());o.put("updatedBy",m.getUpdatedBy());
  o.put("createdAt",m.getCreatedAt());
  return o;
 }
 private static final BigDecimal NEGATIVE_EPSILON=new BigDecimal("-0.000001");
 private LocalDate parseDate(Map<String,Object> r,String k){String v=text(r,k);if(v.isBlank())return null;try{return LocalDate.parse(v);}catch(Exception e){return null;}}
 private String text(Map<String,Object>m,String k){Object v=m.get(k);return v==null?"":String.valueOf(v);} private BigDecimal decimal(Map<String,Object>m,String k,BigDecimal d){String v=text(m,k);if(v.isBlank())return d;try{return new BigDecimal(v);}catch(Exception e){throw new BadRequestException("Invalid quantity");}} private String json(Object v){try{return v==null?null:mapper.writeValueAsString(v);}catch(Exception e){throw new BadRequestException("Invalid items");}} private Object parse(String v){try{return v==null?List.of():mapper.readValue(v,Object.class);}catch(Exception e){return List.of();}}
}
