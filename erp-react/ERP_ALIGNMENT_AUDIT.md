# ERP Alignment Audit — 8 Sales Modules (erp-react)

**Date:** 2026-08-07 · **Project:** `erp-react` (frontend + `erp-backend`) — modifications only
**References:** `ERP/` (functional reference, read-only) · `purchase/` (visual reference, read-only)
**Method:** Field-by-field extraction from the ERP module pages/JS → comparison against the erp-react forms/configs/backends → verified fixes → authenticated API E2E.

---

## Audit summary (Phase 1)

| Module | ERP form fields | erp-react form | List | View | Statuses | Conversions |
|---|---|---|---|---|---|---|
| Quotations | ✅ matched (Quotation No … Valid Till, From, For, Billing/Shipping, Configure GST, Commercial, Notes, T&C, Advanced, Signature) | ✅ | ✅ | ✅ | ✅ | ✅ SC·SO·PI·DC·INV·CN·PR |
| Sales Contracts | ✅ matched (Contract Details, Client, Terms, Commercial & Scope) | ✅ | ✅ | ✅ | ✅ | ✅ SO |
| Sales Orders | ✅ matched (Order Details, Client, Notes + items/totals) | ✅ | ✅ | ✅ | ✅ | ✅ PI·INV·DC |
| Proforma Invoices | ✅ matched | ✅ | ✅ | ✅ | ✅ | ✅ SO·DC·INV |
| Delivery Challans | ✅ matched (Challan, Client, Transport, Notes) | ✅ | ✅ | ✅ | ✅ | ✅ INV |
| Invoices | ✅ matched (+ **Amount in Words enabled** this pass) | ✅ | ✅ | ✅ | ✅ | ✅ CN·PR |
| Credit Notes | ✅ matched (Company, Details, Client; reason/refund/return qty/inventory impact) | ✅ | ✅ | ✅ | ✅ | — (target) |
| Payment Receipts | ✅ matched (Company, Receipt, Client, Payment Details) | ✅ | ✅ | ✅ | ✅ | — (target) |

Notes on the audit method: the ERP sales modules are **localStorage reference demos** (`VT.*`); erp-react is the real MySQL-backed implementation of the same spec. Quotations (CPR_QUOTATIONS_AUDIT_REPORT), DC + PI (DC_PROFORMA_AUDIT_REPORT) already had deep audits; SC/SO were aligned earlier this session. This pass added the field-level check for Invoices, Credit Notes, Payment Receipts and closed the conversion gaps below.

---

## Changes this pass (Phase 2 + 3)

### Backend — 5 new Quotation conversion endpoints (previously navigation hooks only)
`QuotationController` + `QuotationService`:

- `POST /v1/quotations/{id}/convert-proforma` → creates a real **Proforma Invoice** (PI-YYYY-…)
- `POST /v1/quotations/{id}/convert-invoice` → creates a real **Invoice** (INV-YYYY-…)
- `POST /v1/quotations/{id}/convert-credit-note` → creates a real **Credit Note** (CN-YYYY-…)
- `POST /v1/quotations/{id}/convert-payment-receipt` → creates a real **Payment Receipt** (PR-YYYY-…)
- `POST /v1/quotations/{id}/convert-delivery-challan` → creates a real **Delivery Challan** (DC-YYYY-…)

Each conversion:
- Copies client, GST/PAN, addresses, items, totals and relevant terms from the quotation
- Sets `source=quotation`, `sourceRef=quotationNo` on the target document (traceability)
- **Save-first** then writes a `created` **timeline + history** row on the target document
- Marks the quotation `status=converted` + sets `convertedToPi/Invoice/Cn/Pr` and writes `converted` timeline + history on the quotation
- Runs in one transaction (`@Transactional` class-level) — any failure rolls back everything
- Symmetric **double-conversion guards** (400 “Quotation already converted to another document”)

Supporting changes: `Quotation` entity +4 traceability fields (+getters/setters), `QuotationResponse` +4 fields, 5 number builders (PI/INV/CN/PR/DC), `addTargetTimeline`/`addTargetHistory` helpers. Existing `convert-sales-order` untouched.

### Frontend — Quotations Actions menu
- New item **Convert to Delivery Challan** (Truck) in the CONVERSION section (PI → DC → Invoice workflow order)
- `Convert to Proforma Invoice / Invoice / Credit Note / Payment Receipt` upgraded from navigation hooks to real API actions (`runAction` → `postAction`) — document created in place, list refreshes, success toast
- Conversion items hide when `convertedToSo/Pi/Invoice/Cn/Pr` is set or status is converted/cancelled/deleted
- `Convert to Sales Contract` keeps the dedicated ERP convert page (`/quotations/convert?id=…`)

### Frontend — Invoice form
- `showWords: true` — "Amount in Words" now shown (ERP invoice create displays it)

---

## Verification

- ✅ `mvnw compile` clean · `eslint` clean · `vite build` ✓ (no errors/warnings)
- ✅ API E2E (`erp-react/.audit-e2e/qtn_conversions_e2e.py`, kept for re-runs) — **5/5 conversions**:
  - Q→PI `PI-2026-000007` / Q→INV `INV-2026-000005` / Q→CN `CN-2026-000002` / Q→PR `PR-2026-000002` / Q→DC `DC-2026-000010`
  - target docs: `source=quotation`, `sourceRef=QTN-…`, timeline `[('created', …)]`, history `[('<Module>', '<doc no>')]`
  - quotation: `status=converted`, `convertedToX=<no>`, timeline `[('converted', …)]`
- ✅ Double conversion blocked: 400 `Quotation already converted to another document`
- ✅ Earlier NULL `module_id` fix re-verified (POST `/sales-contracts` → 201 with timeline)

## Known remaining (documented, non-regressions)

1. **Payment Receipt** carries the quotation number in `invoiceRef` (the PR entity has no `sourceRef` column) — the Receipt's "Invoice" column will show a quotation number.
2. **Payment Receipt form** has no Attachments upload control yet (backend attachment endpoints exist).
3. The 4 former navigation hooks no longer pre-fill target forms from `?fromQuotation=` — conversions are now direct backend operations instead.
4. Browser-based UI automation was unavailable this session (agent tooling errors); verification used authenticated API E2E + production build, consistent with prior audit reports.
5. Sales Orders "Convert to Delivery Challan" reuses the SO→DC flow; the ERP quotation reference app itself only offered "Convert to Sales Order" — the full conversion set follows the workflow requested in this task.

## Scope

Only `erp-react` modified — **ERP (last modified Aug 1) and `purchase/` (last modified Aug 3) completely untouched**, no other module's configs changed.

Files changed this pass:
- `erp-react/erp-backend/.../entity/Quotation.java`
- `erp-react/erp-backend/.../dto/QuotationResponse.java`
- `erp-react/erp-backend/.../service/QuotationService.java`
- `erp-react/erp-backend/.../controller/QuotationController.java`
- `erp-react/src/config/salesPageConfigs.jsx` (Quotations config only)
- `erp-react/src/config/salesFormConfigs.jsx` (invoice `showWords` only)
- `erp-react/.audit-e2e/qtn_conversions_e2e.py` (new E2E script, kept for re-runs)
