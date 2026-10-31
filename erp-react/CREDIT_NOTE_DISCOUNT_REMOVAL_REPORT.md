# Credit Note — Discount removed end-to-end

**Target:** `http://localhost:5173/credit-notes/new` (Credit Note create/edit — `CreditNoteFormPage`)
**Date:** 2026-10-15 · **Branch:** `main` @ `93a76c3` (unchanged) · **Working tree:** nothing staged, committed, stashed or reverted by this work.

A Credit Note is now priced at **qty × rate**: no Discount % column, no discount edit control, no
discount input, no Manage Columns entry, no per-line or header deduction, and no discount value
submitted. Every other document type keeps its discount behaviour untouched.

> **Superseded in part (2026-10-15 follow-up).** The legacy-discount policy described below was
> replaced: a **new** note stays discount-free, but an **existing** note that stored a genuine
> historical discount is no longer normalized on load and is re-submitted with the very same values.
> See **CREDIT_NOTE_TAXABLE_AND_LEGACY_DISCOUNT_REPORT.md** for the current behaviour (and for the
> Credit Note detail *Taxable Amount* fix). Everything else here still holds.

---

## 1. Files changed (10 modified, 2 added)

| File | Why |
| --- | --- |
| `src/utils/salesItemsColumns.js` | `creditNote` default column order no longer contains `discount` (S.No, Item, HSN, Qty, UOM, Rate, GST %, Taxable Amount, Total, Actions). Documented that the column is also pruned from stored configs. |
| `src/components/SalesForm/SalesItemGrid.jsx` | The credit-note variant passes `excludeKeys: ['discount']` to `useManagedGrid` (prunes the column from the rendered grid **and** from the persisted config) and both discount cells (editable + read-only) are deleted from the shared grid. |
| `src/components/SalesForm/SalesTotals.jsx` | Credit-note branch has no Discount row and no header Discount % input; taxable value = Sub Total; `cnLineDisc`/`cnHeaderDisc`/`cnDiscount` aggregation deleted. Other variants' discount rows/inputs unchanged. |
| `src/components/SalesForm/CreditNoteFormPage.jsx` | No `discountPct` / `onDiscountChange` passed to the Totals card; a single `setItems` normalizer (`withoutDiscount`) zeroes any discount entering item state (source invoice/receipt prefill, restored draft, bulk upload, legacy record); both source-prefill mappers now write `discountPct: 0`. |
| `src/utils/salesHelpers.js` | New `withoutDiscount(items)` normalizer; `serializeCreditNote` no longer sends the header `discountPct` and submits every line with `discountPct: 0`. `lineAmount` / `computeTotals` / `mapItems` untouched. |
| `src/config/salesDesignConfigs.jsx` | `creditNoteDesignConfig.hideZeroDiscountRow: true` (preview / print / PDF sheet). |
| `src/components/SalesDesign/SalesDocumentDesign.jsx` | Totals table omits the Discount row when `config.hideZeroDiscountRow` is set **and** the computed discount is 0. |
| `src/utils/salesPrintUtils.js` | Print HTML + PDF export omit the Discount row for `moduleKey === 'creditNote'` when it is 0. |
| `src/config/salesPageConfigs.jsx` | `creditNoteViewConfig.hideZeroDiscountRow: true` (CN detail page). |
| `src/components/SalesDetail/SalesViewPage.jsx` | Items-pane footer omits the zero Discount row when that flag is set. |
| `tests/credit-note-discount-removal.test.js` *(new)* | node:test wiring suite (17 tests). |
| `src/utils/creditNoteDiscount.test.js` *(new)* | vitest behavioural suite (10 tests). |

No backend file, DTO, entity, migration or schema was changed.
`SalesDocumentDesign.jsx` already carried unrelated uncommitted work (`canDeleteSales` gating in the
More menu); it was preserved untouched — only the totals hunk above is mine.
A legacy/stale header discount must not survive — a deliberate, reported consequence (see §6).

## 2. Where discount was removed

* **UI / columns** — `salesItemsColumns.js` (defaults) + `SalesItemGrid.jsx` (`excludeKeys` prune +
  deleted `case 'discount'` cells) → the column cannot render and cannot be re-enabled through
  Manage Columns, and the stored `sales.items.creditNote` config is rewritten without it. The CN
  **detail/preview** item table resolves columns from that same grid key, so it lost the column too.
* **Inputs / edit controls** — no discount cell (hence no input), no header `Discount (%)` input on
  the Totals card (only `ADDITIONAL CHARGES (INR)` remains).
* **Calculation** — `SalesTotals` credit-note branch: `Taxable Value = Sub Total`, `Grand Total =
  Taxable Value + GST + Additional Charges`; no line-discount sum, no header-discount term. Item
  amounts come from the unchanged `lineAmount` with `discountPct` always 0 (enforced by the
  form-state normalizer), so **no hidden or default discount** can reduce an amount.
* **Validation** — unchanged: `validate()` still requires a customer and ≥1 item for a full save
  (drafts exempt); nothing discount-related was validated before.
* **Persistence** — the payload for a NEW note carries no discount (its form never holds one, and
  its lines are normalized to 0). **Updated:** a record being edited is submitted with the discount it
  was loaded with, so history is never flattened — see the follow-up report. No backend change was or
  is required (`CreditNoteService.applyRequest` → `nvl(…, ZERO)`, `recalcTotals` deducts
  `gross × discPct/100`).
* **Surfaces** — preview, print HTML, PDF export and the CN detail page no longer list a `₹0.00`
  Discount row; a legacy note that stored a **real** discount still shows/prints it.
* **GST preserved** — CGST+SGST vs IGST selection, the GST rate control, the per-line split, rounding
  and the totals GST row are untouched (`GST_SPAN = 1` for credit notes was already the case).

## 3. Before / after (test data)

Two lines: 2 × ₹100 and 1 × ₹50, GST 18 %, Additional Charges ₹25. (The "before" column is the old
code's math for the same rows carrying the discounts the old UI allowed.)

| | Before (item discounts 5 % / 10 %) | After (no discount anywhere) |
| --- | --- | --- |
| Sub Total (Σ qty × rate) | ₹250 | ₹250 |
| Item discounts | ₹10 + ₹5 = ₹15 | — (not representable) |
| Taxable value | ₹235 | ₹250 |
| GST @18 % | ₹42.30 | ₹45.00 |
| Additional charges | ₹25 | ₹25 |
| **Grand Total** | **₹302.30** | **₹320.00** |

Single-line check (2 × ₹100, 18 %): taxable ₹200, total ₹236 — both in the grid row and in the
Totals card (live, §5).

## 4. Tests

| Command | Result |
| --- | --- |
| `node --test tests/credit-note-discount-removal.test.js` | **17 pass / 0 fail**, exit 0 |
| `npx vitest run src/utils/creditNoteDiscount.test.js` | **10 pass / 0 fail**, exit 0 |
| `npm run test:node` | **340 pass / 0 fail**, exit 0 |
| `npm run test:unit` | 1907 pass / **5 fail**, exit 1 — see below |
| `npm run build` | exit 0, no errors |
| `npx eslint <changed files>` | no new findings: CreditNoteFormPage 1→1, SalesViewPage 1→1, SalesDesignConfigs 0→0, SalesPageConfigs 0→0, SalesTotals 0→0, SalesItemGrid 0→0, salesItemsColumns 0→0, salesPrintUtils 0→0 messages vs `HEAD` (`SalesDocumentDesign` 20→18, the delta belonging to the pre-existing uncommitted `canDeleteSales` work in that file) |

**Pre-existing failures (not hidden, not skipped):** `test:unit` fails 5 tests in 4 purchase-module
files — `numberingEngine.test.js` ("respects a custom starting number"), `quotationWorkflow.test.js`
(RULE 9, RULE 10), `purchaseToPayAudit.test.js` (27-step audit), `purchaseAcceptance.test.js`
(full lifecycle). All are `QT-2026-…` document-numbering expectations (`QT-001` returned) in
`src/purchase/**`, a module that imports **none** of the files changed here (verified: no reference to
`salesHelpers`, `salesPrintUtils`, `salesItemsColumns`, the SalesForm/SalesDesign components or the
CN page anywhere under `src/purchase`). Their sources already carry uncommitted work in this tree.
Nothing in this change touches purchase numbering, storage or tests.

The new suites cover the request's eight points: no discount column (1), Manage Columns cannot
re-enable it (2), taxable value / GST without a deduction (3), no hidden default discount (4),
draft/save/submit amounts + payload (5), legacy note loads through the normalizer (6), other document
types keep their columns and their discount math (7), validation and status workflow intact (8).

## 5. Verified live in the running dev server (read-only)

`localhost:5173` (user's dev server, HMR) + backend on `:8080`. **No save/draft/submit was executed,
so nothing was written to the shared `erp_db`.**

* `/credit-notes/new` — Items headers: `S.NO | ITEM | HSN | QTY | UOM | RATE | GST | TAXABLE AMOUNT |
  TOTAL | ACTIONS` (no DISCOUNT %). Manage Columns lists S.No, Item, HSN, Qty, UOM, Rate, GST %,
  Taxable Amount, Total — no Discount, no way to add it back. Totals card: `ADDITIONAL CHARGES (INR)`
  input only; rows `Sub Total / Taxable Value / GST (CGST + SGST) / Additional Charges / Grand Total`.
  Typing qty 2 × rate 100 gave grid `TAXABLE AMOUNT ₹200`, `TOTAL ₹236` and Totals `Sub Total ₹200`,
  `Taxable Value ₹200`, `GST ₹36`, `Grand Total ₹236`; switching the header GST select to **IGST**
  changed the rows to `GST (IGST) ₹36` and `IGST 18%` (12 Sep-style tax behaviour intact), then back
  to CGST+SGST. Add / Manage Columns / Save Draft / Save & New / Save / Submit for Approval / Status
  select / Attachments / Terms / Remarks / Signature all present.
* `/credit-notes/5` (existing saved note) — Items table has no Discount column; footer rows are
  `Sub Total / Tax Total / Grand Total` with **no Discount row**; Grand Total unchanged (₹236).
* `/invoices/7` (other document type) — detail page **still** shows its `Discount` row and its own
  column set.
* `/invoices/new` — creation page **still** shows `Discount (%)` input + `Discount` / `Additional
  Charges` rows.
* Save Draft / Save / Save & New / Submit for Approval were **not** clicked (would write to the
  shared DB). Their payload is proven by the vitest payload test instead.

Only "discount" text left on the CN create page: a CSS block and the **Reason** option
`Post-Sale Discount` (a credit-note *reason*, not the discount feature) — both intentionally kept.

## 6. Limitations / notes

* **Legacy discounted credit notes — superseded by the follow-up task.** This report originally
  normalized a legacy note's lines to `discountPct: 0` when it was opened for editing. That is no
  longer the behaviour: hydration, viewing, previewing, printing and saving all preserve the stored
  discount, and the Credit Note item normalizer now applies to NEW records only. See
  **CREDIT_NOTE_TAXABLE_AND_LEGACY_DISCOUNT_REPORT.md** §4 for the final policy.
* The backend keeps `discountPct` columns/fields (H2 suite untouched); nothing was migrated, and
  existing NULL/legacy values are never rewritten except by an explicit user edit+save.
* `SalesTotals` / `SalesDocumentDesign` / `salesPrintUtils` / `SalesViewPage` are shared by every
  document type, so each change is opt-in: a `creditNote`/`moduleKey` check or a
  `hideZeroDiscountRow` config flag. Invoice **and** credit-note behaviours were both verified live
  (§5).
* Pre-existing quirk (not introduced here, not fixed to stay in scope): on a CN detail page the item
  table's `Taxable Amount` column shows ₹0.00 because the resolver reads `taxable`/`taxableAmount`
  while `CreditNoteItemResponse` returns the field as `netAmount`. The row's `Total` is correct.
* Browser/persistence verification was done read-only by design; no isolated write-level end-to-end
  (save → reopen) run was performed, so "Save Draft / Save / Submit for Approval amounts" are proven
  by the focused tests plus the code path, not by a live save.
