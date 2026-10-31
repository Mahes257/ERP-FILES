# CPR & Quotations Modules — End-to-End Audit Report (erp-react)

**Date:** 06-Aug-2026
**Scope:** `sri/erp-react` (working project) vs `sri/ERP` (reference — functional & UI only)
**Method:** Every finding below was verified from the actual implementation (React source, Spring Boot source, DTOs, entities, config). No code was modified.
**Status:** AUDIT COMPLETE — 2 critical, 6 high, 8 medium, 6 low issues.

---

## 1. Project Structure Mapping (Audit Task 1)

```
erp-react/
├── src/                                  # React frontend (Vite + Tailwind)
│   ├── api/axiosInstance.js              # axios, baseURL /v1, JWT bearer, 401/403 → signin
│   ├── App.jsx                           # All routes (lazy-loaded, ProtectedRoute)
│   ├── pages/
│   │   ├── Cprs.jsx / AddCpr.jsx / EditCpr.jsx / CprView.jsx / CprReports.jsx
│   │   ├── QuotationView.jsx             # CPR-linked quotation preview (fallback)
│   │   └── sales/
│   │       ├── Quotations.jsx            # Quotations() / QuotationDetails() / AddQuotation() / EditQuotation()
│   │       ├── QuotationApproval / Convert / Email / Design / Print / Report / Dashboard
│   │       ├── QuotationRevision / Timeline / LinkedDocuments / Workflows / Comparison
│   ├── components/
│   │   ├── CprTable/  CprForm/  CprDetail/   # CPR list, form, view pieces
│   │   ├── SalesTable/SalesListPage.jsx      # generic list (used by Quotations list)
│   │   ├── SalesDetail/SalesViewPage.jsx     # generic view (used by QuotationDetails)
│   │   ├── SalesForm/QuotationFormPage.jsx   # ERP-identical quotation create/edit form
│   │   └── Common/EditableMasterDropdown.jsx # backend-driven master dropdown (CRUD)
│   ├── services/  cprService.js, quotationService.js, salesServiceFactory.js, masterService.js …
│   ├── hooks/     useCprs.js, useSalesModule.js, useDebounce.js …
│   ├── utils/     cprHelpers.js, cprMock.js, cprExportUtils.js, cprReportUtils.js,
│   │              salesHelpers.js, quotationGrid.js, quotationCurrency.js …
│   ├── config/    salesPageConfigs.jsx (quotationListConfig, quotationViewConfig)
│   └── constants/ salesConstants.js (static dropdown options)
└── erp-backend/src/main/java/com/vishatech/erp/   # Spring Boot 3, context-path /v1, port 8080
    ├── controller/  CprController, QuotationController, MasterController, FileController …
    ├── service/     CprService, QuotationService, MasterValueService, FileStorageService …
    ├── repository/  CprRepository, QuotationRepository, MasterValueRepository …
    ├── entity/      Cpr, CprItem, CprAttachment, CprComment, CprHistory, CprTimeline,
    │                Quotation, QuotationItem, MasterValue …
    └── dto/         CprRequest/Response, QuotationRequest/Response …
resources/application.properties: MySQL `erp_db` (localhost:3306), ddl-auto=update, JWT, uploads dir
```

**Data-flow chain (task 4):** `React component → services/*.js → axiosInstance (JWT, /v1) → Vite dev proxy → Spring Boot (/v1) → Repository → MySQL erp_db`. Verified for every CPR and Quotation CRUD + workflow call. Both modules are **real MySQL-backed**; there is no React-state-only persistence for business documents.

---

## 2. CPR Module — Audit Result (Tasks 2, 5–10)

### ✅ Working correctly
| Feature | Verified flow |
|---|---|
| List (server pagination/search/sort/filter) | `GET /cprs` + Spring Data Specification; status/approval/department/date/amount filters |
| Create / Edit / Draft autosave (30s) | `POST/PUT /cprs`, draft flag; `next-number` = CPR-YYYY-######; grand total & profit % recomputed server-side |
| Delete / Archive / Restore (soft) | `DELETE`/`PATCH` set status DELETED/ARCHIVED; timelines + history rows written |
| Bulk ops | archive/restore/delete (soft) + **permanent delete** (unlinks Cost Workouts first) |
| Approval workflow | submit / approve / reject / send-back (remarks enforced) — all recorded in timeline + history with user/role/IP/device audit |
| Convert to Quotation | Creates a **real Quotation row in MySQL** (`createFromCpr`), links `quotationId`/`convertedToQtn`, blocks duplicates |
| Duplicate | Deep-copies header + items into a new DRAFT CPR |
| Attachments | Multipart upload (≤10MB), list, replace, delete; file on disk + metadata row in MySQL; served via `/v1/files/…` |
| Comments / Timeline / History | Full CRUD over `cpr_comments`, `cpr_timeline`, `cpr_history` |
| Reports & KPIs | `/cprs/stats`, `/cprs/reports/summary` — real MySQL aggregates (incl. Cost-Workout cost analysis) |
| Export | Backend CSV (`POST /cprs/export`), client-side Excel/PDF/Print |
| View page | View/Edit/Submit/Approve/Send-Back/Reject/Duplicate/Convert/Archive/Restore/Delete, Preview modal, Print, PDF, Share, Email |
| Master dropdowns | Department / Requester / Priority / UOM → `master_values` via `/masters/{key}` with add/edit/delete + usage guard; seeded by `MasterDataSeeder` |
| Lead/Client source lookup | Real `/leads` + `/customers` data, auto-fills details and records source identity |

### ⚠ Needs attention
1. **CPR list filter uses hardcoded departments**
   - Files: `src/components/CprTable/CprFilterPanel.jsx` (imports `DEPARTMENTS` from `src/utils/cprMock.js`)
   - Root cause: the Department filter options are a static 12-item array; the form's Department dropdown is backend-driven.
   - Impact: a department added via the form ("Quality", …) is saved to MySQL but never selectable in the list filter.
   - Layer: **Frontend**. Fix: load filter options from `masterService.list('pr_departments')` (same call the form uses).

2. **Source lead/client identity is not persisted**
   - Files: `src/utils/cprHelpers.js` (`serializeCpr` sends `sourceType/sourceId/leadId/clientId`) vs `dto/CprRequest.java` (no such fields)
   - Root cause: Jackson silently drops unknown JSON properties (Spring Boot default), so only the name strings (`sourceLead`, `clientName`, `leadNo`) are stored.
   - Impact: the real lead/client **id link is lost**; on Edit the source combobox cannot be restored (worked around by name fallback in `EditCpr.jsx`).
   - Layer: **Integration**. Fix (frontend-only): treat `sourceLead`+`leadNo` as the source of truth and drop the misleading identity fields, OR (backend) add `sourceType/sourceId` to `CprRequest` + persist.

3. **No seed/demo data for CPR (and Quotations) on a fresh database**
   - Files: `erp-backend/.../config/DataSeeder.java` (seeds only users/leads/products/customers)
   - Impact: first run shows empty CPR/Quotation lists even though `src/utils/cprMock.js` contains a rich `MOCK_CPRS` (currently **dead code** — only status/department constants are imported). Not a defect, but the reference ERP ships with seeded data.
   - Layer: **Backend** (or delete `MOCK_CPRS` as dead code — frontend-only cleanup).

4. **Create-form Status dropdown is decorative**
   - Files: `src/pages/AddCpr.jsx` (payload forces `status: 'draft'`), `src/components/CprForm/CprForm.jsx` (STATUS_OPTIONS incl. Open/Closed/Cancelled/Submitted)
   - Impact: user-selected status on a new CPR is ignored; record always starts DRAFT (matches reference save('draft') behaviour, but the dropdown implies otherwise).
   - Layer: **Frontend**. Fix: hide/disable the Status field on create or honour the selection.

### ❌ Broken / Missing
- None found in the CPR module's core persistence or workflow paths.

---

## 3. Quotations Module — Audit Result (Tasks 2, 5–10)

### ✅ Working correctly
| Feature | Verified flow |
|---|---|
| List (server pagination/search/sort/filter) | `GET /quotations` + Specification; status/client/salesPerson/date/validTill/amount filters |
| Create / Edit | `POST/PUT /quotations`, unique `quotationNo` (QTN-YYYY-######) enforced server-side; totals recomputed with the exact ERP formula (gross→disc→net→CGST/SGST→grand) |
| Status workflow | `POST /{id}/status` (normalizeStatus), `send`, duplicate (deep copy → DRAFT), archive/restore (soft), single delete (soft → trash) |
| Convert to Sales Order | `POST /{id}/convert-sales-order` creates a real `SalesOrder` row + sets `convertedToSo`; duplicate conversion blocked |
| Attachments / Timeline / History | MySQL-backed, same pattern as CPR |
| Export / KPIs | Backend CSV, client-side PDF/Print, `/quotations/stats` |
| Exchange rates | `/exchange-rates` (open.er-api.com cached 24h); live currency conversion in form; "Recalculate with Latest Rates" on the view page |
| Auto-fill sources | Client lookup (`/customers`), Product modal (`/products`), Source Cost Workout (`/cost-workouts` → pre-fills items + client + reference) |
| View / Approval page / Email / WhatsApp / Design | View tabs, approval list (approve→accepted, reject→rejected via changeStatus), mailto + wa.me deep links, design page editing (`update`) |
| Tax / charges / T&C / notes persistence | `taxType`, `gstRate` per item, `cgst/sgst/taxTotal`, `discount`, `charges`, `freight`, `insurance`, `terms` (TEXT), `additionalInfo`, `remarks` all stored in MySQL |

### ❌ Broken / Missing
1. **SKU is silently dropped on every save** (data loss)
   - Files: `src/utils/salesHelpers.js` (`mapItems` serializes `productId, productName, description, hsn, unit, qty, rate, discountPct, gstRate, amount` — **no `sku`**)
   - Root cause: `QuotationItemRequest.java` and the DB column support `sku`, and the ERP reference persists it (`ERP/js/quotation-create.js` → `d.items.push({name, sku, hsn, …})`), but the frontend serializer never emits it.
   - Impact: SKU typed in the grid shows during editing (edit-load reads `it.sku`) but is erased from MySQL on the next save. Silent data loss vs reference.
   - Layer: **Frontend**. Fix: add `sku: item.sku || ''` to `mapItems` (1 line).

2. **Terms & Conditions are wiped when a quotation is edited**
   - Files: `src/components/SalesForm/QuotationFormPage.jsx` — `setTerms` only called by user actions; edit-load (`useEffect` on `id`) never repopulates the `terms` array; `save()` sends `terms: buildTermsString()` which is `''` on edit.
   - Root cause: T&C are loaded into `form.terms` (string) on edit but saved from the separate, empty `terms` state array.
   - Impact: opening an existing quotation and clicking Save erases the stored T&C (view page shows them, then they vanish after any edit). Critical data loss.
   - Layer: **Frontend**. Fix: on edit-load, seed the `terms` array from `raw.terms` (split on `\n`, `'Title: Desc'`) — exactly what the reference does (`_set('qtnTerms', q.terms)`).

3. **Bulk Delete performs a HARD delete while the UI promises trash**
   - Files: `erp-backend/.../service/QuotationService.java` (`bulkDelete` → `quotationRepository.deleteAll(quotations)`), `src/components/SalesTable/SalesListPage.jsx` (confirm message "Move … to trash?")
   - Root cause: single delete is soft (`status='deleted'`), but bulk delete physically removes rows; the "Delete Permanently" action also maps to the same `bulkDelete`.
   - Impact: selecting rows + Delete permanently destroys records that the user was told go to the trash; no bulk-permanent-delete separation (CPR has one, Quotation does not). Data-loss risk.
   - Layer: **Backend**. Fix: change `bulkDelete` to soft delete (mirror `bulkArchive`/CPR), and add a separate hard-delete endpoint used only by the Deleted tab.

4. **QuotationDesign "More" menu calls non-existent endpoints (404)**
   - Files: `src/pages/sales/QuotationDesign.jsx` (`runDocAction` → `postAction(doc.id, action)`) vs `controller/QuotationController.java`
   - Missing endpoints: `convert-delivery-challan`, `convert-invoice`, `convert-proforma`, `convert-purchase-order`, `accept`, `cancel` — none exist.
   - Impact: Generate Delivery Challan, Convert To Invoice/Proforma/PO, Accept Document, Cancel Quotation all fail with "Action failed". Only `send`, `duplicate`, `convert-sales-order`, `delete` work.
   - Layer: **Integration**. Fix (frontend-only): route these through the existing supported flows (`changeStatus(id,'accepted')` for accept, `changeStatus(id,'cancelled')` for cancel, `convert-sales-order` for SO, and hide the unsupported conversions) — or add the endpoints server-side (listed separately).

5. **QuotationComparison is 100% mock data**
   - Files: `src/pages/sales/QuotationComparison.jsx` — vendors, scores, prices, lead times generated by `seededRandom()`; "Finalize Supplier Selection" only shows a toast.
   - Impact: audit task 7 — frontend-only persistence/fake data page. Nothing is fetched, nothing is saved.
   - Layer: **Frontend**. Fix: wire to backend data or mark the page as a design mock (recommend removing it from navigation until an RFQ/vendor module exists in erp-react).

6. **QuotationWorkflows is an "under development" stub**
   - Files: `src/pages/sales/QuotationWorkflows.jsx` (static placeholder text)
   - Impact: route exists but delivers nothing, while the reference has `quotation-workflows.html`. Missing functionality.
   - Layer: **Frontend**. Fix: implement from the reference, or hide the nav entry.

### ⚠ Needs attention
1. **Approver comments are not persisted**
   - Files: `src/pages/sales/QuotationApproval.jsx` (comment textarea discarded; approve/reject = `changeStatus` only)
   - Impact: reviewer remarks lost; no approval audit trail per decision (CPR module has full remarks/history — inconsistent).
   - Layer: **Frontend/Backend**. Fix: send the comment through an approve/reject endpoint that stores remarks + history (backend change), or reuse `remarks` field.

2. **Two different "Convert" flows both mark the quotation `converted`**
   - Files: `src/pages/sales/QuotationConvert.jsx` (creates a **Sales Contract** via `salesContractService.create` then `changeStatus(…,'converted')`) vs list/view actions using `POST /convert-sales-order` (creates a **Sales Order** and sets `convertedToSo`).
   - Impact: converting via the Convert page to SC blocks later SO conversion (backend rejects `converted`); no `convertedToSo`/link is set by the SC path; the two flows disagree on the target document.
   - Layer: **Integration**. Fix: unify on `convert-sales-order` (or persist a proper SC link + `convertedToSc`), and keep one conversion path.

3. **Group / Description / Image item rows are not persisted**
   - Files: `src/components/SalesForm/QuotationFormPage.jsx` (addGroupRow/addDescRow/addImageRow) — `save()` serializes only `items.filter(rowType==='item')`; `QuotationItemRequest` has no fields for them.
   - Impact: these React-only grid features disappear after save/reload (they are not in the ERP reference either, but the UI advertises them).
   - Layer: **Frontend/Backend**. Fix: either remove the row types from the UI or extend the item model (backend).

4. **Design-page versions & templates are React-state only**
   - Files: `src/pages/sales/QuotationDesign.jsx` (`saveVersion` → `setVersions`, `createTemplate` → `setTemplates`)
   - Impact: "Save Version" appears successful but is lost on refresh; version history is not persisted (no endpoint).
   - Layer: **Frontend**. Fix: remove or wire to a versions endpoint (backend).

5. **"Document saved locally" toast on failed save**
   - Files: `QuotationDesign.jsx` `manualSave()` — `catch { toast.success('Document saved locally') }`
   - Impact: misleading success when the backend update actually failed.
   - Layer: **Frontend**. Fix: show the real error.

6. **Approval-history tab is always empty**
   - Files: `QuotationDesign.jsx` reads `doc.approvalHistory`/`doc.approvals`; `QuotationResponse.java` never returns such fields.
   - Impact: design-page approval history panel never shows data.
   - Layer: **Integration**. Fix: derive from `history` (already returned) on the frontend.

7. **Dead statuses counted in `/quotations/stats`**
   - Files: `QuotationService.stats()` counts `pending approval`, `approved`, `viewed` — `normalizeStatus()` maps all three to `draft`, so they can never exist.
   - Impact: harmless today (frontend KPI map doesn't use them) but misleading; dead code.
   - Layer: **Backend**. Fix: drop the unreachable keys.

8. **Quotation UI preferences live only in localStorage**
   - Files: `src/utils/quotationGrid.js` (`qtn_number_format_settings`, `qtn_column_config`)
   - Impact: number format & column layout are per-browser, not per-user; a code comment in `QuotationFormPage.save()` claims they "persist with the document" but Jackson drops unknown props — they do not reach MySQL.
   - Layer: **Frontend**. Fix: correct the comment and/or persist preferences to the backend if cross-device sync is required.

---

## 4. Frontend-Only Persistence Detection (Audit Task 7)

| Pattern | Where | Verdict |
|---|---|---|
| `localStorage` for business data | — | **None found** for CPR/Quotation documents |
| `localStorage` (auth/theme/prefs) | `axiosInstance.js` (authToken/authUser), `main.jsx`, `ThemeContext.jsx`, `quotationGrid.js` (number/column prefs) | Acceptable — auth + UI preferences only |
| `sessionStorage` | — | None used |
| Mock/fallback data | `cprMock.js` (`MOCK_CPRS` — **unused** except filter constants); `QuotationComparison.jsx` (generated vendor data); `QuotationWorkflows.jsx` (stub) | Dead code + 2 non-functional pages |
| Temporary React state used as data store | `QuotationDesign.jsx` versions/templates; form `terms`/`items`/`logo`/`sigPreview` (edit loses terms; logo/sig never persisted — same limitation as the reference) | ⚠ |
| `useLocalStorage.js` hook | No imports anywhere | Dead code — remove |
| Hardcoded JSON | `salesConstants.js` (cities/states/currencies/executives/statuses) | Reference data — matches the reference ERP's hardcoded dropdowns |

**Task 9 answer:** Yes — CPRs and Quotations (headers, items, attachments metadata, comments, timeline, history) are stored in MySQL (`erp_db`) through the existing Spring Boot backend. Verified end-to-end. The only exceptions are the data-loss items listed in §3.

## 5. Dropdown Verification (Audit Task 8)

| Dropdown | Source | Persists after Save/Refresh/Reopen? |
|---|---|---|
| CPR: Department / Requester / Priority / UOM | **Backend** `master_values` via `/masters/{key}` (CRUD, usage-guarded delete) | ✅ Yes (value stored in CPR row; options reload from MySQL on open) |
| CPR: Status / Approval Status (form + list) | Static maps (`cprHelpers`, `cprMock`) mapped to backend enums | ✅ Yes (enum persisted) |
| CPR: Department filter (list) | **Hardcoded** `cprMock.DEPARTMENTS` | ⚠ No — misses user-added departments |
| QTN: UOM per item | **Backend** `master_values` (`units`), "Manage Units…" modal | ✅ Yes |
| QTN: Client / Product / Cost Workout | **Backend** `/customers`, `/products`, `/cost-workouts` | ✅ Yes (`clientId` + copied fields stored) |
| QTN: Tax type / Currency / Number format / Signature type / Payment & delivery terms | Static constants (`salesConstants.js`) | ✅ Yes (values stored on the row; note currency uses live backend exchange rates) |
| QTN: Sales Person filter (list) | **Hardcoded** `SALES_EXECUTIVES` (7 names) | ⚠ matches seeded users today, but diverges if users change |

## 6. Integration Gaps / Payload Mismatches / Validation (Audit Task 10)

- **Silently-dropped payload fields** (Jackson non-strict): CPR `sourceType/sourceId/leadId/clientId`; QTN `productId/productName/amount` (item), `numberSystem/decimalDigits/columnConfig` (form prefs). Dropping the prefs is fine; dropping source identity is a data gap (§2-2).
- **QTN SKU** — dropped in the frontend serializer, not the backend (worst of both: backend supports it).
- **QTN bulk delete** hard-deletes (§3-3).
- **Design page** posts to 6 endpoints that don't exist (§3-4).
- **Validation gaps:** QTN create requires only quotationNo + client + ≥1 item (no validTill/date checks — reference behaved the same); CPR validation is thorough (dates, source, per-item rules, duplicate descriptions).
- **Security note:** `/files/**` is `permitAll` in `SecurityConfig` — any attachment URL is publicly downloadable without a token. Outside the audited flows but worth flagging.

---

## 7. Master Issue Register

### ❌ Critical (data loss)
| # | Module | Screen | Files | Root cause | Impact | Layer | Fix |
|---|---|---|---|---|---|---|---|
| C1 | Quotation | Create/Edit form | `salesHelpers.js` `mapItems` | `sku` not serialized (backend + reference support it) | SKU erased from MySQL on every save/edit | Frontend | Add `sku` to `mapItems` |
| C2 | Quotation | Edit form | `QuotationFormPage.jsx` | `terms` state never seeded on edit; save sends `buildTermsString()` = `''` | T&C wiped on any edit save | Frontend | Seed terms array from `raw.terms` on load (as reference does) |

### 🔴 High
| # | Module | Screen | Files | Root cause | Impact | Layer | Fix |
|---|---|---|---|---|---|---|---|
| H1 | Quotation | List bulk actions | `QuotationService.bulkDelete` | Hard `deleteAll` while UI says trash; no permanent-delete endpoint | Bulk delete destroys records permanently | Backend | Soft-delete in bulk; add separate permanent-delete endpoint |
| H2 | Quotation | Design & Share | `QuotationDesign.jsx` + `QuotationController` | 6 actions POST to endpoints that don't exist | Accept/Cancel/Convert-to-DC/Invoice/Proforma/PO fail (404) | Integration | Frontend: use `changeStatus`/existing endpoints; hide unsupported |
| H3 | Quotation | Comparison page | `QuotationComparison.jsx` | Fully generated mock (seededRandom), no API | Fake data, selection not persisted | Frontend | Wire to backend or remove from nav |
| H4 | Quotation | Workflows page | `QuotationWorkflows.jsx` | Placeholder "under development" | Route is a stub vs reference `quotation-workflows.html` | Frontend | Implement or remove from nav |
| H5 | CPR | List filters | `CprFilterPanel.jsx` + `cprMock.js` | Hardcoded department list | User-added departments missing from filter | Frontend | Load from `/masters/pr_departments` |
| H6 | Quotation | Approval page | `QuotationApproval.jsx` | Comment discarded; approve/reject via `changeStatus` | No audit trail/remarks for decisions | Frontend/Backend | Persist remarks + history on decision |

### 🟡 Medium
| # | Module | Screen | Files | Impact | Layer |
|---|---|---|---|---|---|
| M1 | CPR | Create/Edit | `cprHelpers.js` vs `CprRequest.java` | Source lead/client id link not persisted | Integration |
| M2 | Quotation | Convert page | `QuotationConvert.jsx` | SC conversion marks `converted`, blocks SO conversion; no link field set | Integration |
| M3 | Quotation | Create/Edit | `QuotationFormPage.jsx` | Group/desc/image rows not persisted (UI advertises them) | Frontend/Backend |
| M4 | Quotation | Design | `QuotationDesign.jsx` | Versions/templates only in React state — lost on refresh | Frontend |
| M5 | Quotation | Design | `QuotationDesign.jsx` | "Document saved locally" toast on failed save | Frontend |
| M6 | Quotation | Design | `QuotationDesign.jsx` | Approval-history panel reads fields the backend never returns | Integration |
| M7 | Quotation | Dashboard/KPIs | `QuotationService.stats()` | Unreachable statuses counted (pending approval/approved/viewed → draft) | Backend |
| M8 | Both | Fresh install | `DataSeeder.java` | No CPR/Quotation demo data; `MOCK_CPRS` dead code | Backend/Frontend |

### 🟢 Low
| # | Module | Impact | Layer |
|---|---|---|---|
| L1 | Quotation | Number format/column prefs localStorage-only; misleading comment in `save()` | Frontend |
| L2 | Both | Logo & signature images (dataURL) not persisted (same limitation as reference) | Frontend |
| L3 | CPR | Create-form Status dropdown ignored (always Draft) | Frontend |
| L4 | Both | `/files/**` served without authentication | Backend |
| L5 | Quotation | Status filter options for Sales Person hardcoded (matches seeded users today) | Frontend |
| L6 | Both | `useLocalStorage.js` hook unused — dead code | Frontend |

---

## 8. Backend-Only Changes Required (listed, NOT implemented)

These cannot be fixed frontend-only:
1. **H1** — `QuotationService.bulkDelete` → soft delete; add `POST /quotations/bulk-permanent-delete` for the Deleted tab.
2. **H6/M** — Add `POST /quotations/{id}/approve` and `/reject` (remarks) that persist remarks + history (parity with CPR).
3. **M1** — Add `sourceType`/`sourceId` to `CprRequest` and persist them.
4. **M3** — Extend the quotation item model for group/desc/image rows (if those UI features are kept).
5. **M7** — Remove unreachable status keys from `stats()`.
6. **L4** — Protect `/files/**` (JWT) or move to signed URLs.
7. **M8 (optional)** — Seed demo CPRs/Quotations (mirrors reference).

---

## 9. Conclusion

The **CPR module is production-grade**: every screen and workflow (Create/Edit/Draft autosave/Delete/Archive/Restore/Bulk/Submit/Approve/Reject/Send-Back/Duplicate/Convert-to-Quotation/Attachments/Comments/Timeline/History/Reports/Export/Preview/Print/PDF/Email/Share) is fully wired to MySQL with audit trails. No critical issues.

The **Quotations module** is largely backend-complete (all header/items/taxes/charges/T&C fields exist in MySQL and totals are recomputed server-side with the exact ERP formula), but has **two critical frontend data-loss defects** (SKU and Terms on edit), a **dangerous bulk-delete behaviour**, and **several secondary pages that are disconnected or broken** (Design "More" menu 404s, Comparison mock, Workflows stub). Fixes are mostly frontend-only (C1, C2, H3–H5 are pure frontend; H1/H2/H6 need the listed backend support).

*End of report — CPR and Quotations modules fully audited.*
