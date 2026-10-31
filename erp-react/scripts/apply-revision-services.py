#!/usr/bin/env python3
"""Transform the 9 non-Quotation document services to revision-creating updates.

Per module:
- update(): every edit creates a NEW revision row (BASE(N)), preserving the
  previous version; only the latest revision is editable.
- toResponse(): delegate + detail variant carrying the revision chain.
- delete(): promotes the previous revision when the latest is deleted.
- Adds copyForRevision / maxRevisionOfChain / revisionChain / revisionInfo
  helpers (full-field copy via Spring BeanUtils, ignoring id/collections/
  revision columns).
"""
import os

ROOT = os.path.join("erp-react", "erp-backend", "src", "main", "java", "com", "vishatech", "erp", "service")

errors = []


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


IGNORED_COLLECTIONS = {
    "SalesContract": "timeline", "SalesOrder": "timeline", "ProformaInvoice": "timeline",
    "DeliveryChallan": "timeline", "Invoice": "timeline", "CreditNote": "timeline",
    "PaymentReceipt": "timeline", "Cpr": "attachments", "CostWorkout": "timeline",
}


def apply_module(cfg):
    svc = os.path.join(ROOT, cfg["cls"] + "Service.java")
    src = read(svc)

    if "revisionChain" in src:
        print(f"[skip] {cfg['cls']} already transformed")
        return

    # 1) Replace update()
    if cfg["old_update"] not in src:
        errors.append(f"{cfg['cls']}: old update() not found")
        return
    src = src.replace(cfg["old_update"], cfg["new_update"], 1)

    # 2) Insert helper block right before toResponse signature
    sig = cfg["to_response_sig"]
    idx = src.find(sig)
    if idx == -1:
        errors.append(f"{cfg['cls']}: toResponse signature not found")
        return
    src = src[:idx] + cfg["helpers"] + "\n" + src[idx:]

    # 3) Rename toResponse signature to the 2-arg overload and add delegate
    sig2 = cfg["to_response_sig2"]
    src = src.replace(cfg["to_response_sig"], sig2, 1)

    # 4) Add the 5 revision args before the constructor close in the 2-arg body
    # Find "return new XResponse(" ... then the matching close ");"
    ctor = cfg["ctor_open"]
    ci = src.find(ctor)
    if ci == -1:
        errors.append(f"{cfg['cls']}: constructor open not found")
        return
    close = src.find("\n        );\n    }", ci)
    if close == -1:
        errors.append(f"{cfg['cls']}: constructor close not found")
        return
    extra = (
        ",\n                "
        + cfg["var"] + ".getRevision(),\n                "
        + cfg["var"] + ".getRevisionOf(),\n                "
        + cfg["var"] + ".isLatestRevision(),\n                "
        + cfg["var"] + ".getRevisionDate() == null ? null : "
        + cfg["var"] + ".getRevisionDate().toString(),\n                revisions"
    )
    src = src[:close] + extra + src[close:]

    # 5) get()/create()/duplicate() detail responses + delete() promotion
    for old, new in cfg["detail_calls"]:
        src = src.replace(old, new, 1)

    write(svc, src)
    print(f"[ok] {cfg['cls']}")


def build_helpers(cfg):
    ent = cfg["cls"]
    var = cfg["var"]
    item = cfg["item"]
    parent = cfg["item_parent"]
    collections = ["id", "items"]
    extra_col = IGNORED_COLLECTIONS.get(ent)
    if extra_col:
        collections.append(extra_col)
    if ent == "Cpr":
        collections += ["timeline", "history", "comments"]
    if ent == "CostWorkout":
        collections.append("timeline")
    collections += ["revisionOf", "revision", "revisionDate", "latestRevision",
                    "createdAt", "updatedAt", "archivedAt"]
    ignore = ", ".join('"%s"' % c for c in collections)

    item_copy = ""
    if item:
        item_copy = (
            f"        for ({item} sourceItem : source.getItems()) {{\n"
            f"            {item} item = new {item}();\n"
            f"            org.springframework.beans.BeanUtils.copyProperties(sourceItem, item,\n"
            f"                    \"id\", \"{parent}\", \"createdAt\");\n"
            f"            copy.addItem(item);\n"
            f"        }}\n"
        )

    return f"""    private void copyForRevision({ent} copy, {ent} source) {{
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                {ignore});
{item_copy}    }}

    private int maxRevisionOfChain(Long baseId) {{
        return {cfg['repo']}.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt({ent}::getRevision)
                .max()
                .orElse(0);
    }}

    /** Detail response — also carries the full revision chain for the UI. */
    private {cfg['resp']} toResponseDetail({ent} {var}) {{
        return toResponse({var}, revisionChain({var}));
    }}

    private List<RevisionInfo> revisionChain({ent} {var}) {{
        Long baseId = {var}.getRevisionOf() != null ? {var}.getRevisionOf() : {var}.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        {cfg['repo']}.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        {cfg['repo']}.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt({ent}::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }}

    private RevisionInfo revisionInfo({ent} {var}) {{
        return new RevisionInfo(
                {var}.getId(),
                {var}.{cfg['no_get']}(),
                {var}.getRevision(),
                {cfg['status_label']},
                {var}.getRevisionDate() == null
                        ? ({var}.getCreatedAt() == null ? null : {var}.getCreatedAt().toString())
                        : {var}.getRevisionDate().toString(),
                {var}.isLatestRevision());
    }}

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision({ent} removed) {{
        if (!removed.isLatestRevision()) {{
            return;
        }}
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        {cfg['repo']}.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresent(q -> {{
                    q.setLatestRevision(true);
                    {cfg['repo']}.save(q);
                }});
    }}
"""


# ---------------- SalesContract ----------------
sales_contract = {
    "cls": "SalesContract", "var": "contract", "repo": "salesContractRepository",
    "no_get": "getScNo", "resp": "SalesContractResponse",
    "item": "SalesContractItem", "item_parent": "salesContract",
    "module": "sales-contract", "status_label": "contract.getStatus()",
    "ctor_open": "return new SalesContractResponse(",
    "to_response_sig": "    private SalesContractResponse toResponse(SalesContract contract) {",
    "to_response_sig2": "    private SalesContractResponse toResponse(SalesContract contract, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getContract(id));", "return toResponseDetail(getContract(id));"),
    ],
    "old_update": """    public SalesContractResponse update(Long id, SalesContractRequest request) {
        SalesContract contract = getContract(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(contract);
        applyRequest(contract, request);
        if (request.status() != null && !request.status().isBlank()) {
            contract.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(contract);
        addTimeline(contract, "updated", "Sales Contract updated",
                "Sales Contract details were updated by " + currentUserName() + ".");
        SalesContract saved = salesContractRepository.save(contract);
        editHistory.recordEdit("sales-contract", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public SalesContractResponse update(Long id, SalesContractRequest request) {
        SalesContract current = getContract(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        SalesContract revision = new SalesContract();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setScNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getScNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        salesContractRepository.save(current);
        SalesContract saved = salesContractRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getScNo() + "' created from '" + current.getScNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("sales-contract", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- SalesOrder ----------------
sales_order = {
    "cls": "SalesOrder", "var": "salesOrder", "repo": "salesOrderRepository",
    "no_get": "getSoNo", "resp": "SalesOrderResponse",
    "item": "SalesOrderItem", "item_parent": "salesOrder",
    "module": "sales-order", "status_label": "salesOrder.getStatus()",
    "ctor_open": "return new SalesOrderResponse(",
    "to_response_sig": "    private SalesOrderResponse toResponse(SalesOrder salesOrder) {",
    "to_response_sig2": "    private SalesOrderResponse toResponse(SalesOrder salesOrder, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getSalesOrder(id));", "return toResponseDetail(getSalesOrder(id));"),
    ],
    "old_update": """    public SalesOrderResponse update(Long id, SalesOrderRequest request) {
        SalesOrder salesOrder = getSalesOrder(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(salesOrder);
        applyRequest(salesOrder, request);
        if (request.status() != null && !request.status().isBlank()) {
            salesOrder.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(salesOrder);
        addTimeline(salesOrder, "updated", "Sales Order updated",
                "Sales Order details were updated by " + currentUserName() + ".");
        SalesOrder saved = salesOrderRepository.save(salesOrder);
        editHistory.recordEdit("sales-order", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public SalesOrderResponse update(Long id, SalesOrderRequest request) {
        SalesOrder current = getSalesOrder(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        SalesOrder revision = new SalesOrder();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setSoNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getSoNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        salesOrderRepository.save(current);
        SalesOrder saved = salesOrderRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getSoNo() + "' created from '" + current.getSoNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("sales-order", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- ProformaInvoice ----------------
proforma = {
    "cls": "ProformaInvoice", "var": "pi", "repo": "proformaInvoiceRepository",
    "no_get": "getPiNo", "resp": "ProformaInvoiceResponse",
    "item": "ProformaInvoiceItem", "item_parent": "proformaInvoice",
    "module": "proforma-invoice", "status_label": "pi.getStatus()",
    "ctor_open": "return new ProformaInvoiceResponse(",
    "to_response_sig": "    private ProformaInvoiceResponse toResponse(ProformaInvoice pi) {",
    "to_response_sig2": "    private ProformaInvoiceResponse toResponse(ProformaInvoice pi, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getPi(id));", "return toResponseDetail(getPi(id));"),
    ],
    "old_update": """    public ProformaInvoiceResponse update(Long id, ProformaInvoiceRequest request) {
        ProformaInvoice pi = getPi(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(pi);
        applyRequest(pi, request);
        if (request.status() != null && !request.status().isBlank()) {
            pi.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(pi);
        addTimeline(pi, "updated", "Proforma Invoice updated",
                "Proforma Invoice details were updated by " + currentUserName() + ".");
        ProformaInvoice saved = proformaInvoiceRepository.save(pi);
        editHistory.recordEdit("proforma-invoice", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public ProformaInvoiceResponse update(Long id, ProformaInvoiceRequest request) {
        ProformaInvoice current = getPi(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        ProformaInvoice revision = new ProformaInvoice();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setPiNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getPiNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        proformaInvoiceRepository.save(current);
        ProformaInvoice saved = proformaInvoiceRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getPiNo() + "' created from '" + current.getPiNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("proforma-invoice", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- DeliveryChallan ----------------
delivery_challan = {
    "cls": "DeliveryChallan", "var": "dc", "repo": "deliveryChallanRepository",
    "no_get": "getDcNo", "resp": "DeliveryChallanResponse",
    "item": "DeliveryChallanItem", "item_parent": "deliveryChallan",
    "module": "delivery-challan", "status_label": "dc.getStatus()",
    "ctor_open": "return new DeliveryChallanResponse(",
    "to_response_sig": "    private DeliveryChallanResponse toResponse(DeliveryChallan dc) {",
    "to_response_sig2": "    private DeliveryChallanResponse toResponse(DeliveryChallan dc, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getDc(id));", "return toResponseDetail(getDc(id));"),
    ],
    "old_update": """    public DeliveryChallanResponse update(Long id, DeliveryChallanRequest request) {
        DeliveryChallan dc = getDc(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(dc);
        applyRequest(dc, request);
        if (request.status() != null && !request.status().isBlank()) {
            dc.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(dc);
        addTimeline(dc, "updated", "Delivery Challan updated",
                "Delivery Challan details were updated by " + currentUserName() + ".");
        DeliveryChallan saved = deliveryChallanRepository.save(dc);
        editHistory.recordEdit("delivery-challan", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public DeliveryChallanResponse update(Long id, DeliveryChallanRequest request) {
        DeliveryChallan current = getDc(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        DeliveryChallan revision = new DeliveryChallan();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setDcNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getDcNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        deliveryChallanRepository.save(current);
        DeliveryChallan saved = deliveryChallanRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getDcNo() + "' created from '" + current.getDcNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("delivery-challan", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- Invoice ----------------
invoice = {
    "cls": "Invoice", "var": "invoice", "repo": "invoiceRepository",
    "no_get": "getInvoiceNo", "resp": "InvoiceResponse",
    "item": "InvoiceItem", "item_parent": "invoice",
    "module": "invoice", "status_label": "invoice.getStatus()",
    "ctor_open": "return new InvoiceResponse(",
    "to_response_sig": "    private InvoiceResponse toResponse(Invoice invoice) {",
    "to_response_sig2": "    private InvoiceResponse toResponse(Invoice invoice, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getInvoice(id));", "return toResponseDetail(getInvoice(id));"),
    ],
    "old_update": """    public InvoiceResponse update(Long id, InvoiceRequest request) {
        Invoice invoice = getInvoice(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(invoice);
        applyRequest(invoice, request);
        if (request.status() != null && !request.status().isBlank()) {
            invoice.setStatus(normalizeStatus(request.status()));
        }
        if (request.paymentStatus() != null && !request.paymentStatus().isBlank()) {
            invoice.setPaymentStatus(request.paymentStatus().trim().toLowerCase());
        } else {
            invoice.setPaymentStatus("paid".equals(invoice.getStatus()) ? "paid"
                    : "overdue".equals(invoice.getStatus()) ? "overdue" : "unpaid");
        }
        recalcTotals(invoice);
        addTimeline(invoice, "updated", "Invoice updated",
                "Invoice details were updated by " + currentUserName() + ".");
        Invoice saved = invoiceRepository.save(invoice);
        editHistory.recordEdit("invoice", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public InvoiceResponse update(Long id, InvoiceRequest request) {
        Invoice current = getInvoice(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        Invoice revision = new Invoice();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        if (request.paymentStatus() != null && !request.paymentStatus().isBlank()) {
            revision.setPaymentStatus(request.paymentStatus().trim().toLowerCase());
        } else {
            revision.setPaymentStatus("paid".equals(revision.getStatus()) ? "paid"
                    : "overdue".equals(revision.getStatus()) ? "overdue" : "unpaid");
        }
        recalcTotals(revision);
        revision.setInvoiceNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getInvoiceNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        invoiceRepository.save(current);
        Invoice saved = invoiceRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getInvoiceNo() + "' created from '" + current.getInvoiceNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("invoice", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- CreditNote ----------------
credit_note = {
    "cls": "CreditNote", "var": "cn", "repo": "creditNoteRepository",
    "no_get": "getCnNo", "resp": "CreditNoteResponse",
    "item": "CreditNoteItem", "item_parent": "creditNote",
    "module": "credit-note", "status_label": "cn.getStatus()",
    "ctor_open": "return new CreditNoteResponse(",
    "to_response_sig": "    private CreditNoteResponse toResponse(CreditNote cn) {",
    "to_response_sig2": "    private CreditNoteResponse toResponse(CreditNote cn, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getCn(id));", "return toResponseDetail(getCn(id));"),
    ],
    "old_update": """    public CreditNoteResponse update(Long id, CreditNoteRequest request) {
        CreditNote cn = getCn(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(cn);
        applyRequest(cn, request);
        if (request.status() != null && !request.status().isBlank()) {
            cn.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(cn);
        addTimeline(cn, "updated", "Credit Note updated",
                "Credit Note details were updated by " + currentUserName() + ".");
        CreditNote saved = creditNoteRepository.save(cn);
        editHistory.recordEdit("credit-note", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public CreditNoteResponse update(Long id, CreditNoteRequest request) {
        CreditNote current = getCn(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        CreditNote revision = new CreditNote();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        recalcTotals(revision);
        revision.setCnNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getCnNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        creditNoteRepository.save(current);
        CreditNote saved = creditNoteRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getCnNo() + "' created from '" + current.getCnNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("credit-note", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- PaymentReceipt (no items) ----------------
payment_receipt = {
    "cls": "PaymentReceipt", "var": "receipt", "repo": "paymentReceiptRepository",
    "no_get": "getReceiptNo", "resp": "PaymentReceiptResponse",
    "item": None, "item_parent": None,
    "module": "payment-receipt", "status_label": "receipt.getStatus()",
    "ctor_open": "return new PaymentReceiptResponse(",
    "to_response_sig": "    private PaymentReceiptResponse toResponse(PaymentReceipt receipt) {",
    "to_response_sig2": "    private PaymentReceiptResponse toResponse(PaymentReceipt receipt, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getReceipt(id));", "return toResponseDetail(getReceipt(id));"),
    ],
    "old_update": """    public PaymentReceiptResponse update(Long id, PaymentReceiptRequest request) {
        PaymentReceipt receipt = getReceipt(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(receipt);
        applyRequest(receipt, request);
        if (request.status() != null && !request.status().isBlank()) {
            receipt.setStatus(normalizeStatus(request.status()));
        }
        addTimeline(receipt, "updated", "Payment Receipt updated",
                "Payment Receipt details were updated by " + currentUserName() + ".");
        PaymentReceipt saved = paymentReceiptRepository.save(receipt);
        editHistory.recordEdit("payment-receipt", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public PaymentReceiptResponse update(Long id, PaymentReceiptRequest request) {
        PaymentReceipt current = getReceipt(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        PaymentReceipt revision = new PaymentReceipt();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        revision.setReceiptNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getReceiptNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        paymentReceiptRepository.save(current);
        PaymentReceipt saved = paymentReceiptRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getReceiptNo() + "' created from '" + current.getReceiptNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("payment-receipt", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- Cpr (enum status) ----------------
cpr = {
    "cls": "Cpr", "var": "cpr", "repo": "cprRepository",
    "no_get": "getPrNo", "resp": "CprResponse",
    "item": "CprItem", "item_parent": "cpr",
    "module": "cpr", "status_label": "statusKey(cpr.getStatus())",
    "ctor_open": "return new CprResponse(",
    "to_response_sig": "    private CprResponse toResponse(Cpr cpr) {",
    "to_response_sig2": "    private CprResponse toResponse(Cpr cpr, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getCpr(id));", "return toResponseDetail(getCpr(id));"),
        ("return toResponse(cprRepository.save(cpr));\n    }\n\n    public CprResponse delete",
         "return toResponseDetail(cprRepository.save(cpr));\n    }\n\n    public CprResponse delete"),
    ("return toResponse(copy);", "return toResponseDetail(copy);"),
    ("return toResponse(cprRepository.save(saved));", "return toResponseDetail(cprRepository.save(saved));"),
    ("return toResponse(cprRepository.save(updated));", "return toResponseDetail(cprRepository.save(updated));"),
    ("return toResponse(cprRepository.save(cpr));", "return toResponseDetail(cprRepository.save(cpr));"),
    ("return toResponse(saved);", "return toResponseDetail(saved);"),
    ("return toResponse(cprRepository.saveAndFlush(updated));", "return toResponseDetail(cprRepository.saveAndFlush(updated));"),
    ("return toResponse(cprRepository.saveAndFlush(cpr));", "return toResponseDetail(cprRepository.saveAndFlush(cpr));"),
    ("return toResponse(cprRepository.save(copy));", "return toResponseDetail(cprRepository.save(copy));"),
    ("return toResponse(cprRepository.save(approval));", "return toResponseDetail(cprRepository.save(approval));"),
    ("return toResponse(updated);", "return toResponseDetail(updated);"),
    ("return toResponse(cprRepository.saveAndFlush(revision));", "return toResponseDetail(cprRepository.saveAndFlush(revision));"),
    ("return toResponse(cprRepository.saveAndFlush(saved));", "return toResponseDetail(cprRepository.saveAndFlush(saved));"),
    ("return toResponse(cprRepository.saveAndFlush(copy));", "return toResponseDetail(cprRepository.saveAndFlush(copy));"),
    ("return toResponse(cprRepository.saveAndFlush(approval));", "return toResponseDetail(cprRepository.saveAndFlush(approval));"),
    ("return toResponse(cprRepository.saveAndFlush(submitted));", "return toResponseDetail(cprRepository.saveAndFlush(submitted));"),
    ("return toResponse(cprRepository.saveAndFlush(applied));", "return toResponseDetail(cprRepository.saveAndFlush(applied));"),
    ("return toResponse(approval);", "return toResponseDetail(approval);"),
    ("return toResponse(submitted);", "return toResponseDetail(submitted);"),
    ("return toResponse(applied);", "return toResponseDetail(applied);"),
    ("return toResponse(revision);", "return toResponseDetail(revision);"),
    ("return toResponse(entry);", "return toResponseDetail(entry);"),
    ("return toResponse(cprRepository.saveAndFlush(comment));", "return toResponseDetail(cprRepository.saveAndFlush(comment));"),
    ("return toResponse(cprRepository.saveAndFlush(result));", "return toResponseDetail(cprRepository.saveAndFlush(result));"),
    ("return toResponse(created);", "return toResponseDetail(created);"),
    ("return toResponse(cprRepository.saveAndFlush());", "return toResponseDetail(cprRepository.saveAndFlush());"),
],
    "old_update": """    public CprResponse update(Long id, CprRequest request) {
        Cpr cpr = getCpr(id);
        Map<String, String> before = snapshotFields(cpr);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(cpr);
        applyRequest(cpr, request);
        if (request.status() != null && !request.status().isBlank()) {
            cpr.setStatus(parseStatus(request.status()));
        }
        if (request.approvalStatus() != null && !request.approvalStatus().isBlank()) {
            cpr.setApprovalStatus(parseApprovalStatus(request.approvalStatus()));
        }
        syncStage(cpr);
        recalcTotals(cpr);
        List<CprTimeline> fieldChanges = changedFields(before, cpr);
        boolean draftSave = cpr.getStatus() == CprStatus.DRAFT;
        // A summary row is always inserted per save (draft saves get a dedicated
        // event type) plus one row per changed field.
        cpr.addTimeline(entry(draftSave ? "draft saved" : "updated",
                draftSave ? "Draft saved" : "CPR updated",
                (draftSave ? "Draft of CPR " : "CPR details ") + "were updated by " + currentUserName() + "."));
        fieldChanges.forEach(cpr::addTimeline);
        Cpr saved = cprRepository.save(cpr);
        editHistory.recordEdit("cpr", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public CprResponse update(Long id, CprRequest request) {
        Cpr current = getCpr(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        Map<String, String> before = snapshotFields(current);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        Cpr revision = new Cpr();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(parseStatus(request.status()));
        }
        if (request.approvalStatus() != null && !request.approvalStatus().isBlank()) {
            revision.setApprovalStatus(parseApprovalStatus(request.approvalStatus()));
        }
        syncStage(revision);
        recalcTotals(revision);
        revision.setPrNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getPrNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        List<CprTimeline> fieldChanges = changedFields(before, revision);
        boolean draftSave = revision.getStatus() == CprStatus.DRAFT;
        // A summary row is always inserted per save (draft saves get a dedicated
        // event type) plus one row per changed field.
        revision.addTimeline(entry(draftSave ? "draft saved" : "updated",
                draftSave ? "Draft saved" : "CPR updated",
                (draftSave ? "Draft of CPR " : "CPR details ") + "were updated by " + currentUserName() + "."));
        fieldChanges.forEach(revision::addTimeline);

        current.setLatestRevision(false);
        cprRepository.save(current);
        Cpr saved = cprRepository.saveAndFlush(revision);
        editHistory.recordEdit("cpr", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }""",
}

# ---------------- CostWorkout (enum status) ----------------
cost_workout = {
    "cls": "CostWorkout", "var": "cw", "repo": "costWorkoutRepository",
    "no_get": "getCwNo", "resp": "CostWorkoutResponse",
    "item": "CostWorkoutItem", "item_parent": "costWorkout",
    "module": "cost-workout", "status_label": "statusKey(cw.getStatus())",
    "ctor_open": "return new CostWorkoutResponse(",
    "to_response_sig": "    private CostWorkoutResponse toResponse(CostWorkout cw) {",
    "to_response_sig2": "    private CostWorkoutResponse toResponse(CostWorkout cw, List<RevisionInfo> revisions) {",
    "detail_calls": [
        ("return toResponse(getCw(id));", "return toResponseDetail(getCw(id));"),
    ],
    "old_update": """    public CostWorkoutResponse update(Long id, CostWorkoutRequest request) {
        CostWorkout cw = getCw(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(cw);
        if (cw.getStatus() == CostWorkoutStatus.APPROVED || cw.getStatus() == CostWorkoutStatus.DELETED) {
            throw new BadRequestException("Cannot edit a Cost Workout in status '" + label(cw.getStatus()) + "'");
        }
        applyRequest(cw, request);
        if (request.status() != null && !request.status().isBlank()) {
            CostWorkoutStatus parsed = parseStatus(request.status());
            if (parsed == CostWorkoutStatus.COMPLETED && cw.getStatus() == CostWorkoutStatus.DRAFT) {
                cw.setStatus(CostWorkoutStatus.COMPLETED);
            } else if (parsed == CostWorkoutStatus.DRAFT) {
                cw.setStatus(CostWorkoutStatus.DRAFT);
            }
        }
        recalc(cw);
        cw.addTimeline(entry("updated", "Cost Workout updated",
                "Cost Workout details were updated by " + currentUserName() + "."));
        CostWorkout saved = costWorkoutRepository.save(cw);
        editHistory.recordEdit("cost-workout", saved.getId(), editBefore, editHistory.snapshot(saved));
        linkCpr(saved, "updated", false);
        return toResponse(saved);
    }""",
    "new_update": """    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public CostWorkoutResponse update(Long id, CostWorkoutRequest request) {
        CostWorkout current = getCw(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        if (current.getStatus() == CostWorkoutStatus.DELETED) {
            throw new BadRequestException("Cannot edit a deleted Cost Workout");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        CostWorkout revision = new CostWorkout();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            CostWorkoutStatus parsed = parseStatus(request.status());
            if (parsed == CostWorkoutStatus.COMPLETED && revision.getStatus() == CostWorkoutStatus.DRAFT) {
                revision.setStatus(CostWorkoutStatus.COMPLETED);
            } else if (parsed == CostWorkoutStatus.DRAFT) {
                revision.setStatus(CostWorkoutStatus.DRAFT);
            }
        }
        recalc(revision);
        revision.setCwNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getCwNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        revision.addTimeline(entry("updated", "Cost Workout updated",
                "Cost Workout details were updated by " + currentUserName() + "."));

        current.setLatestRevision(false);
        costWorkoutRepository.save(current);
        CostWorkout saved = costWorkoutRepository.saveAndFlush(revision);
        editHistory.recordEdit("cost-workout", saved.getId(), editBefore, editHistory.snapshot(saved));
        linkCpr(saved, "updated", false);
        return toResponseDetail(saved);
    }""",
}

MODULES = [sales_contract, sales_order, proforma, delivery_challan, invoice,
           credit_note, payment_receipt, cpr, cost_workout]

for cfg in MODULES:
    cfg["helpers"] = build_helpers(cfg)

if __name__ == "__main__":
    for cfg in MODULES:
        apply_module(cfg)
    if errors:
        print("\nERRORS:")
        for e in errors:
            print(" -", e)
    else:
        print("\nALL_DONE")
