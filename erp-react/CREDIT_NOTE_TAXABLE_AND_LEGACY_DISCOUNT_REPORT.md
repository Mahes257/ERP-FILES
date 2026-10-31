# Credit Note — detail Taxable Amount fix + legacy discount preservation

**Targets:** `http://localhost:5173/credit-notes/5` (detail) · `http://localhost:5173/credit-notes/new` (creation)
**Date:** 2026-10-15 · **Branch:** `main` @ `93a76c3` (unchanged) · Nothing staged, committed, stashed, reverted or written to the shared `erp_db`.

> **Repository path:** `C:\Users\Maheswaran\Desktop\Sri\erp-react` does not exist on this machine. The same
> checkout is at `C:\Users\Mahes\Desktop\Sri\erp-react` (`main` @ `93a76c3`, same origin/main) — all work was
> done there. Confirm the intended path if that matters.

---

## 1. Files changed (5 this round; 2 new test files)

| File | Why |
| --- | --- |
| `src/utils/detailColumns.js` | **Fix 1.** The `taxable` resolver now also reads `netAmount` (appended after `taxable`/`taxableAmount`), so the Credit Note detail item table shows the real taxable value instead of ₹0.00. |
| `src/components/SalesForm/CreditNoteFormPage.jsx` | **Fix 2.** The item normalizer now applies to **new records only** (`return isEdit ? list : withoutDiscount(list)`) — a legacy note's stored lines load verbatim; a restored draft (always a new record) drops any discount an older build wrote into it; the Totals card receives the record's own `discountPct` **read-only** (no change handler). |
| `src/components/SalesForm/SalesTotals.jsx` | **Fix 2.** The credit-note branch again computes `Taxable Value = Sub Total − (per-item discounts + header %)`, but the Discount row renders **only when a discount is really present** and no discount input exists for the credit note. A discount-free (new) note is unchanged: Taxable Value = Sub Total, no Discount row. |
| `src/utils/salesHelpers.js` | **Fix 2.** `serializeCreditNote` mirrors the record: the header `discountPct` from the form (0 for a new note) and `items: mapItems(items)` — no credit-note-specific zeroing, so saving cannot erase stored history. `withoutDiscount` docs updated (new records only). |
| `src/utils/creditNoteTaxableAmount.test.js` *(new)* | Focused vitest suite for the detail `Taxable Amount` resolver (7 tests). |
| `src/utils/creditNoteDiscount.test.js` *(updated)* | Legacy preservation math + payload, next to the code (14 tests). |
| `tests/credit-note-discount-removal.test.js` *(updated)* | Wiring suite re-pointed at the new policy + 2 new tests (legacy hydration, serializer mirror). |
| `CREDIT_NOTE_DISCOUNT_REMOVAL_REPORT.md` *(updated)* | Its legacy-discount paragraph is marked superseded and re-pointed here, so the two reports cannot contradict each other. |

No backend file, DTO, entity, service, schema or migration was touched. Backend inspection showed none is
needed: the API already returns everything required and stores whatever it is given.

## 2. Confirmed API semantics and the root cause of ₹0.00

Read-only `GET /v1/credit-notes/5` (same origin as the app, token from `localStorage`):

```json
{ "cnNo": "CN-2026-000004", "discountPct": 0, "discount": 0,
  "subTotal": 200, "cgstTotal": 18, "sgstTotal": 18, "taxTotal": 36, "grandTotal": 236,
  "items": [ { "qty": 2, "rate": 100, "discountPct": 0, "gstRate": 18,
               "grossAmount": 200, "discountAmount": 0, "netAmount": 200,
               "cgst": 18, "sgst": 18, "total": 236 } ] }
```

* The item object **has no `taxable` or `taxableAmount` field at all** — its fields are
  `qty, rate, discountPct, gstRate, grossAmount, discountAmount, netAmount, cgst, sgst, total`.
* `CreditNoteService.itemResponse` computes `net = gross − gross × discountPct / 100`, then
  `cgst = net × gst/200`, `sgst = net × gst/200`, `total = net + cgst + sgst`. So **`netAmount` is the
  value GST is applied to — the taxable value** (200 + 18 + 18 = 236 confirms it, and `netAmount = 200`
  matches the row's `Rate 100 × Qty 2`).
* Every other sales item response (`Invoice`, `ProformaInvoice`, `Quotation`, `SalesContract`,
  `SalesOrder`, `DeliveryChallan`) exposes `netAmount` with the same meaning, but **only the credit-note
  column set has a `taxable` column**, so this resolver is reachable for credit notes alone.

**Root cause.** `detailColumns.js`’s `taxable` resolver read `row.taxable ?? row.taxableAmount ?? 0`.
Neither key exists in a Credit Note response, so the column fell through to the literal `0` and rendered
`₹0.00` while the row's `Total` (from `row.total`) was correct. The fix appends `netAmount` to the `??`
chain — `row.taxable ?? row.taxableAmount ?? row.netAmount ?? 0` — keeping stored snapshots first and a
legitimate numeric `0` intact (`??`, never `||`).

## 3. Before / after (detail page, credit note 5)

| Row | Before | After |
| --- | --- | --- |
| Rate | ₹100.00 | ₹100.00 |
| GST % | 18% | 18% |
| **Taxable Amount** | **₹0.00** | **₹200.00** |
| Total | ₹236.00 | ₹236.00 |

Totals unchanged and correct: Sub Total ₹200 · Tax Total (CGST + SGST) ₹36 · Grand Total ₹236.
Legacy example with a stored 10 % line discount (isolated fixture, not live data): gross 200,
`discountAmount` 20, `netAmount` 180 → the detail column shows **₹180.00** (not ₹200.00, not ₹0.00) while
`Total` shows ₹212.40.

## 4. Final legacy-discount compatibility behaviour

| Situation | Behaviour |
| --- | --- |
| New note, lines arrive with a discount from a source invoice/receipt, a bulk upload or a restored draft | Normalized to `discountPct: 0` — the new note is priced at qty × rate. |
| New note Totals card | No Discount input, no Discount row; Taxable Value = Sub Total. |
| Opening / viewing / previewing / printing an existing note | Stored values are used as they are; the discount is never zeroed. A header discount still lists a Discount row in the preview, print and PDF; a discount-free note lists no such row. |
| Opening the edit form of a note with a stored discount | Item rows keep their stored `discountPct`; the header keeps its stored `discountPct` (passed to the Totals card read-only); Taxable Value and per-row Taxable/Total show the record's real historical amounts. **No mutation happens on open** (no write is issued). |
| Saving an unrelated field (remarks, status, …) | `serializeCreditNote` re-submits the header `discountPct` and each line's `discountPct` exactly as loaded, so the backend recomputes the same amounts — history is preserved, not flattened. |
| User-editable discount control | Still absent for credit notes: no column, no cell, no input, no `onDiscountChange` handler anywhere in the page. |
| Explicitly re-picking a Source Document in the edit form | The lines are replaced by that document's lines priced at qty × rate (no discount) — a deliberate, user-initiated line replacement, documented below. |
| Invoices / quotations / sales orders / proformas / DCs | Untouched: their discount columns, inputs, rows and calculations are unchanged (verified live, §7). |

## 5. Focused tests

| Suite | Result |
| --- | --- |
| `node --test tests/credit-note-discount-removal.test.js` | **19 pass / 0 fail**, exit **0** (17 before + 2 new: legacy hydration, serializer mirror) |
| `npx vitest run src/utils/creditNoteTaxableAmount.test.js src/utils/creditNoteDiscount.test.js` | **21 pass / 0 fail** (7 + 14), exit **0** |

They cover the ten requested points: (1) resolver field + (2) numeric zero + (3) formatting/totals in the
new `creditNoteTaxableAmount` suite; (4) new notes discount-free; (5)/(6) legacy load-and-view preservation
and no write on open; (7) unrelated-edit payload keeps `discountPct: 7.5` header and `[5, 10]` lines;
(8) preview/print/PDF rows gated on a real discount and still shown for a legacy one; (9) invoice line +
header discount math unchanged; (10) the original discount-removal suites still pass (all 19 node tests +
the discount vitest suite).

## 6. Repository checks

| Command | Result |
| --- | --- |
| `npm run test:node` | **342 pass / 0 fail**, exit **0** |
| `npm run test:unit` | 1918 pass / **5 fail**, exit **1** — the same 5 **pre-existing** purchase-module failures (`numberingEngine` custom starting number, `quotationWorkflow` RULE 9/10, `purchaseToPayAudit` 27-step audit, `purchaseAcceptance` lifecycle — all `QT-2026-…` numbering expectations), unrelated to Sales/credit notes and unchanged by this work |
| `npm run build` | exit **0**, no errors |
| `git diff --check` | exit **2** — two **pre-existing** trailing-whitespace hits in `erp-backend/.../InvoiceResponse.java:99` and `.../ProductionOrderService.java:700` (files I never touched). Scoped to my 11 frontend files: exit **0**, clean |
| ESLint (changed files vs `HEAD`) | no new findings: `detailColumns` 0→0, `SalesTotals` 0→0, `salesHelpers` 1→1, `CreditNoteFormPage` 1→1, new test file 0 |

## 7. Browser verification (read-only, live dev server)

* `/credit-notes/5` → Items table: `S.No | Item | HSN | Qty | UOM | Rate | GST % | Taxable Amount | Total`
  with `Taxable Amount ₹200.00` for the `2 × ₹100 @18%` line (was `₹0.00`), `Total ₹236.00`; totals
  `Sub Total ₹200 · Tax Total (CGST + SGST) ₹36 · Grand Total ₹236`, **no Discount row**.
* `/credit-notes/5/edit` → the record hydrates; no DISCOUNT column, no discount input (only
  `ADDITIONAL CHARGES (INR)`); rows `Sub Total ₹200 · Taxable Value ₹200 · GST (CGST + SGST) ₹36 ·
  Additional Charges ₹0 · Grand Total ₹236`. Only "discount" strings on the page are a CSS block and the
  Reason option `Post-Sale Discount`.
* **No mutation on open:** `GET /v1/credit-notes/5` before and after visiting the detail **and** edit
  pages returns the identical `updatedAt 2026-10-15T11:38:19.319962` and `revision 0`.
* `/credit-notes/new` → no DISCOUNT column, only the `ADDITIONAL CHARGES (INR)` input; a new line of
  `2 × ₹100` gives row `TAXABLE AMOUNT ₹200 / TOTAL ₹236` and Totals `Sub Total ₹200 · Taxable Value ₹200 ·
  GST (CGST + SGST) ₹36 · Additional Charges ₹0 · Grand Total ₹236` — **no Discount row**.
* Invoice counter-checks from the previous round still hold (`/invoices/7` detail shows its Discount row;
  `/invoices/new` shows the `Discount (%)` input and Discount/Additional Charges rows).
* All live reads were GETs; **Save / Save Draft / Submit for Approval were never clicked**, so no record in
  the shared `erp_db` was created, modified or deleted.

## 8. Scope, safety, unresolved items

* Shared DB untouched (read-only GETs only); no schema change, no migration, no record touched.
* No staged/unstaged work of the user was altered: the working tree still holds the same 50 staged paths,
  the same `main` @ `93a76c3`, and the pre-existing modifications (including the unrelated
  `SalesDocumentDesign.jsx` `canDeleteSales` work and the two backend whitespace hits) are intact.
* **No live record currently holds a historical non-zero discount** — all four existing credit notes
  (CN-2026-000001…000004) return `discountPct: 0` / `discount: 0` — so legacy preservation is proven with
  isolated fixtures (vitest/node) rather than with live data; nothing was written to create such a record.
* **Re-picking a Source Document while editing a legacy note** replaces its lines with that document's
  lines priced at qty × rate (no discount). The note's previous lines — and their discount — are replaced
  by that explicit user action; it is not a silent normalization of untouched data. Flag it if the business
  wants the imported lines to carry the source document's discount instead.
* **Preview/print/PDF row arithmetic for item-only legacy discounts:** those surfaces derive their
  Discount row from `computeTotals`, whose `discount` term is the **header** discount only (item discounts
  live inside the per-line amounts). A legacy note with only line discounts therefore shows no Discount
  row there (previously it printed a `₹0.00` one) — its stored per-line values are still shown and nothing
  is rewritten. Changing that would alter the shared preview math for every document type, so it was left
  as is. No conversion rule was invented anywhere.
* Credit Note figures quoted here (₹200/₹236) come from the record the app currently holds; the prices and
  item description were last changed by the user's own activity, not by this task.
