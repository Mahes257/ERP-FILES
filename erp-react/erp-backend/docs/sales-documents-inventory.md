# Sales Documents — repository inventory & mirror-flow policy

Read-only inventory of `document_repository` in the development database, taken
**before any change was made**, to tell hand-uploaded Sales documents apart from
the entries the old automatic mirror flow created. No row was deleted to produce
this inventory, and the page was not filtered to hide anything.

## Whole repository (all modules)

| Rows | With a stored file | Without a file (`metadata-only`/empty) |
| --- | --- | --- |
| 252 | 192 | 60 |

Rows by status: `generated` 182, `uploaded` 18, `pending` 17, `deleted` 13,
`with bill` 6, `without bill` 5, `not prepared` 3, `archived` 2, `passed` 2,
`delivered`/`in progress`/`planned`/`submitted` 1 each.

## Sales scope (CRM + Sales Execution + CPR + workouts)

`scope=sales` covers the module spellings in
`DocumentModuleScope.SALES_MODULES` (`/documents/stats?scope=sales` and the
Sales Documents page use the same list).

| Metric | Value |
| --- | --- |
| Rows in scope | 169 |
| … linked to a business record (`related_record_id`) | 164 |
| … with a stored file | 160 |
| … without a file | 9 (all already `deleted`) |
| Active rows | 155 — **151 `generated`** (record mirrors) + **4 `uploaded`** (real uploads) |
| `deleted` / `archived` | 12 / 2 |

### The four documents a user really put in the Sales repository

| id | module | type | name | created |
| --- | --- | --- | --- | --- |
| 152 | CPR Technical Verification | uploaded | TEST-DRAWING-TV0009-v2.pdf | 2026-09-30 |
| 257 | Sales | uploaded | QA-UPLOAD-VERIFY.pdf | 2026-10-10 |
| 258 | Sales | uploaded | QA-UPLOAD-SERVERREJECT.pdf | 2026-10-10 |
| 260 | Sales | uploaded | QA-UPLOAD-VERIFY.pdf | 2026-10-10 |

### How an uploaded document is told apart from an old mirror

The old mirrors are **not** identifiable by "has no file": most of them carry a
generated PDF. The distinguishing signal is the pair

* `status = 'generated'` **and** `related_record_id IS NOT NULL` → created by the
  automatic record-document flow (`ensureRecordDocument` /
  `refreshGeneratedFileQuietly`), one per CRM/Sales business record;
* `status = 'uploaded'` **and** `file_path <> 'metadata-only'` → a document that
  was explicitly uploaded or registered by an operator workflow.

Bulk creation evidence: 151 of the mirrors share the tight creation window
`2026-10-09 11:05:56 – 11:05:58` (Lead 57, CPR 26, CPR Technical Verification 12,
Customer Purchase Order 9, Cost Workout 9, Profit Workout 9, Client 7,
Quotation 7, Follow-up 6, Sales Contract 4, …) — a single reconciliation/backfill
run, not chapter-and-verse user uploads.

## Non-Sales modules (untouched by this change)

Drawing 15, Model 13, Marketing Expense 11, Work Order 11, Q Form 8,
Production Order 8, Marketing Travel Plan 6, Marketing Visit 4, QC 2,
Production Tracker 2, General 1, Packing List 1, Dispatch 1.

## Nothing was deleted

Removing the automatic flow does **not** remove any existing row: the old mirrors
are still in the repository (151 active `generated` entries at the time of this
inventory). Clean-up is only possible through the page's own confirmed
**Delete Selected** action, which uses `DELETE /documents/{id}` (soft delete —
`status = 'deleted'`, file, versions and audit trail kept) and never touches the
underlying CRM/Sales business record.
