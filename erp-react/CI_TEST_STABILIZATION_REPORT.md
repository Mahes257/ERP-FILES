# CI Test Stabilization — local/CI parity report

Scope: make a **fresh GitHub Actions checkout** discover and run the same test
suites as this working tree, and make the CI results honest.

Nothing was staged, committed, renamed, moved or deleted; no branch or stash
operation was performed; the shared `erp_db` was not written to (the backend
suite runs on its in-memory H2 test profile, and every live-API test class
reports `Tests run: 0` without `ERP_API_TEST_ENABLED`). The pre-existing staged
refactor, the unstaged edits and the untracked files are all intact — see §6.

Verification logs live in `tmp/verify/` (scratch, untracked).

---

## 1. What the gap was

| Artefact | HEAD (fresh checkout) | Working tree |
|---|---|---|
| `vitest.config.js` | **absent** | present (untracked) |
| `npm run test:node` / `test:unit` scripts in `package.json` | absent | present |
| backend test sources | 77 tracked | 126 on disk (**49 untracked**) |
| `tests/*.js` | 16 tracked | 18 on disk (**2 untracked**) |

Without `vitest.config.js`, vitest silently falls back to `vite.config.js`: node
environment (≈45 suites need `localStorage`, i.e. jsdom), the default include
pattern (which sweeps `tests/**` into a second framework) and no
`VITE_PURCHASE_DATA_MODE=local` pin (so the Purchase facades fire real HTTP).
CI therefore ran a *different* suite from the local one, and 49 backend tests
(≈213 tests) never existed for it at all.

Confirmed mechanically: the isolated HEAD worktree contains 2231 tracked files,
**no** `vitest.config.js`, and 16 `tests/*.js`.

---

## 2. Files intended for the next intentional commit

### Bundle A — test infrastructure (3 files)

```
vitest.config.js                                   (new)
package.json                                       (adds test:node, test:unit)
.github/workflows/ci.yml                           (test jobs + guards)
```

### Bundle B — tests (51 new + 35 modified)

**B1 · untracked backend test sources (49 files)** — all still present, all part
of this project, none in `.gitignore`:

```
erp-backend/src/test/java/com/vishatech/cadworker/CadWorkerPersistenceUnitTests.java
erp-backend/src/test/java/com/vishatech/cadworker/CadWorkerProjectionTests.java
erp-backend/src/test/java/com/vishatech/erp/api/LiveDatabaseTarget.java
erp-backend/src/test/java/com/vishatech/erp/api/LiveDatabaseTargetGuardTests.java
erp-backend/src/test/java/com/vishatech/erp/api/WriteCapableLiveApiTest.java
erp-backend/src/test/java/com/vishatech/erp/api/documents/DocumentsPaginationLiveApiTest.java
erp-backend/src/test/java/com/vishatech/erp/api/sales/SalesDeleteAuthorityLiveApiTest.java
erp-backend/src/test/java/com/vishatech/erp/architecture/AuthRateLimitIsolationTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/BoundaryFindings.java
erp-backend/src/test/java/com/vishatech/erp/architecture/CadProductionBoundaryTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/ProductionBoundaryScopeTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/ProductionPersistenceBoundaryTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/ProductionPersistenceOwnershipTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/ProductionSalesBoundaryTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/PurchaseIngressBoundaryTests.java
erp-backend/src/test/java/com/vishatech/erp/architecture/SourceHygieneTests.java
erp-backend/src/test/java/com/vishatech/erp/audit/SharedAuditContractTests.java
erp-backend/src/test/java/com/vishatech/erp/cad/CadModelProjectionTests.java
erp-backend/src/test/java/com/vishatech/erp/cad/CadProductionRegressionProbe.java
erp-backend/src/test/java/com/vishatech/erp/cad/CadProjectionPortConsumerProbe.java
erp-backend/src/test/java/com/vishatech/erp/cpr/CprPurchaseRequisitionConversionIntegrationTests.java
erp-backend/src/test/java/com/vishatech/erp/cpr/CprPurchaseRequisitionRollbackTests.java
erp-backend/src/test/java/com/vishatech/erp/cpr/api/CprDashboardReadAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/crm/api/CrmDashboardReadAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/dashboard/DashboardStatsApiTests.java
erp-backend/src/test/java/com/vishatech/erp/dashboard/DashboardStatsQueryCountTests.java
erp-backend/src/test/java/com/vishatech/erp/dashboard/service/DashboardAggregationServiceTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ModelConversionJobAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ModelConversionProjectionTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ProductionAttachmentAtomicityTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ProductionAttachmentContractIntegrationTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ProductionDocumentContractIntegrationTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ProductionOrderCpoResolutionIntegrationTests.java
erp-backend/src/test/java/com/vishatech/erp/production/ProductionTrackerCpoLinkIntegrationTests.java
erp-backend/src/test/java/com/vishatech/erp/production/QualityInspectionPersistenceTests.java
erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseAuditFailureIsolationTests.java
erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseAuditWriteTests.java
erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseRequisitionIngressAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/sales/api/SalesDashboardReadAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/sales/api/SalesOrderLookupAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/security/SalesDocumentAuthorityContractTests.java
erp-backend/src/test/java/com/vishatech/erp/service/ContractConsumerProbe.java
erp-backend/src/test/java/com/vishatech/erp/service/PdfProductionRegressionProbe.java
erp-backend/src/test/java/com/vishatech/erp/service/cad/CadJobProductionRegressionProbe.java
erp-backend/src/test/java/com/vishatech/erp/service/production/ProductionDashboardReadAdapterTests.java
erp-backend/src/test/java/com/vishatech/erp/service/production/ProductionDocumentServiceTests.java
erp-backend/src/test/java/com/vishatech/erp/service/production/PublishedPortConsumerProbe.java
erp-backend/src/test/java/com/vishatech/erp/service/production/SalesBoundaryProbe.java
```

**B2 · untracked frontend contract tests (2 files)**

```
tests/production-tracker-empty-progress.test.js
tests/sales-delete-permissions.test.js
```

**B3 · modified tests (35 files)** — 23 backend + 12 frontend:

*backend* `api/BaseApiTest`, `cad/CadFormatSupportTests`,
`performance/{ReadPathQueryCountTests,SalesDashboardAggregationTests,ScalabilityMeasurementTests}`,
`production/ProductionKpiAggregationIntegrationTests`,
`purchase/PurchaseDocumentAuditIntegrationTests`,
`security/{AbstractSecurityTest,ContactsApiTest,CostWorkoutProfitWorkoutFlowApiTest,CprApiTest,CrmApiTest,DocumentReferenceApiTest,DocumentsApiTest,MarketingSecurityTests,RefreshTokenSecurityTests}`,
`service/{AttachmentStorageLedgerTests,CostWorkoutProfitWorkoutConversionTests,CprItemConversionTests,CprTechnicalVerificationStatusTests,DocumentMirrorPolicyTests,LeadImportLimitTests,ProcessingJobPipelineTests,QuotationPoStatusLinkageTests}`

*frontend* `src/purchase/services/{bulkDocumentOperations,documentLifecycle,documentOperations,globalSearch,rfqFollowUpAuto,settingsConfig,workQueue,workflowOrdering}.test.js`,
`tests/{crm-contacts,production-integration,production-kpi-pagination}.test.js`

Support/base classes travel with their dependents: `LiveDatabaseTarget` with
`LiveDatabaseTargetGuardTests` and `WriteCapableLiveApiTest`; `BoundaryFindings`
with the architecture suites; `AbstractSecurityTest`/`BaseApiTest` with the
security and live-API suites; the four `*Probe` classes with the boundary
suites that consume them.

### Bundle C — production code these tests pin (required for CI to be green)

`npm run test:node` and `npm run test:unit` assert against real application
sources, so the tests cannot be committed alone. Proven by reverting one file in
the isolated worktree: without `logistics.js` the two **tracked** suites
`downstreamWorkflow` and `poAwardWorkflow` fail 2 assertions (§4.3).

```
src/purchase/services/logistics.js                 (released-PO precondition on createShipment)
src/utils/salesPermissions.js                      (new; hasSalesDelete/SALES_DELETE_ROLES)
src/components/Common/CurrentUserContext.jsx       (canDeleteSales)
src/components/SalesTable/SalesListPage.jsx        + 9 other Sales surfaces gated on it:
src/components/SalesDetail/SalesViewPage.jsx
src/components/SalesDesign/SalesDocumentDesign.jsx
src/pages/sales/{CpoEActions,CpoProductionTracker,EActionViewPage,QuotationDesign,
                 QuotationListPage,QuotationViewPage,SalesContractListPage,SalesContractViewPage}.jsx
src/production/pages/ProductionOrders.jsx
erp-backend/src/main/java/com/vishatech/erp/controller/{SalesOrderController,QuotationController,
  SalesContractController,InvoiceController,ProformaInvoiceController,DeliveryChallanController,
  CreditNoteController,PaymentReceiptController}.java   (SALES_DELETE on all three delete routes)
```

Plus the **package moves these contract tests read by path** (§4.3): the
`erp.crm.*` move of `Contact`, `ContactRepository`, `ContactService`,
`CustomerService`, `LeadService` (and their old paths' removal) and
`erp/repository/production/QualityInspectionRepository.java`.

### Not included (unrelated to test coverage)

The staged modular-monolith refactor beyond the paths above, the module docs
(`MODULAR_MONOLITH_*.md`, `CRM_MODULE_REFACTOR.md`, `ERP_ARCHITECTURE_CLASSIFICATION.md`,
`DASHBOARD_MODULAR_REFACTOR_PLAN.md`), the audit/report Markdown in the repo root,
`tmp/**` scratch, and the deleted `PERMANENT_DELETE_AUDIT_REPORT.md`. The user
decides whether Bundle C travels with Bundle B or lands as its own commit — but
if Bundle B lands alone, `test:node` is red in CI (13 assertions, §4.3).

---

## 3. Test counts

| Suite | Local | Fresh checkout (HEAD + A + B + C) |
|---|---|---|
| `npm run test:node` | **323 tests, 0 fail**, exit 0 | **318 tests, 13 fail**, exit 1 — see §4.3 |
| `npm run test:unit` | 1902 tests, **5 fail / 1897 pass** (83 files, 4 failing), exit 1 | 1902 tests, **5 fail / 1897 pass** — identical |
| `npm run build` | exit 0, built in 7.31s | exit 0, built in 7.98s |
| `./mvnw -o -B test` | **693 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS, exit 0, 7:02 | not run (backend job needs the same Maven run in CI) |

---

## 4. The frontend failures: 14 → 5

### 4.1 Fixed as stale tests or genuine defects (9 assertions)

| Suite · assertion | Root cause | Resolution |
|---|---|---|
| `poAwardWorkflow` RULE 5, `downstreamWorkflow` createShipment | **Genuine defect**: `createShipment` documented a released-PO precondition but never enforced it, while its sibling `createGrn` did | enforced in `logistics.js` (production fix, pinned by two tracked suites) |
| `globalSearch` | stale expectation (chain shape moved to the shared chain builder) | test updated |
| `workflowOrdering` | stale source-text literal after the NFA approval route was made per-RFQ | test updated to the current derivation (comment records the drift) |
| `settingsConfig` | stale expectation | test updated |
| `rfqFollowUpAuto` | stale expectation | test updated |
| `workQueue` `getWorkQueue` | **Stale test**: `getWorkQueue()` is now API-backed (`PurchaseWorkQueueController` → `/api/purchase/work-queue`; the store-backed derivation is commented out in the service), but the test still called it with no transport stub, so jsdom raised `AxiosError: Network Error` | test now stubs `../api`'s `purchaseGet` with the backend's payload shape assembled from records created through the real services; asserts the endpoint, route/`actionRoute` fallback, per-item normalisation, category metadata, capped-list counts and `total` |

A consequence worth recording: `getWorkQueue()` bypasses `withFallback`, so in
`VITE_PURCHASE_DATA_MODE=local` the page has no data source at all. That is a
product question (restore a local derivation or leave the queue API-only), not
something this task changed.

### 4.2 Left unresolved — one undecided business rule (5 assertions)

`numberingEngine` › *respects a custom starting number* · `purchaseAcceptance`
lifecycle · `purchaseToPayAudit` 27-step audit · `quotationWorkflow` RULE 9 and
RULE 10 all expect a Quotation number matching `QT-<FY>-<NNNN>`; the running code
issues `QT-001`.

* **For `QT-001` (implemented):** `numberingEngine.js` declares
  `Quotation: { …, plain: true }` and `ensureSequences()` *actively migrates* a
  stored year-based Quotation config to it (resetting counter and ledger);
  `rfq.js` `nextQuotationNo()` pads to three digits (`QT-001`) independently.
* **For `QT-<FY>-<NNNN>` (asserted):** Settings → Document Numbering previews
  `${prefix}-${fy}-${padded}` for **every** row (`Settings.jsx:503`), FY/start/
  padding are editable per row, and the other 14 sequences are year-based — the
  Quotation row therefore displays a number the engine will never issue.

Both positions are in-repo, so neither the tests nor the engine were changed:
picking a format changes issued document numbers (audit-visible) and must be a
product decision. Until it is taken, `frontend-unit` stays visibly
non-blocking (§5) and reports its real result.

### 4.3 Found by the fresh-checkout parity run: 13 `test:node` failures

Running the intended commit set on top of a clean HEAD checkout fails 13
assertions that pass locally, because these contract tests read real sources:

* **7 assertions** — `tests/sales-delete-permissions.test.js`: every Sales
  controller's `POST /bulk-delete` must carry
  `@PreAuthorize("hasAuthority('SALES_DELETE')")`. HEAD has
  `hasAuthority('SALES_CREATE')` (verified with `git show`); the guard is an
  **uncommitted** working-tree edit. → the 8 controllers must be in the commit.
* **6 assertions** — `tests/crm-contacts.test.js` (5) and
  `tests/production-kpi-pagination.test.js` (1) `ENOENT` on
  `erp/crm/{entity/Contact,repository/ContactRepository,service/ContactService,
  service/CustomerService,service/LeadService}.java` and
  `erp/repository/production/QualityInspectionRepository.java`: the suites read
  the **refactored** layout, which currently exists only as staged/modified
  work. Of the 31 backend source paths `tests/**` reads, these 6 are absent from
  a fresh checkout.
* The 5-test count delta is that `production-kpi-pagination`'s suite body throws
  while reading the missing file, so the block's remaining 5 tests are never
  registered (318 vs 323).

So "commit the tests" is not sufficient by itself: either Bundle C (the CRM move
and the eight guards) lands with Bundle B, or those six assertions are made
path-independent first.

---

## 5. CI workflow changes (inspected, not executed)

`.github/workflows/ci.yml` — no runner was available, so **GitHub Actions did not
run these jobs; nothing here is claimed as a CI pass**:

* `frontend` — build (unchanged).
* `frontend-tests` — **new**: `npm ci` + `npm run test:node` (the `tests/**`
  contract suite on node's built-in runner).
* `frontend-unit` — **new, explicitly non-blocking**: fails closed if
  `vitest.config.js` is missing (so a silent fallback to `vite.config.js` can
  never look like a pass), runs `npm run test:unit`, publishes the file/test
  counts to the job summary and warns that the job does not gate merges. It
  keeps `continue-on-error: true` because the 5 remaining failures are the
  undecided numbering rule (§4.2). Remove that line once the rule is chosen.
* `backend` — full tracked suite (`./mvnw -B verify`) plus a **no-silent-shrinkage
  check**: the Surefire `tests=` attribute of every report is summed and the job
  fails below `MIN_BACKEND_TESTS` (680; audited baseline 693). Environment-gated
  classes report 0 tests by construction and cannot mask shrinkage.
* `live-api` — unchanged, isolated and fail-closed: throwaway `erp_ci_live`
  MySQL container, secrets absent → the job reports *skipped* and claims no
  result. The shared database is never touched.

`package-lock.json` was not modified, so CI installs the same dependency tree.

---

## 6. Existing work left intact

* Staged: 50 entries (the modular-monolith package moves) — untouched.
* Unstaged: 169 entries; 115 of them under `erp-backend/src/main/java` — untouched.
* Untracked: 116 entries (51 test files among them) — untouched.
* No `git add`, `git commit`, `git reset`, `git checkout` in the working tree, no
  `git stash`, nothing deleted or renamed. The only files written in the working
  tree by this task are `workQueue.test.js`, `logistics.js`, the earlier-documented
  frontend test repairs, `.github/workflows/ci.yml` (comments) and `tmp/verify/**`.
* The isolated parity worktree (`../erp-parity`, outside the repository) was used
  for §4.3 and then removed; `git worktree list` shows only the main checkout.

### Dependency handling

`npm ci` cannot run in this working tree while the Vite dev server is up: the
running server holds `node_modules/@rolldown/binding-win32-x64-msvc/rolldown-binding.win32-x64-msvc.node`
and the replace step fails with `EPERM` (it also removed part of
`node_modules`). It was repaired immediately with `npm install` (exit 0, 232
packages, `vitest` binary restored), which is the safe equivalent and preserves
the lockfile. `npm ci` **was** run cleanly in the isolated worktree, so the
install path CI uses is verified. The dev server (and the shared backend on
8080) were not stopped or restarted.

---

## 7. Open decisions

1. **Quotation number format** — `QT-001` (implemented) or `QT-<FY>-<NNNN>`
   (asserted, and previewed by Settings). Decides 5 assertions and whether
   `frontend-unit` can gate merges.
2. **Commit composition** — Bundle B alone leaves `test:node` red in CI;
   B bundles + C (or making the six path-based assertions layout-independent)
   makes it green.
3. **Enforcement policy** — whether `frontend-unit` loses `continue-on-error`
   once (1) is decided, and whether the backend floor stays 680 or becomes 693.
4. `getWorkQueue()` in `local` data mode (no fallback) — restore a local
   derivation or confirm the queue is API-only.
