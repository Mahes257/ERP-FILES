# Credit Notes · List / Kanban View — Implementation Report

Task: add the Sales-Contracts-style **List / Kanban** view toggle and a real-data
Kanban board to **Sales Execution → Credit Notes**, reusing existing components and
data, changing only what is required.

Branch `main` @ `93a76c3` — **nothing staged, committed or pushed**; all pre-existing
staged/unstaged/untracked work in the checkout is untouched.

---

## 1. Files inspected

| File | Why |
| --- | --- |
| `src/pages/sales/SalesContractListPage.jsx` | The reference board: `KANBAN_COLUMNS`, `po-view-toggle`, cards, `moveKanbanCard`, drag-and-drop, empty/loading states. |
| `src/pages/sales/sales-contract-module.css` | `.po-kanban*` styling used by the Sales Contract board. |
| `src/components/SalesTable/SalesListPage.jsx` | The shared list page Credit Notes actually uses; it already carries the generic toggle + board (enabled per config) that Sales Orders uses. |
| `src/config/salesPageConfigs.jsx` | `creditNoteListConfig`, `creditNoteViewConfig`, `salesOrderListConfig` (`kanban: true`), status maps, KPI/status definitions. |
| `src/pages/sales/CreditNotes.jsx` | Credit Notes route wiring (`SalesListPage` + `creditNoteListConfig`). |
| `src/constants/salesConstants.js` | `CREDIT_NOTE_STATUSES` (the module's real status list). |
| `src/hooks/useSalesModule.js`, `src/services/salesServiceFactory.js`, `src/services/creditNoteService.js` | Data loading + the existing `changeStatus` → `POST /credit-notes/{id}/status` path. |
| `erp-backend/.../controller/CreditNoteController.java` | Confirms `POST /{id}/status` exists and is gated by `SALES_CREATE`. |
| `erp-backend/.../service/CreditNoteService.java` | `normalizeStatus` — the writable status set. |
| `erp-backend/.../dto/CreditNoteResponse.java` | Confirms the card fields exist in the list payload. |
| `src/utils/leadHelpers.js`, `src/utils/salesHelpers.js`, `src/utils/pendingApproval.js`, `src/components/SalesTable/SalesStatusBadge.jsx` | Existing formatting / status-badge / pending-approval helpers. |

No backend file was modified.

## 2. Files changed

| File | Change | Reason |
| --- | --- | --- |
| `src/config/salesPageConfigs.jsx` | `creditNoteListConfig` gains `kanban: true`, `kanbanMoveTargets`, `kanbanCard(row)`; new `CN_WRITABLE_STATUSES` / `CN_KANBAN_MOVE_TARGETS` constants. | Turns the board on for Credit Notes and describes the module's own card fields and legal move targets. |
| `src/components/SalesTable/SalesListPage.jsx` | Card content resolved through `config.kanbanCard` (Sales-Order fields as the default branch); optional `layout: 'stack'`; move targets resolved through `config.kanbanMoveTargets` (defaults to the previous `statusOptions`). | Makes the shared board module-aware without changing any module's existing behaviour. |
| `tests/credit-note-kanban.test.js` *(new)* | 5 source-level regression tests. | Locks the toggle, columns, move-target restriction and the untouched Sales Order default. |

**Honest note:** `git diff` on these two source files also shows hunks I did **not**
author — the `canDeleteSales` gating of delete / permanent-delete actions and
`hideZeroDiscountRow` on the credit-note *view* config. Those were already present in
the working tree before this task; I neither wrote nor altered them, and I did not
revert them.

## 3. How the Sales Contract implementation was reused

Credit Notes renders the shared `SalesListPage`, which already contains the generic
toggle + board built for **Sales Orders** — the same board family as Sales Contracts:
identical `po-view-toggle` control, status-derived columns with a count badge, white
cards, status badge + `⋮` "Move to stage", in-column empty state, spinner loading
state, horizontal scrolling and pagination under the board. Reusing it (rather than
copying `SalesContractListPage`'s inline board) keeps the page single-sourced and
guarantees Credit Notes cannot diverge from the other Sales boards.

Only two narrow hooks were added to the shared component so a second module could use
it; both default to today's exact Sales Order behaviour:

* `config.kanbanCard(row) → { title, subtitle, fields, layout }` — the board *layout*
  stays shared, the card *fields* are the module's.
* `config.kanbanMoveTargets` — which columns may receive a card.

Sales Contracts was **not** modified, and neither were Invoices, Quotations, Customer
Purchase Orders, Proforma Invoices, Delivery Challans or Payment Receipts.

## 4. Credit Note statuses and card fields

Statuses come from the module's own list (`CREDIT_NOTE_STATUSES`, the same options the
Status filter uses) — **Draft, Pending Approval, Approved, Rejected, Issued, Adjusted,
Refunded, Cancelled** — plus the Archived / Deleted bucket column while those tabs are
open. Every configured column always renders (0 count + "No records in this stage"),
and each card is grouped by its real `status` value, so no record can fall outside the
board and no state is invented.

Card fields, all taken from the list row already loaded by the page
(`CreditNoteResponse`):

* title — `cnNo` (fallback `#id`)
* customer — `clientName`
* `Source` — `sourceRef` (source invoice / quotation reference)
* `Date` — `cnDate`
* `Amount` — `grandTotal` + currency
* `Reason` — `reason`
* status badge (`SalesStatusBadge`) + Pending-Approval badge where applicable
* `⋮` move menu

Missing values render `—`; no mock data, no hardcoded customers/numbers/amounts.

**Move targets are deliberately restricted.** `CreditNoteService.normalizeStatus`
persists only `draft`, `pending approval`, `approved`, `issued` — anything else (including
`Refunded`, `Adjusted`, `Cancelled`, `Rejected`) is silently rewritten to `draft`.
Offering those as drop targets would have written the wrong status, so the board's
drag-and-drop and the `⋮` menu accept only the four writable statuses. The other
statuses still get their own columns, so records that already hold them stay visible.
This reuses the existing `hook.changeStatus` → `POST /credit-notes/{id}/status` path
with its `SALES_CREATE` authority: no new endpoint, no new lifecycle transition.

## 5. List/Kanban switching

* Toggle buttons `List` / `Kanban` in the page header (standalone route) **and** above
  the content when embedded in the Sales Execution hub; the active button is
  highlighted, `aria-label="Credit Note view"`.
* Both views render from the *same* component instance — `viewMode` is pure
  presentation state, so switching repeatedly never resets search, filters, KPI
  selection, the Active/Archived/Deleted tab, page or page size, and never refetches a
  second dataset.
* List is the default; no separate route, no duplicated page.

## 6. Existing actions and filters preserved

Records open through the module's existing view route (`/credit-notes/{id}`), the same
destination as clicking the row's number. The List view is unchanged: New Credit Note,
search, filters, KPI cards, Active/Archived/Deleted, Refresh, Export, Manage Columns,
bulk actions, row `⋮` menus, pagination and row counts all behave exactly as before.
Role-based permissions are untouched — the board reads the same rows the table does
and any action it triggers still goes through the existing authorized endpoints.

## 7. Test results

| Check | Result |
| --- | --- |
| `node --test tests/credit-note-kanban.test.js` | **5/5 pass**, exit 0 (new) |
| `node --test tests/credit-note-discount-removal.test.js tests/quotation-reference-pr-no-column.test.js tests/sales-delete-permissions.test.js` | **52/52 pass**, exit 0 |
| `npm run test:node` | **347/347 pass**, exit 0 |
| `npx vitest run src/utils/creditNoteDiscount.test.js` | 14/14 pass |
| `npx vitest run src/utils/creditNoteTaxableAmount.test.js src/purchase/services/adjustmentNotes.test.js` | 17/17 pass |
| `npx eslint` on the 3 changed files | Delta vs `HEAD` **zero** — the 5 errors reported in `SalesListPage.jsx` are pre-existing on unchanged lines (verified by linting the `HEAD` copy), config and new test clean |
| `git diff --check` (scoped to changed files) | exit 0 |

`npm run test:unit` (whole vitest suite) was **not** re-run to green: it carries
5 pre-existing failures in `src/purchase/**` (year-prefixed quotation numbering),
which imports none of the changed files.

## 8. Build result

`npm run build` → **✓ built in 7.60s, exit 0** (only the repo's pre-existing chunk-size
and ineffective-dynamic-import warnings).

## 9. Browser verification (performed, live app)

Dev server `http://localhost:5173` against the running backend, signed in as Admin,
real `credit_notes` data (CN-2026-000001…000004). Read-only: no Save/Submit/Delete was
clicked and no status was changed, so no record in the shared database was altered.

* `/credit-notes` and `/sales?tab=creditNotes` both show the `List` / `Kanban` toggle;
  the active button follows the selection.
* Kanban board renders 8 status columns + pagination. Counts matched their cards
  (Draft 3, Approved 1, others 0) and the totals matched the table (`Showing 1-4 of 4`).
* Card content verified on real rows: `CN-2026-000003 · Apex Industries · Source:
  INV-2026-000004 · Date: 11 Oct 2026 · Amount: ₹828 · Reason: Invoice converted to
  Credit Note · Draft`; the approved CN renders `CN-2026-000004 · ZZ Conversion Test
  Client · INV-2026-000005 · ₹236 · approved`.
* Empty columns render "No records in this stage"; loading spinner and the
  no-records/empty-filter messages are the shared ones.
* Search typed in List view (`Apex`) survived the switch to Kanban and still filtered
  the board (3 of 4 records); the KPI/status tabs, Refresh, Export, Manage Columns and
  page size were untouched.
* Archived tab + Kanban → the extra "Archived" bucket column appears (9 columns, 0
  counts, `Showing 0-0 of 0`); switching back to Active + List restored the 4-row table
  with `Showing 1-4 of 4`.
* Clicking a card body navigated to `/credit-notes/4` (the CN view page).
* `⋮` "Move to stage" on a Draft card listed exactly **Pending Approval, Approved,
  Issued** — no Refunded/Adjusted/Cancelled/Rejected.
* Drop-target gating measured with synthetic drag events (no `drop` dispatched, so no
  write): `dragover` on **Approved** and **Issued** was accepted
  (`defaultPrevented === true`), while **Refunded / Adjusted / Cancelled** were rejected
  (`false`) — the browser shows a no-drop cursor there.
* Console after a fresh reload and through all Kanban interactions: **no errors or
  warnings** (only Vite/React dev messages); no `POST …/status` request was issued and
  no failing resource in the page's performance timeline.
* Regression check: Sales Orders → CPO List → Kanban still renders its 6 columns and its
  original card (`CPO-2026-000009 · SK Logistics · PO Ref / Date / Amount / SC Ref` in
  the original two-column grid), i.e. the shared default path is byte-equivalent.

## 10. Remaining limitations

* Columns follow the module's full status list, so `Rejected` — a value the backend can
  no longer write but the Status filter still lists — shows as a permanently empty
  column. It was kept so that any legacy record holding it remains visible.
* A move can only reach the four persistable statuses (see §4). If Credit Notes should
  support Refunded/Adjusted/Cancelled transitions, that needs a backend change first;
  the board deliberately does not fake it.
* The existing List-view "Change Status" dialog still offers all filter statuses
  (pre-existing behaviour, left as-is); a choice outside the four writable ones is
  normalized to `draft` by the backend exactly as before this task.
* The board uses the shared Sales Orders-style board markup (Tailwind-styled) with the
  `po-kanban-*` drag hooks, so the standalone `sales-contract-module.css` rules for
  `.po-kanban-col` dot indicators do not apply to it; column headers, counts, cards,
  borders, spacing and badges match the Sales Contract board's design language.

## 11. Git safety confirmation

* `git status` before and after: **121 M / 13 D / 47 RM / 98 ?? / 1 A / 1 R** — the same
  pre-existing work; branch `main` @ `93a76c3`.
* My own changes are exactly: `src/components/SalesTable/SalesListPage.jsx` (M),
  `src/config/salesPageConfigs.jsx` (M), `tests/credit-note-kanban.test.js` (new).
* No `git reset`, `checkout --`, `clean`, stash, commit or push was run; no file was
  deleted; no unrelated module was touched.
