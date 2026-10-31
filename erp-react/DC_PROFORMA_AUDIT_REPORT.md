# Delivery Challan + Proforma Invoice — Audit & Fix Report

**Date:** 2026-08-06 · **Project:** `erp-react` (modifications only) · **Reference:** `ERP` (read-only)
**Method:** ERP comparison → code inspection (frontend/backend/DB) → live API E2E against running Vite → Spring Boot → MySQL → browser E2E regression.

---

## Final Verification Summary

| Module | API E2E | Quotation regression (shared components) | Lint | Build | Backend compile |
|---|---|---|---|---|---|
| Delivery Challan | ✅ 28/28 | — | ✅ 0 errors | ✅ | ✅ |
| Proforma Invoice | ✅ 27/27 | — | ✅ 0 errors | ✅ | ✅ |
| **Both** | **55 PASS / 0 FAIL** | **42 PASS / 1 documented-FAIL (legacy print route)** | ✅ | ✅ | ✅ |

No localStorage / sessionStorage / mock JSON / hardcoded data in either module — every read/write goes through the Spring Boot API and persists in MySQL (verified by GET-after-write on every workflow).

---

## ✅ Working correctly (verified live)

### Delivery Challan
| # | Workflow | Verified |
|---|---|---|
| 1 | Create (items, transport, vehicle, driver, LR, e-way bill, dispatch/delivery dates, terms, flat discount, charges) | ✅ 201, `DC-2026-…` auto-number, items persisted, terms/transport persisted |
| 2 | Totals | ✅ `grandTotal = subTotal − discount + charges + tax`; `discountPct` derived (100/6000 = 1.67) |
| 3 | Edit / Update | ✅ discount ₹150 survives (no wipe), items/notes update |
| 4 | Status flow | ✅ `draft → accepted → converted` (+ packed/dispatched/in transit/delivered/cancelled via `normalizeStatus`) |
| 5 | **Convert → Invoice** | ✅ `INV-2026-000001` created (`source=dc`, `sourceRef=DC-…`), items+totals+terms copied, DC → `converted`, `convertedToInvoice=INV-…` |
| 6 | Duplicate | ✅ 201, new id, keeps discount + dispatchDate (fixed) |
| 7 | Archive / Restore | ✅ 200 / 200 |
| 8 | Persistence (refresh/reopen) | ✅ all fields via GET |
| 9 | List filters/search/sort/pagination, export | ✅ backend `list()`/`export()` with Specification |
| 10 | Attachments | ✅ multipart upload/list/delete |
| 11 | Timeline / History | ✅ entries recorded |
| 12 | Print / PDF (design sheet + `salesPrintUtils` DC rows) | ✅ transport/vehicle/LR/eway/dispatch/delivery info rows on print/PDF |

### Proforma Invoice
| # | Workflow | Verified |
|---|---|---|
| 1 | Create (bank fields, validTill, source/sourceRef, ship-same-as-bill, flat discount, charges) | ✅ 201, `PI-2026-…`, all fields persisted |
| 2 | Totals | ✅ `grandTotal = subTotal − discount + charges + tax`; `discountPct` derived (200/9000 = 2.22) |
| 3 | Edit / Update | ✅ discount ₹250 survives |
| 4 | Status flow | ✅ `draft → accepted → converted` (+ sent/expired/cancelled) |
| 5 | **Convert → Sales Order** | ✅ `SO-2026-…` created (`qtnRef=PI-…`), PI → `converted`, `convertedToSo=SO-…` |
| 6 | **Generate → Delivery Challan** | ✅ `DC-2026-…` created (soRef=PI source ref), `convertedToDc=DC-…` |
| 7 | **Convert → Invoice** | ✅ existing `convert-invoice` endpoint intact |
| 8 | Duplicate | ✅ 201, keeps discount + validTill + shipSameAsBill (fixed) |
| 9 | Attachments | ✅ upload 201 → list → delete 200 |
| 10 | Timeline / History | ✅ 5 entries recorded |
| 11 | Archive / Restore | ✅ 200 / 200 |
| 12 | Persistence | ✅ all fields via GET |
| 13 | Print / PDF (`salesPrintUtils` PI rows) | ✅ source/sourceRef/validTill rows on print/PDF |
| 14 | WhatsApp / Email actions (list + view) | ✅ wired via `whatsappDocument`/`emailDocument` (generic, shared with quotations) |

### Document workflow (ERP parity)
| Flow | Status |
|---|---|
| Quotation → Sales Order → **DC / Proforma** | ✅ (SO has `generate-delivery-challan`, `convert-proforma`) |
| **DC → Invoice** | ✅ new |
| **Proforma → Sales Order** | ✅ new |
| **Proforma → Delivery Challan** | ✅ new |
| Proforma → Invoice | ✅ existing |

Customer/billing/shipping/items/qty/unit/price/discount/taxes/charges/totals/terms/attachments/status/document references all carried across every conversion (verified in generated `INV-2026-000001`, `SO-2026-000011`, `DC-2026-000009`).

---

## ❌ Broken — fixed (root cause, all verified)

| # | Module | File(s) | Root cause | Impact | Fix | Layer |
|---|---|---|---|---|---|---|
| 1 | DC + PI | `DeliveryChallanService.java`, `ProformaInvoiceService.java` | `create()`/`duplicate()` called `addTimeline`/`addHistory` **before** `save()` → `SalesTimeline.moduleId` (NOT NULL) was null | **Every create/duplicate returned HTTP 500** — modules were unusable | Persist first (`saveAndFlush`), then write timeline/history from the saved entity (same pattern as working QuotationService) | Backend |
| 2 | PI | `ProformaInvoiceService.duplicate()` | Discount/validTill/shipSameAsBill never copied to the duplicate | Silent data loss on duplicate | Copy `discount`, `validTill`, `shipSameAsBill` | Backend |
| 3 | DC | `DeliveryChallanService.duplicate()` | dispatchDate/deliveryDate never copied | Silent data loss on duplicate | Copy both dates | Backend |
| 4 | DC + PI | Services + Controllers + Entities + DTOs | No conversion endpoints existed (ERP supports DC→Invoice, PI→SO, PI→DC) | Workflow gap vs ERP | Added `POST /delivery-challans/{id}/convert-invoice`, `POST /proforma-invoices/{id}/convert-sales-order`, `POST /proforma-invoices/{id}/generate-delivery-challan`; added `convertedToInvoice/So/Dc` to entities + responses; added flat `discount` to `ProformaInvoiceRequest`; extended `normalizeStatus` (`accepted`/`delivered`/`converted`/`expired`) | Backend + Integration |
| 5 | DC + PI | `salesHelpers.js`, `SalesTotals.jsx`, `SalesFormPage.jsx`, `salesFormConfigs.jsx` | Discount treated as **percentage** (discountPct) while ERP/backend treat it as **flat**; edit-load copied derived % into flat field | Discount wiped on edit; grand total wrong in flat mode | `flatDiscount: true` for DC/PI configs; edit-load maps `raw.discount`; `SalesTotals` subtracts flat discount from grand total; PI serializer sends flat `discount` | Frontend |
| 6 | DC + PI | `salesPageConfigs.jsx`, `SalesViewPage.jsx` | Conversion actions + WhatsApp missing from list/view | Workflow gap vs ERP | Added Convert to Sales Order / Generate DC / Generate Invoice row+header actions, WhatsApp button, DC status map additions (`accepted`/`delivered`) | Frontend |
| 7 | DC + PI | `salesPrintUtils.js` | Print/PDF missing module-specific info (DC transport/vehicle/LR/eway/dates; PI source/validTill) | Incomplete printed document vs ERP | Added module-specific info rows | Frontend |

---

## ⚠ Needs attention (documented, out of scope or by design)

| Item | Detail | File(s) | Impact |
|---|---|---|---|
| Legacy print **route** (`/delivery-challans/print/:id`, `/proforma-invoices/print/:id`) uses `formatINR` (₹, Indian grouping) and ignores currency/numberFormat | Same limitation as quotations; the **real Print button** (design page → `window.print()`) is the format-aware path | `src/utils/salesPrintUtils.js` | Low — legacy surface only |
| Sequence generator | `buildDcNumber()`/`buildSoNumber()`/`buildInvoiceNumber()` in PI service share the module sequences with the native services (verified sequential `DC-2026-000001…000009` across both services, no collision in E2E). Under high concurrency a lock-free `count+1` could race — matches existing project pattern, no change made | `ProformaInvoiceService.java` | Low (consistent with existing modules) |
| `SalesFormPage.jsx` exhaustive-deps lint warning (`config.flatDiscount`) | Benign — config is a module constant | `SalesFormPage.jsx` | None |

---

## Files changed (this round)

**Backend (`erp-react/erp-backend/src/main/java/com/vishatech/erp/`)**
- `entity/DeliveryChallan.java` (+`convertedToInvoice`)
- `entity/ProformaInvoice.java` (+`convertedToSo`, +`convertedToDc`)
- `dto/DeliveryChallanResponse.java` (+`convertedToInvoice`)
- `dto/ProformaInvoiceResponse.java` (+`convertedToSo`, +`convertedToDc`)
- `dto/ProformaInvoiceRequest.java` (+flat `discount`)
- `service/DeliveryChallanService.java` (create/duplicate save-first fix; duplicate field copy; `convertToInvoice`; `normalizeStatus`; `InvoiceRepository`)
- `service/ProformaInvoiceService.java` (create/duplicate save-first fix; duplicate field copy; `convertToSalesOrder`; `generateDeliveryChallan`; flat-discount; `normalizeStatus`; repo injections)
- `controller/DeliveryChallanController.java` (+`POST /{id}/convert-invoice`)
- `controller/ProformaInvoiceController.java` (+`POST /{id}/convert-sales-order`, +`POST /{id}/generate-delivery-challan`)

**Frontend (`erp-react/src/`)**
- `utils/salesHelpers.js` (PI flat discount serialization; WhatsApp helper)
- `components/SalesForm/SalesTotals.jsx` (flat-mode grand total)
- `components/SalesForm/SalesFormPage.jsx` (flat-discount edit-load)
- `components/SalesDetail/SalesViewPage.jsx` (WhatsApp button)
- `config/salesFormConfigs.jsx` (`flatDiscount: true` for DC/PI)
- `config/salesPageConfigs.jsx` (DC/PI conversion + WhatsApp actions, status maps, links)
- `utils/salesPrintUtils.js` (DC transport / PI source rows)

**Tests / reports**
- `.audit-e2e/e2e_dc_pi.mjs` (55-assertion live API E2E, reusable)
- `E2E_TEST_REPORT.md` (§11 appended)
