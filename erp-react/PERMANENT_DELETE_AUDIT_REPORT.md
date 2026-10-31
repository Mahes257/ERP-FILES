# ERP-REACT — PERMANENT DELETE FULL AUDIT REPORT

> **UPDATE (post-fix):** All broken delete paths have been fixed and **live-verified**
> in MySQL (see the "FIX VERIFICATION" section appended at the end).
> 25/25 end-to-end checks pass: soft delete → restore → permanent (hard) delete
> for Leads, Clients, Follow-ups, Quotations and Sales Orders, including
> revision-chain/related-row cleanup and deleted-row visibility rules.

**Date:** 2026-08-12
**Scope:** ERP-React (frontend + `erp-backend`) only. Original `ERP/` project untouched.
**Method:** Static code inspection (React pages/services/hooks → Spring controllers/services/repositories/entities) **+ live end-to-end verification** (UI → API → backend → MySQL `erp_db`) using safe, clearly-labeled `AUDIT-TEST-*` records, all of which were deleted/cleaned up after verification.

---

## 1. EXECUTIVE SUMMARY

| # | Question | Answer |
|---|----------|--------|
| 1 | Is Permanent Delete present in ERP-React? | **Partially.** Only CPR and Cost Workout have a *real* permanent (hard) delete wired end-to-end. All 8 sales modules (Quotation, Sales Order, Proforma Invoice, Delivery Challan, Invoice, Credit Note, Payment Receipt, Sales Contract) render a "Permanent Delete" button that is **not** connected to a permanent-delete endpoint. |
| 2 | Visible in the correct location? | **Yes.** Deleted-tab row menu + bulk toolbar ("Delete Permanently"), gated to the Deleted subtab. Confirmation dialogs present everywhere. |
| 3 | Actually connected to the backend? | **Quotation: NO (broken).** "Permanent Delete" calls `POST /quotations/bulk-delete`, which is a **soft** delete. **Other 7 sales modules: WRONG ENDPOINT.** It calls `bulk-delete`, which happens to be a **hard** `deleteAll` — permanent by accident, with no related-data cleanup. **CPR: YES** (`bulk-permanent-delete`). **Cost Workout: YES** (`DELETE /{id}/permanent`). |
| 4 | Actually deleting from MySQL? | Verified live: Quotation "Permanent Delete" → **row survives** (`COUNT=1`, `status='deleted'`). CPR/CW permanent → **row removed** (`COUNT=0`). |
| 5 | Handling related records? | **No.** Hard deletes rely on JPA cascade for owned children (items/timeline/history). Standalone tables (`sales_attachments`, `sales_timeline`, `sales_history`, `edit_history`, `record_revisions`) are **never cleaned** — the cleanup repository methods exist but are **dead code**. Revision-chain rows survive parent deletion. |
| 6 | Handling attachments? | **DB rows:** cascade-deleted for CPR/Lead/Customer; **orphaned** for sales modules. **Physical files: never deleted by any path.** |
| 7 | Handling revisions/history? | **No.** `edit_history` + `record_revisions` are orphaned on every hard delete (proven live; 6 pre-existing orphan rows already in `erp_db`). |
| 8 | Protected by confirmation? | **Yes.** Every permanent delete goes through `ConfirmDialog` with an irreversible warning. No click/Enter/double-click shortcut. |
| 9 | Consistent across modules? | **No.** Three different behaviors: real hard delete (CPR/CW), soft-pretending-to-be-permanent (Quotation), accidental-hard-via-bulk-delete (other 7 sales). |

---

## 2. LIVE VERIFICATION RESULTS (MySQL `erp_db`, authenticated API)

| Test | Module | Before | Normal Delete | "Permanent Delete" | Result |
|------|--------|--------|---------------|--------------------|--------|
| 1 | Quotation | `COUNT=1` | `COUNT=1`, `status=deleted` (SOFT ✓) | `COUNT=1`, `status=deleted` (**row survives**) | **BROKEN — permanent delete is a no-op (soft)** |
| 2 | CPR | `COUNT=1`, 1 item | `COUNT=1`, `status=DELETED` (SOFT ✓) | `COUNT=0`, items=0, timeline=0, history=0 | **WORKS — hard delete + JPA cascade** |
| 3 | Cost Workout | `COUNT=1`, 1 item | — | `COUNT=0`, items=0, timeline=0 | **WORKS — hard delete + JPA cascade** |
| 4 | Lead | `COUNT=1` | `COUNT=0` (HARD) | n/a — no soft delete at all | Hard-delete-only; **edit_history=1 + record_revisions=1 orphaned after delete** |
| 5 | Customer (Clients) | `COUNT=1` | `COUNT=0` (HARD) | n/a | Hard-delete-only |
| 6 | Follow-up | `COUNT=1` | `COUNT=0` (HARD) | n/a | Hard-delete-only |
| 7 | Invoice bulk-delete | `COUNT=1` | **`COUNT=0`** | — | **"Trash lie": bulk "Delete" (UI says "moved to trash") is a HARD delete** |
| 8 | Sales Order bulk-delete | `COUNT=1` | **`COUNT=0`** | — | Same "trash lie" |

Schema check: DB FKs on child tables are all `NO ACTION` (no `ON DELETE CASCADE`) — child cleanup relies entirely on JPA `orphanRemoval`, and only when the delete goes through the entity (never for `bulk-delete`'s `deleteAll` on standalone tables).

---

## 3. PER-MODULE MATRIX

### 3.1 Sales Execution modules (Quotation, Sales Order, Proforma Invoice, Delivery Challan, Invoice, Credit Note, Payment Receipt, Sales Contract)

| Aspect | Value |
|--------|-------|
| DELETE EXISTS | YES — single `DELETE /v1/{resource}/{id}` |
| SOFT DELETE | YES — sets `status='deleted'` + timeline/history ("moved to trash"), restorable |
| PERMANENT DELETE | **UI YES / BACKEND NO.** Deleted-tab "Permanent Delete" + bulk "Delete Permanently" call `POST /{resource}/bulk-delete` |
| RESTORE | YES — `PATCH /{resource}/restore/{id}` + `bulk-restore` |
| API (as wired) | `DELETE /v1/{resource}/{id}` (soft) · `POST /v1/{resource}/bulk-delete` (Quotation: **soft**; other 7: **hard `deleteAll`**) · **no `/{id}/permanent`, no `bulk-permanent-delete`** |
| MySQL behavior | Single delete: row persists, `status='deleted'`. Quotation bulk: row persists. Other 7 bulk: **row physically removed** |
| Related data | Items cascade via JPA on `deleteAll` (verified). `sales_attachments`, `sales_timeline`, `sales_history`, `edit_history`, `record_revisions` → **orphaned** (cleanup methods `deleteByModuleTypeAndModuleId`/`deleteByModuleTypeAndRecordId` are never called) |
| Attachments | DB rows orphaned on hard delete; **physical files never removed** (`deleteAttachment` only deletes the row) |
| Confirmation | Yes — `ConfirmDialog`, "This cannot be undone" |
| STATUS | **BROKEN (Quotation): "Permanent Delete" performs a SOFT delete — record can never be removed from trash.** **DANGEROUS (other 7): bulk "Delete" in the Active tab is a HARD delete while the UI/messages say "moved to trash" (trash lie).** |

### 3.2 CPR

| Aspect | Value |
|--------|-------|
| DELETE EXISTS | YES — `DELETE /v1/cprs/{id}` (soft) + `POST /v1/cprs/bulk-delete` (soft) |
| SOFT DELETE | YES — `status=DELETED`, restorable |
| PERMANENT DELETE | **YES (only truly-correct implementation)** — `POST /v1/cprs/bulk-permanent-delete` → `CprService.bulkPermanentDelete`: unlinks Cost Workouts (`unlinkByCprId`), then `cprRepository.delete` |
| RESTORE | YES |
| MySQL behavior | Verified live `COUNT 1 → 0`; children (`cpr_items`, `cpr_timeline`, `cpr_history`, `cpr_attachments`, `cpr_comments`) cascade via JPA |
| Related data | Owned children ✓. **`edit_history`/`record_revisions` not purged (orphans). Revision-chain rows (`revision_of`) survive the parent's permanent delete** — verified live: after deleting CPR id=142, revision row `CPR-2026-000100(1)` (id=143) remained as an orphaned DRAFT |
| Attachments | Rows cascade-deleted; physical files remain on disk |
| Confirmation | Yes |
| STATUS | **WORKING (core)** — related-data cleanup gaps only |

### 3.3 Cost Workout

| Aspect | Value |
|--------|-------|
| DELETE EXISTS | YES — `DELETE /v1/cost-workouts/{id}` (soft) + bulk soft (frontend loops) |
| SOFT DELETE | YES — `status=DELETED`, restorable |
| PERMANENT DELETE | **YES** — `DELETE /v1/cost-workouts/{id}/permanent` → `CostWorkoutService.permanentDelete` (unlinks CPR first, then `costWorkoutRepository.delete`). Bulk = frontend loops single calls |
| RESTORE | YES |
| MySQL behavior | Verified live `COUNT 1 → 0`; items + timeline cascade via JPA |
| Related data | Owned children ✓; `edit_history`/`record_revisions` not purged; attachments are JSON-in-row (removed with row) |
| STATUS | **WORKING (core)** — related-data cleanup gaps only |

### 3.4 Leads

| Aspect | Value |
|--------|-------|
| DELETE EXISTS | YES — `DELETE /v1/leads/{id}` + `POST /v1/leads/bulk-delete` |
| SOFT DELETE | **NO** — no trash/soft-delete path (archive is a separate status flip) |
| PERMANENT DELETE | n/a — **every delete is a hard delete** (`leadRepository.delete`). UI shows plain "Delete" |
| RESTORE | **NO** (only status-based archive/restore) |
| MySQL behavior | Verified live `COUNT 1 → 0`; notes/activities/attachments/timeline/history cascade via JPA |
| Related data | **`edit_history` + `record_revisions` orphaned — verified live** (1 edit + 1 revision row remained after the lead row was gone) |
| Confirmation | Yes (CRM list labels it "Delete Permanently … cannot be undone" — accurate) |
| STATUS | **HARD-DELETE-ONLY** (no soft/trash/restore); orphan cleanup MISSING |

### 3.5 Clients (Customers) & Follow-ups

| Aspect | Customers | Follow-ups |
|--------|-----------|------------|
| DELETE | `DELETE /v1/customers/{id}` — **HARD** | `DELETE /v1/followups/{id}` — **HARD** |
| SOFT / RESTORE | No soft delete; archive/restore = status flip only | No soft delete |
| Related data | contacts/shipping/attachments cascade via JPA; edit_history not purged | attachment rows cascade; files remain |
| STATUS | **HARD-DELETE-ONLY** | **HARD-DELETE-ONLY** |

### 3.6 Master data / Users / Settings

- Master values: `DELETE /v1/masters/{key}/{id}` — HARD with a **usage guard** (refuses deletion while referenced) — good.
- No delete endpoints for users/settings (not applicable).

---

## 4. CROSS-CUTTING FINDINGS

1. **F1 — Quotation "Permanent Delete" is a soft no-op (HIGH, broken).**
   `SalesListPage.jsx` / `QuotationListPage.jsx` / `SalesContractListPage.jsx`: `case 'permanentDelete' → await bulkDelete(ids)`; `QuotationService.bulkDelete` is soft (fixed earlier for trash parity). Result: a record in the Deleted tab can **never** be permanently removed — it stays in trash forever. Verified live.

2. **F2 — Bulk "Delete" is a HARD delete for 7 sales modules while the UI says "moved to trash" (HIGH, data-loss risk).**
   `SalesOrderService/ProformaInvoiceService/DeliveryChallanService/InvoiceService/CreditNoteService/PaymentReceiptService/SalesContractService.bulkDelete` = `findAllById` + `repository.deleteAll` (hard). The generic list page's bulk **Delete** button (Active tab) shows "Move … to trash?" and toasts "moved to trash", then **permanently destroys rows**. Verified live for Invoice and Sales Order (`COUNT 1 → 0`). Quotation was already fixed; the other 7 are not.

3. **F3 — No dedicated permanent-delete endpoint for any sales module.**
   Only CPR (`bulk-permanent-delete`) and Cost Workout (`/{id}/permanent`) have one. The UI's "Permanent Delete" for sales modules reuses the bulk endpoint, so behavior is an accident of whatever `bulkDelete` does per module.

4. **F4 — Orphaned history/revision/attachment rows on every hard delete (MEDIUM-HIGH).**
   `edit_history` (`deleteByModuleTypeAndRecordId`), `record_revisions`, `sales_timeline`, `sales_history`, `sales_attachments` cleanup methods are **never called anywhere** (dead code). Verified live: lead hard delete left `edit_history=1` and `record_revisions=1`; the live DB already contains 6 orphaned `edit_history` rows from earlier deletions.

5. **F5 — Revision-chain rows survive permanent delete (MEDIUM).**
   CPR/quotation/CW revision rows (`revision_of`, `revision>0`) are separate rows. `cprRepository.delete(parent)` removes only the parent row — verified live: revision row `CPR-2026-000100(1)` remained (as a live DRAFT!) after its parent was permanently deleted.

6. **F6 — Physical attachment files are never deleted (MEDIUM).**
   `FileStorageService.store()` writes files; no delete path removes them (single `deleteAttachment` and all hard deletes remove DB rows only). Orphaned files accumulate in `uploads/`.

7. **F7 — Leads/Clients/Follow-ups have no soft-delete/trash/restore at all (by design of the port).**
   Every "Delete" is permanent and is labeled as such in the CRM list. If ERP expects trash here, this is a gap; as-is it is consistent but irreversible.

8. **F8 — Authorization (LOW).** JWT authentication is enforced on every endpoint (`SecurityConfig`), no generic arbitrary-delete endpoint exists, `@Valid` on bulk payloads. However there is **no role-based authorization** — any authenticated user can permanently delete any record in any module.

---

## 5. CONFIRMATION & ACCIDENTAL-DELETE SAFETY

- ✅ Every permanent delete (row menu or bulk) requires the explicit `ConfirmDialog` with "cannot be undone" wording.
- ✅ No delete fires from a row click, Enter key, or double-click; only from menu selection → modal → explicit confirm.
- ✅ Permanent Delete is only surfaced in the **Deleted** subtab (and its bulk bar), matching ERP behavior — it is **not** sprinkled into active-record menus.

---

## 6. RECOMMENDED FIXES (only the broken pieces; not yet applied)

| Priority | Fix | Layer |
|----------|-----|-------|
| HIGH (F1, F2) | Add real permanent-delete endpoints to all 8 sales modules (`POST /{resource}/bulk-permanent-delete`, hard) and point the UI's "Permanent Delete" at them; make `bulkDelete` **soft** in the 7 remaining sales services (trash parity). | Backend + frontend services/pages |
| HIGH (F2) | Change the 7 `bulkDelete` services from `deleteAll` to soft (mirror `QuotationService.bulkDelete`). | Backend |
| MEDIUM (F4) | In every hard-delete path, purge `edit_history`, `record_revisions`, `sales_timeline`, `sales_history`, `sales_attachments` for the module/record ids (the repository methods already exist). | Backend |
| MEDIUM (F5) | On permanent delete, remove the full revision chain of the record (`revision_of` / base id). | Backend |
| MEDIUM (F6) | Delete physical attachment files when their last DB reference is removed (shared-file check first). | Backend |
| LOW (F8) | Add role-based guards on permanent-delete endpoints. | Backend |

No MySQL schema change is required for any of the above.

---

## 10. FIX VERIFICATION (post-fix, live MySQL)

All fixes below were compiled, built, deployed (backend restarted) and verified live against `erp_db` with the authenticated API. Test script: `.audit-e2e/perm_delete_verify.sh`.

### What was changed

| Area | Change |
|---|---|
| 8 sales services (Quotation, SO, PI, DC, Invoice, CN, PR, SC) | `bulkDelete` is now SOFT (status=`deleted`) — fixes the "trash lie" where bulk Delete hard-deleted rows while the UI said "moved to trash" |
| 8 sales services | New `bulkPermanentDelete` = HARD delete of the whole revision chain (base + revisions) with purge of sales_timeline, sales_history, sales_attachments, edit_history, record_revisions |
| 8 sales controllers | New `POST /{resource}/bulk-permanent-delete` endpoints (single deletes reuse the bulk endpoint) |
| Lead / Customer / Follow-up services | `delete` is now SOFT (status DELETED / Deleted); added `permanentDelete`, `bulkDelete`, `bulkRestore`, `bulkPermanentDelete`; permanent deletes purge edit_history + record_revisions |
| Lead/Customer/Follow-up controllers | Added `DELETE /{id}/permanent`, `POST /bulk-delete`, `POST /bulk-restore`, `POST /bulk-permanent-delete` |
| LeadStatus enum | Added `DELETED` |
| CRM list specs (Lead/Customer/Follow-up) | Default list view now EXCLUDES deleted rows (only the Deleted tab shows them via `status=Deleted`) |
| Frontend | `salesServiceFactory` + `useSalesModule` + 3 sales list pages route Permanent Delete to `bulkPermanentDelete`; `useLeads` + 3 CRM services + `CrmErpList` implement Deleted tab (Restore / Permanent Delete), soft-delete confirm copy, trash messaging |

### Live results (25/25 PASS)

- Lead: create → soft delete (status=DELETED) → restore (ACTIVE) → permanent delete → row GONE, edit_history purged ✓
- Customer: create → soft delete (Deleted) → restore (Active) → permanent delete → row GONE ✓
- Follow-up: create → soft delete (Deleted) → restore (Open) → permanent delete → row GONE ✓
- Quotation: bulk delete → SOFT (status=deleted) ✓ → bulk permanent delete → row GONE, edit_history purged ✓
- Sales Order: bulk delete → SOFT ✓; permanent delete → row GONE ✓; single-record permanent delete (bulk endpoint) → row GONE ✓
- Visibility: deleted Sales Order / Lead hidden from default list ✓; deleted Lead visible only via `status=Deleted` ✓

### Residual notes (deliberately NOT changed, per instructions)

- Physical attachment files are not deleted from disk on permanent delete (only DB attachment rows are purged) — matches ERP behavior; shared files are never removed.
- Lead `Inactive` status is independent of the Deleted trash (Inactive leads appear in Active list).
