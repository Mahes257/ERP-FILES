# ERP Baseline Verification — Git, Build & Test Readiness

> **Scope:** READ-ONLY verification of the current ERP development baseline before any
> microservices extraction. No source, configuration, dependency, database record or existing
> documentation was changed. The only artifact created is this report.
>
> **Audit timestamp:** 2026-10-13 (approx. 09:39–09:50 local, UTC+05:30)
> **Repository:** `C:\Users\Mahes\Desktop\Sri\erp-react`
> **Method:** direct inspection of Git metadata, source/config, build tools and live OS/network
> state. Facts confirmed by a command or file are marked **[VERIFIED]**; conclusions drawn from
> indirect evidence are **[INFERRED]**; anything not confirmable safely is **[NOT VERIFIED]**.

---

## 1. Audit Scope and Timestamp

- **Goal:** establish the current baseline — what is uncommitted, what builds, what passes tests,
  what is running, and what blocks the first service extraction.
- **Read-only rules honored:** no `git reset/clean/checkout/restore/stash`, no file move/delete/edit,
  no staging/commit/push, no migrations/seeders, no process kill/restart, no dependency install.
- **Builds/tests explicitly authorized by the task and executed:** `npm run build`, `npm run lint`,
  `node --test`, `./mvnw verify`. Build outputs went only to git-ignored `dist/` and `target/`.
- **Timestamp:** 2026-10-13, ~09:39–09:50 (UTC+05:30).

---

## 2. Git Baseline and Working-Tree Summary

| Field | Value | Status |
|---|---|---|
| Repository root | `C:/Users/Mahes/Desktop/Sri/erp-react` | [VERIFIED] |
| Current branch | `main` | [VERIFIED] |
| HEAD commit | `61859bf2e0a28f3fde6990a905a26ea79957da65` | [VERIFIED] |
| HEAD message / date | "Update lead form inputs" — 2026-10-07 15:07:31 +0530 | [VERIFIED] |
| Remote | `origin` → `https://github.com/Mahes257/vishak-erp.git` (fetch + push); no credentials printed | [VERIFIED] |
| Staged (index) changes | **None** (`git diff --cached` empty) | [VERIFIED] |
| Renames | **None** | [VERIFIED] |
| Modified | **133** | [VERIFIED] |
| Untracked | **64** | [VERIFIED] |
| Deleted | **1** (`CrmController.java`) | [VERIFIED] |
| Tracked diff size | 134 files changed, **7,914 insertions(+), 3,030 deletions(-)** | [VERIFIED] |

**Commit history (newest first):**

```
61859bf Update lead form inputs              ← HEAD
a52fd32 Update Production module tables and sticky layout
a53a075 Fix Marketing workflows, global scroll, and production model upload
cc79695 Complete Purchase module fixes and workflow improvements
82a8992 Fix ERP workflows and enhance CAD support
60934ea Integrate ERP module updates and fixes
a52856a Remove legacy CAD conversion pipeline
1443563 Fix backend CI test failures
d7c31fb Initial ERP project
```

**Generated / temporary files present in the working tree** (do not confuse with source):

- Ignored generated dirs: `dist/` (Vite output), `erp-backend/target/` (Maven output),
  `node_modules/` — all confirmed git-ignored, not untracked.
- Untracked scratch/tooling: `.tmp-clean/`, `tools/` (CAD SAT helper),
  `erp-backend/tmp-run-8099.sh`, plus `ERP_TECHNICAL_AUDIT.md` (the report created in the prior task).
- Untracked deployment doc set under `erp-backend/docs/` (deployment/schema/reference markdown + SQL).

### Untracked files (64) — full list

```
?? .tmp-clean/
?? ERP_TECHNICAL_AUDIT.md
?? ERP_BASELINE_VERIFICATION.md            ← this report (created by this task)
?? erp-backend/docs/contacts_migration.sql
?? erp-backend/docs/database-deployment.md
?? erp-backend/docs/environment-configuration.md
?? erp-backend/docs/file-storage-deployment.md
?? erp-backend/docs/production_entry_machine_assignment.sql
?? erp-backend/docs/reference-data.md
?? erp-backend/docs/sales-documents-inventory.md
?? erp-backend/docs/schema_baseline.sql
?? erp-backend/src/main/java/com/vishatech/erp/cad/SatAcisConversionEngine.java
?? erp-backend/src/main/java/com/vishatech/erp/config/ContactBackfillRunner.java
?? erp-backend/src/main/java/com/vishatech/erp/controller/ContactController.java
?? erp-backend/src/main/java/com/vishatech/erp/dto/ContactRequest.java
?? erp-backend/src/main/java/com/vishatech/erp/dto/ContactResponse.java
?? erp-backend/src/main/java/com/vishatech/erp/dto/ContactStatusRequest.java
?? erp-backend/src/main/java/com/vishatech/erp/dto/DocumentReferenceRequest.java
?? erp-backend/src/main/java/com/vishatech/erp/dto/QuotationFollowUpSummary.java
?? erp-backend/src/main/java/com/vishatech/erp/entity/Contact.java
?? erp-backend/src/main/java/com/vishatech/erp/repository/ContactRepository.java
?? erp-backend/src/main/java/com/vishatech/erp/service/ContactService.java
?? erp-backend/src/test/java/com/vishatech/erp/CadMissingEngineStartupTests.java
?? erp-backend/src/test/java/com/vishatech/erp/cad/CadEngineAutoDetectionTests.java
?? erp-backend/src/test/java/com/vishatech/erp/cad/SatAcisConversionEngineTests.java
?? erp-backend/src/test/java/com/vishatech/erp/config/StorageRootConfigurationTests.java
?? erp-backend/src/test/java/com/vishatech/erp/security/ContactsApiTest.java
?? erp-backend/src/test/java/com/vishatech/erp/security/CostWorkoutProfitWorkoutFlowApiTest.java
?? erp-backend/src/test/java/com/vishatech/erp/security/DocumentReferenceApiTest.java
?? erp-backend/src/test/java/com/vishatech/erp/security/RefreshTokenCleanupTests.java
?? erp-backend/src/test/java/com/vishatech/erp/service/DocumentMirrorPolicyTests.java
?? erp-backend/tmp-run-8099.sh
?? src/components/Common/LastFollowupHistory.jsx
?? src/components/DocumentSelection/
?? src/components/SalesTable/QtnFollowUpCell.jsx
?? src/components/Settings/
?? src/pages/AdvancedSettings.jsx
?? src/pages/crm/ContactFormPage.jsx
?? src/pages/crm/ContactViewPage.jsx
?? src/pages/sales/sales-settings.css
?? src/production/components/production/settings/ProductionSettingsShell.jsx
?? src/production/components/production/settings/production-settings.css
?? src/production/pages/settings/SettingsLayout.jsx
?? src/services/contactService.js
?? src/styles/sales-tab-nav.css
?? src/styles/settings-shell.css
?? src/styles/settings-ui.css
?? src/utils/contactHelpers.js
?? src/utils/cpoItemConversion.js
?? src/utils/cprToCostWorkout.js
?? src/utils/documentFilters.js
?? src/utils/documentFolders.js
?? src/utils/documentSelection.js
?? tests/cpo-eactions-default-and-picker.test.js
?? tests/cpr-to-cost-workout-mapping.test.js
?? tests/crm-contacts.test.js
?? tests/quotation-items-total-column.test.js
?? tests/quotation-reference-pr-no-column.test.js
?? tests/sales-contract-upload-documents.test.js
?? tests/sales-documents-filters.test.js
?? tests/sales-documents-folders.test.js
?? tests/sales-documents-inside-erp.test.js
?? tests/sales-documents-mirror-policy.test.js
?? tests/sales-documents-row-delete.test.js
?? tools/
```

---

## 3. Important Modified / Untracked / Deleted Files

### 3.1 The deleted `CrmController.java` **[VERIFIED]**

- Path: `erp-backend/src/main/java/com/vishatech/erp/controller/CrmController.java` (`D`, uncommitted).
- Content at HEAD: a single-purpose controller with **one endpoint** —
  `GET /contacts` (authority `CRM_VIEW`) that called `LeadService.listScoped("contacts", …)`.
  It was a legacy read that rendered *leads* as "contacts"; it defined no other route.
- **No remaining reference** to `CrmController` exists anywhere in `erp-backend/src` or `src`.
- **Conclusion:** the deletion is a deliberate replacement, not an accidental loss — the new
  `ContactController` (untracked) now owns `/contacts`. [INFERRED, strongly supported]

### 3.2 The untracked Contacts implementation **[VERIFIED]**

New/untracked backend slice:

| File | Purpose |
|---|---|
| `controller/ContactController.java` | `@RequestMapping("/contacts")`, `CRM_VIEW` class guard; list (`GET /contacts`), `/stats`, `/lead/{leadId}`, `/{id}`, create/update/archive/restore/status/delete/permanent-delete, bulk archive/restore/delete/permanent-delete, `/backfill` |
| `service/ContactService.java`, `repository/ContactRepository.java`, `entity/Contact.java` | JPA entity mapped to table **`contacts`**; FKs `lead_id → leads`, `client_id → customers` |
| `dto/ContactRequest|ContactResponse|ContactStatusRequest.java` | request/response payloads |
| `config/ContactBackfillRunner.java` | idempotent lead→contact mirror runner |
| `test/.../security/ContactsApiTest.java` | security/API test for the endpoints |

New/untracked frontend slice: `src/services/contactService.js`,
`src/pages/crm/ContactFormPage.jsx`, `src/pages/crm/ContactViewPage.jsx`,
`src/utils/contactHelpers.js`, and `tests/crm-contacts.test.js`.
Routes are already wired in `src/App.jsx` (`/contacts`, `/contacts/new`, `/contacts/:id/edit`,
`/contacts/:id`).

**Contract check [VERIFIED]:** every path the new `contactService.js` calls
(`/contacts`, `/contacts/stats`, `/contacts/{id}`, `/contacts/lead/{id}`, `/contacts/archive/{id}`,
`/contacts/restore/{id}`, `/contacts/{id}/status`, `/contacts/bulk-*`, `/contacts/backfill`) maps to
a method on `ContactController`. Frontend↔backend contact endpoints are consistent.

### 3.3 ⚠️ Schema dependency for Contacts — the key baseline gap **[VERIFIED]**

- `entity/Contact.java` is annotated `@Table(name = "contacts")`.
- The table **`contacts` does NOT exist** in `erp-backend/erp_db_schema_latest.sql` (the current
  checked-in schema). [VERIFIED — grep returned no match]
- The **only** definition is the untracked `erp-backend/docs/contacts_migration.sql`
  (`CREATE TABLE IF NOT EXISTS contacts (...)`), which has **not been applied** to `erp_db`
  (and this task must not apply it).
- Backend production config is `spring.jpa.hibernate.ddl-auto=${ERP_DDL_AUTO:validate}` [VERIFIED].
- **Implication:** starting the current (working-tree) backend code against a database that lacks a
  `contacts` table will **fail at startup under `validate`** (Hibernate validates mapped tables on
  boot). [INFERRED — high confidence; live DB could not be inspected, see §7]

### 3.4 Other change groups by module **[VERIFIED via `git diff --name-status`]**

| Module | Representative changed files | Nature |
|---|---|---|
| **CRM / Contacts** | `ContactController` (new), `FollowUpController/Service`, `CustomerService`, `dto/CustomerRequest`, `dto/FollowUp*`, `LeadService`, `useLeads.js`, `pages/crm/*` (AddClient, CRMHub, Contacts, Leads) | Contacts submodule + lead/follow-up work |
| **Sales / Accounts** | `QuotationResponse`, `SalesOrderController/Service`, `ProformaInvoiceController/Service`, `InvoiceService`, `SalesOrderEAction*`, `docs/sales_execution_migration.sql`, many `pages/sales/*`, `salesServiceFactory.js` | Quotation/Sales-Order/E-Action + document work |
| **Purchase** | `purchase/pages/orders/OrderCreate.jsx` (+ large untracked purchase test set) | Purchase order create + workflow tests |
| **Production** | `entity/production/ProductionEntry`, `dto/production/*`, `ProductionEntryService`, `ProductionSettingsService`, `OrderMapper`, `components/production/**`, `pages/settings/*`, `routes/productionRoutes.jsx` | Production settings shell + entry/tables |
| **CAD / Engineering Design** | `cad/CadConversionProvider`, `CadmpegConversionEngine`, `ConversionProviderRegistry`, `service/cad/CadConversionJobService`, `SatAcisConversionEngine` (new) | CAD engine rework + new SAT engine |
| **Documents / files** | `DocumentRepositoryController`, `DocumentBackfill/Reconciliation/RepositoryService`, `DocumentModuleScope`, `documentService.js`, `utils/document*` | Documents module expansion |
| **Marketing** | seeders (`MarketingExpenseSeeder`, `MarketingModuleDataSeeder`), `SecurityAudit.md` | Seed/doc updates |
| **Config / startup affecting** | `src/main/resources/application.properties`, `logback-spring.xml`, `test/resources/application.properties`, `config/DataSeeder.java` | **Startup/config-affecting — see below** |

### 3.5 Startup / auth / DB-affecting changes **[inspection]**

- `erp-backend/src/main/resources/application.properties` is modified. Reviewed content still uses
  `server.port=${ERP_PORT:8080}`, `server.servlet.context-path=/v1`,
  `spring.jpa.hibernate.ddl-auto=${ERP_DDL_AUTO:validate}`, and MySQL datasource from `ERP_*` env.
  No change to the configured port/context/schema-validation model was introduced. [VERIFIED]
- `erp-backend/src/test/resources/application.properties` is modified (H2 test profile) — matches the
  H2 behavior seen in test runs. [VERIFIED]
- Auth: no changes to `SecurityConfig`, `JwtService`, `JwtAuthenticationFilter` in the working tree;
  the new `ContactController` reuses the existing `CRM_*` authorities. [VERIFIED]
- `config/DataSeeder.java` modified; `ContactBackfillRunner` added (additive, idempotent by its own
  doc/comments). No seeder was executed by this audit. [VERIFIED that it exists; runtime effect NOT VERIFIED]

> Note on unfinished integration: no frontend caller was found that targets a **missing** backend
> route in the Contacts slice. A full route-by-route reconciliation across every module was **not**
> performed here (out of scope) — treat "no missing handlers found" as limited to the Contacts area.

---

## 4. Frontend Build and Lint Results

Environment **[VERIFIED]**: Node **v24.16.0**, npm **11.13.0**; `node_modules/` present with
`node_modules/.bin/vite`. Manifest/lockfile untouched (no install run). Scripts defined:
`dev`, `build`, `lint`, `preview` — **no `test` script**.

### 4.1 Production build — ✅ PASS

```
Command:  npm run build        (cwd: erp-react)
Exit:     0
Output:   vite v8.2.0 → 3277 modules transformed → ✓ built in 12.31s
```

- Output written to git-ignored `dist/`. No tracked or untracked source file was modified.
- Non-fatal warnings [VERIFIED]:
  - `occt-import-js` externalizes Node `path`/`crypto` for browser compatibility.
  - `INEFFECTIVE_DYNAMIC_IMPORT` for `src/purchase/services/logistics.js` and
    `src/purchase/services/purchaseOrder.js` (both dynamically **and** statically imported).
  - Several chunks > 500 kB after minification (e.g. `ModelViewerPage` ~809 kB, `companyBrand` ~727 kB,
    `xlsx`, `jspdf`). Performance note, not a failure.
- The newly added Contacts pages compile into the bundle (`dist/assets/Contacts-*.js`,
  `ContactFormPage-*.js`, `ContactViewPage-*.js`). [VERIFIED]

### 4.2 Lint — ❌ FAIL (pre-existing debt)

```
Command:  npm run lint         (eslint .)
Exit:     1
Output:   ✖ 863 problems (779 errors, 84 warnings)
          1 error and 19 warnings potentially fixable with --fix
```

- Not a build blocker, but the tree does not lint clean. The dominant rule is `no-unused-vars`.
- Whether any of the 863 problems were introduced by the uncommitted work vs. pre-existing is
  **[NOT VERIFIED]** (no baseline (HEAD) lint run was performed, to avoid checking out another tree).

### 4.3 Frontend tests — ⚠️ 14/16 pass, 2 fail

Discovery **[VERIFIED]**: 16 test files in `tests/` + 83 co-located `*.test.js` under `src/`;
run with the built-in `node:test` runner (no vitest/jest). No `npm test` script.

`node --test <file>` per file:

| File | Pass | Fail |
|---|---|---|
| cpo-eactions-default-and-picker.test.js | 19 | 0 |
| cpr-to-cost-workout-mapping.test.js | 16 | 0 |
| crm-contacts.test.js | 24 | 0 |
| **production-integration.test.js** | 0 (153 assertions inside) | **1 file-level failure** |
| **production-kpi-pagination.test.js** | 26 | **3** |
| production-sales-orders-pagination.test.js | 34 | 0 |
| purchase-receiving-pagination.test.js | 25 | 0 |
| purchase-technical-review-queue.test.js | 26 | 0 |
| quotation-items-total-column.test.js | 8 | 0 |
| quotation-reference-pr-no-column.test.js | 5 | 0 |
| sales-contract-upload-documents.test.js | 10 | 0 |
| sales-documents-filters.test.js | 21 | 0 |
| sales-documents-folders.test.js | 25 | 0 |
| sales-documents-inside-erp.test.js | 20 | 0 |
| sales-documents-mirror-policy.test.js | 8 | 0 |
| sales-documents-row-delete.test.js | 13 | 0 |

**Failure causes [VERIFIED]:** these are *static source-pattern contract tests* whose expected
strings no longer match the refactored source — i.e., stale tests, not runtime defects:

- `production-integration.test.js` expects `src/production/services/production/modelFormats.js` to
  contain `const BACKEND_CONVERT_TYPES = ['STEP','STP','IGES','IGS']` and
  `const SLD_STORE_ONLY_TYPES = ['SLDPRT','SLDASM']` — the CAD routing constants were reworked
  (commit "Remove legacy CAD conversion pipeline").
- `production-kpi-pagination.test.js` expects source substrings
  `machinesList.filter((machine) => machine.department === filters.department)` and
  `machineUtilizationSummary(machines)` that the current component no longer contains verbatim.

Both failing files are **tracked and unmodified** in the working tree → these failures are
**baseline failures**, not caused by the uncommitted work. [VERIFIED]

> Note: `node --test tests/` (directory form) exits 1 because it aborts on the first failing file;
> per-file execution gives the breakdown above.

---

## 5. Backend Build and Test Results

Environment **[VERIFIED]**: Java available as `openjdk 21.0.12.1` on PATH; Maven wrapper present
(`erp-backend/mvnw`); local Maven repo `~/.m2/repository` populated (offline-capable for this build).
Note: the **currently running** JVMs use `C:\Program Files\Java\jdk-24\bin\java.exe` (§6), so a
JDK 24 runtime is also installed on this machine.

Test configuration **[VERIFIED]**: `src/test/resources/application.properties` shadows the main
config and runs the security/service suites against **in-memory H2** (MySQL compatibility mode) — no
live MySQL and no `ERP_*` env vars are required for `verify`. Production config requires
`ERP_DATABASE_USERNAME`, `ERP_DATABASE_PASSWORD`, `ERP_JWT_SECRET` (fail-fast; values not read).

### Verification run — ✅ PASS

```
Command:  ./mvnw -B verify     (cwd: erp-backend)
Exit:     0
Output:   [INFO] Tests run: 476, Failures: 0, Errors: 0, Skipped: 0
          [INFO] BUILD SUCCESS
          [INFO] Total time: 03:45 min
```

- **476 backend tests, 0 failures, 0 errors.** [VERIFIED]
- No second application instance was started; the running backend on :8080 was untouched. [VERIFIED]
- Dependencies were already cached (no install/upgrade performed). [VERIFIED]

**Non-fatal warning observed during the run [VERIFIED]:**

```
org.h2.jdbc.JdbcSQLSyntaxErrorException: Column "created_at" not found;
SQL statement: create index "idx_ptl_created" on "purchase_timeline" ("created_at") [42122-232]
```

This surfaced while a test built its H2 schema. It did **not** fail the build (the issuing test
passed), but it signals an index/DDL expectation on `purchase_timeline.created_at` that does not
match the H2-generated table — worth reviewing, because a similar mismatch against MySQL
(`ddl-auto=validate`) could matter. Logged as an **inferred risk**, not a confirmed defect.

---

## 6. Runtime and Port Status

Read-only `netstat` / `curl` / `jps` at audit time (no process was killed or restarted):

| Service | Configured | Listening? | PID / owner | Evidence |
|---|---|---|---|---|
| MySQL | 3306 | **YES** (`0.0.0.0:3306`, `[::]:3306`) | 6216 `mysqld.exe` | [VERIFIED] |
| MySQL X Protocol | 33060 | YES | 6216 `mysqld.exe` | [VERIFIED] |
| ERP backend (Spring Boot) | 8080, context `/v1` | **YES** (`0.0.0.0:8080`, `[::]:8080`) | 28104 → `jps` = `com.vishatech.erp.ErpApplication` | [VERIFIED] |
| Backend health | `GET /v1/actuator/health` | **`{"status":"UP"}`** | — | [VERIFIED] |
| Frontend dev server | script says **5174**; Vite default **5173** | **YES on 5173** (IPv6 loopback only, `[::1]:5173`) | 15980 `node.exe` | [VERIFIED] |
| Frontend HTTP | — | `http://localhost:5173/` → **200** | 15980 | [VERIFIED] |
| Maven wrapper JVM | (no port) | running | 16360 → `jps` = `org.apache.maven.wrapper.MavenWrapperMain` | [VERIFIED] |
| CAD worker | (no port, by design) | **NOT IDENTIFIED** | — | [NOT VERIFIED] |

Findings and corrections:

- **The frontend is currently running on port 5173, not 5174.** `start-all.sh`/`start-all.bat` pass
  `--port 5174`, but the live Vite process bound the Vite **default 5173** and only on the IPv6
  loopback (`[::1]`), so `http://127.0.0.1:5173` fails while `http://localhost:5173` works.
  This means the frontend was likely started with a plain `npm run dev` (or `start-dev.bat`), not via
  `start-all.sh`. [VERIFIED]
- **Correction to a prior assumption:** PID 16360 is **not** a CAD worker — `jps` identifies it as
  the Maven wrapper (`MavenWrapperMain`), most plausibly the launcher of the running backend (28104).
  **No separate CAD-worker JVM is identifiable**, and the CAD worker health endpoint
  `GET /v1/cad-conversion/health` returned **401** (authentication required), so CAD-worker liveness
  is **[NOT VERIFIED]** without a token. It may be disabled, embedded, or simply not running.
- **No port conflicts** were observed; the expected ports (3306, 8080, 5173) are each bound by the
  expected process. [VERIFIED]
- No test/dev server started by this audit remained running (the Maven `verify` JVMs exited). [VERIFIED]

---

## 7. Database Verification Status

| Item | Value | Status |
|---|---|---|
| Database technology / name | MySQL, schema `erp_db` | [VERIFIED from config] |
| Connection | `jdbc:mysql://localhost:3306/erp_db?...` (override `ERP_DATABASE_URL`) | [VERIFIED] |
| Credentials | `ERP_DATABASE_USERNAME` / `ERP_DATABASE_PASSWORD` (values not read) | [VERIFIED names only] |
| Schema mode | `spring.jpa.hibernate.ddl-auto=${ERP_DDL_AUTO:validate}` | [VERIFIED] |
| Schema files | `erp-backend/erp_db_schema_latest.sql` (130 tables), `Sri/erp_db_schema.sql` (older), 2 backups | [VERIFIED] |
| Migration scripts | `erp-backend/docs/*.sql` incl. **untracked** `contacts_migration.sql`, `sales_execution_migration.sql`, `processing_jobs.sql`, `production_settings.sql`, `performance_indexes.sql`, `mysql-app-user.sql`, `schema_baseline.sql` | [VERIFIED] |
| **Live schema vs source** | **NOT VERIFIED** — the `mysql` client is not installed on this host, so no read-only `information_schema` query was possible. No writes, seeders or migrations were run. | [NOT VERIFIED] |

**Schema-vs-code assessment based on available evidence (no live read):**

- The checked-in schema (`erp_db_schema_latest.sql`) does **not** contain a `contacts` table, yet the
  working-tree code maps `Contact` → `contacts`. Under `ddl-auto=validate`, booting this code against
  a database without that table would fail. The untracked migration defines it but has not been
  applied here. [VERIFIED from files; live DB state INFERRED/NOT VERIFIED]
- The H2 index warning in §5 (`purchase_timeline.created_at`) suggests at least one DDL/index
  expectation that may not match a given schema — flagged as an inferred risk.
- **Live compatibility cannot be confirmed safely without either the `mysql` client or a write/
  migration, both out of scope.** Therefore live schema verification is **[NOT VERIFIED]**.

---

## 8. Existing Automated Test Coverage

**Backend — 476 tests, all passing [VERIFIED].** Coverage by area (from `erp-backend/src/test`):

| Area | Examples observed |
|---|---|
| Authentication / JWT / refresh | `AuthSecurityTests`, `JwtSecurityTests`, `ExpiredJwtSecurityTests`, `RefreshTokenSecurityTests`, `RefreshTokenCleanupTests`, `AuthRateLimit`/`RateLimitTests` |
| Authorization / CORS / input / files | `AuthorizationSecurityTests`, `CorsSecurityTests`, `InputValidationSecurityTests`, `FileSecurityTests`, `FileStorageSecurityTests` |
| CRM (Leads) | `CrmApiTest` |
| CRM Contacts | `ContactsApiTest` (new, untracked) |
| CPR / Cost & Profit Workout | `CprApiTest`, `CostWorkoutProfitWorkoutFlowApiTest`, `CprItemConversionTests`, `CprTechnicalVerificationStatusTests` |
| Sales (Contracts/Orders/E-Actions/Reports/Settings) | `SalesExecApiTest`, `SalesDashboardApiTest`, `SalesReportsApiTest`, `SalesSettingsApiTest`, `SalesDocumentNumberSequenceTests`, `QuotationPoStatusLinkageTests`, `SalesOrderOptionsPagingTests` |
| Purchase | `PurchaseWorkQueueIntegrationTests` |
| Production | `ProductionOrderPagingTests`, `Drawing2DFormatSupportTests`, `SolidWorksConversionEngineTests` |
| Marketing | `MarketingSecurityTests`, `MarketingActivityContractTests`, `MarketingSettingsApiTest` |
| Documents / storage | `DocumentsApiTest`, `DocumentReferenceApiTest`, `DocumentMirrorPolicyTests`, `AttachmentStorageLedgerTests` |
| CAD | `CadConversionJobServiceTests`, `CadFormatSupportTests`, `CadEngineAutoDetectionTests`, `SatAcisConversionEngineTests`, `CadWorkerSafetyTests`, `CadMissingEngineStartupTests` |
| Infra | `ProcessingJobPipelineTests`, `NotificationReminderSchedulerTests`, `MasterValueCache*Tests`, `UploadStreamingGuardTests`, `StorageRootConfigurationTests` |

**Frontend [VERIFIED]:** 16 `tests/*.test.js` (14 green / 2 stale-red) + 83 co-located `src/**/*.test.js`.
The `tests/` files are **static contract tests** (read source files and assert patterns like
"the service calls the real `/contacts` endpoint"), not browser/component tests. No E2E/Playwright
suite was found in `tests/`. Some `purchase/services/*.test.js` exist co-located but were **not run**
by this audit (no aggregate runner; out of scope to enumerate all 83).

**Health endpoints available [VERIFIED]:**
- `GET /v1/actuator/health` → `{"status":"UP"}` (public).
- `/v1/actuator/info`, `/v1/actuator/prometheus` public; other actuator endpoints require JWT.
- `GET /v1/cad-conversion/health` → 401 (auth required).

---

## 9. Unverified Workflows (require manual E2E before extraction)

Not exercised by this audit (no live end-to-end UI/browser run, no authenticated API session, no DB
writes): everything below is **[NOT VERIFIED]** at runtime, even where unit/contract tests exist.

- **Authentication & permissions:** login → token → refresh rotation → role/permission enforcement
  across modules (unit-tested, but no live login performed here).
- **CRM:** Leads, Clients, Follow-ups, and the new **Contacts** capture/sync/backfill/conversion flow
  (Contacts in particular depends on a table that is not yet in the checked-in schema).
- **Marketing:** visits, expenses, travel planners, map, q-forms.
- **Sales / CPR / CPO / E-Actions / quotations:** create→approve→convert chains and document print.
- **Purchase:** requisition → RFQ → PO → GRN → invoice, three-way matching, payments (Purchase runs a
  `local` vs `api` data mode via `VITE_PURCHASE_DATA_MODE` — **which mode is active is NOT VERIFIED**).
- **Production:** work orders, shop floor (casting/fabrication/machine shop/assembly/quality/packing/
  dispatch), KPI cards (2 frontend contract tests currently fail).
- **Engineering Design / CAD:** model upload → conversion job → GLB view, and the CAD worker itself
  (worker liveness not identifiable; health 401).
- **Documents/uploads/downloads:** repository, versioning, permissions, large-file upload path.
- **Shared DB operations & numbering:** sequence generation and cross-module FK behavior under
  concurrent writes.

**Workflows that must be regression-tested before microservice extraction (priority order):**
1. Auth + refresh + role/permission parity.
2. CRM Leads→Contacts→Clients conversion; Sales CPR→Quotation→Sales Order; Purchase PR→RFQ→PO→GRN→Invoice.
3. Sales Order ↔ Production Order linkage.
4. Documents/uploads + attachment storage.
5. Numbering/`auto_number_sequences` under concurrency.
6. CAD conversion job lifecycle.

---

## 10. Confirmed Blockers and Potential Risks

### 10.1 Confirmed blockers **[VERIFIED]**

| # | Severity | Blocker | Evidence | Why it blocks extraction |
|---|---|---|---|---|
| B1 | **High** | **Dirty, uncommitted baseline** — 133 modified + 64 untracked + 1 deleted; ~7.9k/3.0k line diff. | `git status`, `git diff --stat` | No trustworthy reference revision to diff a service against; regression signal is ambiguous. |
| B2 | **High** | **Contacts table not in baseline schema** — code maps `contacts`; schema file lacks it; only the untracked `contacts_migration.sql` defines it; `ddl-auto=validate`. | `Contact.java` `@Table(name="contacts")`; grep of `erp_db_schema_latest.sql`; `application.properties` | Boot of the current code against a DB without `contacts` fails validation → cannot freeze a runnable baseline without applying a migration (which is out of scope here). |
| B3 | **Medium** | **Deleted `CrmController` + replacement not yet committed** — `/contacts` ownership moved to the untracked `ContactController`. | `D` status; HEAD file content; no references remain | Contract history is broken until committed; extraction needs a frozen `/contacts` contract. |
| B4 | **Medium** | **Frontend lint fails** (863 problems). | `npm run lint` exit 1 | A red lint gate weakens CI signal used to guard refactors. |
| B5 | **Medium** | **2 frontend test files fail** (stale source-pattern assertions). | per-file `node --test` results | The existing contract tests cannot be trusted as-is as the migration safety net until updated. |
| B6 | **Low–Med** | **CAD worker not identifiable / health 401** — no separate worker JVM; liveness unverifiable. | `jps -l`; `/v1/cad-conversion/health` → 401 | Engineering-Design extraction depends on a worker whose current runtime state is unknown. |

### 10.2 Potential risks **[INFERRED]**

| # | Severity | Risk | Basis |
|---|---|---|---|
| P1 | High | **Shared MySQL database + dense cross-module FKs** (CPR→Quotation→Order; Sales↔Production; shared `customers`, masters, numbering) — independent per-service data ownership does not exist yet. | schema + controllers/entities |
| P2 | High | **Shared auth/permissions** (single JWT, `CRM_*`/`SALES_*`/… authorities) — every extraction must preserve the token contract and authority names. | security package, `@PreAuthorize` |
| P3 | Med | **Shared file storage root** (`ERP_UPLOAD_DIR` drives attachments, CAD models/drawings/previews, job staging). | `application.properties` |
| P4 | Med | **Inconsistent API base paths** — Purchase uses `/api/purchase/...` while all other modules use `/...`; the frontend enforces a second base (`PURCHASE_API_BASE`) plus a `local`/`api` data mode. | `purchase/api/index.js`, controllers |
| P5 | Med | **H2 DDL/index mismatch** (`purchase_timeline.created_at`) may indicate drift that MySQL `validate` could reject. | §5 test log |
| P6 | Med | **`node --test tests/` directory form aborts** on first failure; there is no aggregate runner or `npm test`, so CI does not currently run frontend tests (CI only builds). | `package.json`, CI workflow |
| P7 | Low | **Runtime/toolchain split:** build environment is Java 21 on PATH but running JVMs use JDK 24; frontend runs on 5173 (Vite default) while the start script advertises 5174. | `java -version`, `jps`, netstat, `start-all.sh` |

### 10.3 Baseline status summary

| Gate | Result |
|---|---|
| Frontend production build | ✅ PASS (exit 0) |
| Frontend lint | ❌ FAIL (863 problems) |
| Frontend tests | ⚠️ 14/16 files pass; 2 stale-red |
| Backend `verify` (476 tests) | ✅ PASS (exit 0) |
| Backend runtime health | ✅ `{"status":"UP"}` on :8080 |
| MySQL | ✅ listening on 3306 |
| Live DB schema match | ⚪ NOT VERIFIED (mysql client unavailable) |
| CAD worker | ⚪ NOT VERIFIED (no separate JVM; health 401) |
| Git baseline | ❌ DIRTY (197 changes) |

---

## 11. Recommended Next Steps (priority order)

> Advisory only — none of these were performed.

1. **Freeze the baseline.** Review and commit the 197 pending changes (or record an explicit
   "known-dirty" reference SHA). Resolve the `CrmController` deletion + untracked Contacts slice as
   one coherent CRM change. *Mandatory before any extraction.*
2. **Close the Contacts schema gap.** Decide and apply `contacts_migration.sql` (or remove the
   dependency) so the current code boots under `ddl-auto=validate`. Verify `contacts` exists in
   `erp_db` and in the checked-in schema baseline.
3. **Repair the frontend test signal.** Update the two stale contract tests
   (`production-integration.test.js`, `production-kpi-pagination.test.js`) and add an aggregate
   test runner (e.g. an `npm test` that runs `node --test tests/**`) so CI can gate on it.
4. **Reduce lint debt to a passing state** (or pin a baseline lint config) so refactors have a green
   signal.
5. **Investigate the H2 `purchase_timeline.created_at` index warning** and confirm the same schema
   validates against MySQL.
6. **Run manual E2E smoke tests** for the §9 priority workflows against the running stack
   (backend :8080 + MySQL) before declaring the baseline runnable.
7. **Pin port/toolchain conventions.** Align the frontend dev port with the start script (or update
   the script), and confirm the intended JDK (21 vs 24) for the backend.
8. **Confirm CAD-worker runtime intent** (enabled/disabled, separate JVM or embedded) and record it.
9. **Only then** begin planning the first extraction with §10 blockers explicitly accepted.

---

## 12. GO / NO-GO Recommendation

### 🔴 **NO-GO** for starting microservice extraction now.

**Rationale:** the code *builds* and the backend *passes all 476 tests*, and the live stack is
healthy — but two hard prerequisites are unmet:

1. **The baseline is dirty and incomplete** (197 uncommitted changes, a deleted controller, and an
   untracked feature), so any extraction would be measured against a shifting reference (blocker B1/B3).
2. **The working-tree code depends on a database table (`contacts`) absent from the checked-in schema**
   while `ddl-auto=validate` is enforced — the frozen baseline is not reliably bootable as-is (blocker B2).

Secondary gaps (lint red, 2 stale frontend tests, unverifiable live schema and CAD worker) further
weaken the regression safety net that must exist *before* splitting a monolith.

**Conditions to flip to GO:**
- ✅ Commit/reconcile the working tree to a single reference revision.
- ✅ Apply/migrate the `contacts` table so the current code boots under `validate`, and add it to the
  schema baseline.
- ✅ Get frontend lint and the two failing contract tests green (or explicitly accept and pin them).
- ✅ Run the §9 priority E2E smoke tests green against the frozen revision.
- ✅ Re-run `./mvnw verify` and `npm run build` against that committed revision (both currently pass).

Once those are met, extraction can proceed starting with the lowest-coupling service (Identity &
Access), per the earlier technical audit's dependency-driven order.

---

## Appendix — Exact commands run by this audit (read-only)

```bash
# Git (read-only)
git rev-parse --show-toplevel ; git branch --show-current ; git rev-parse HEAD
git log -1 --format="%H %ci %s" ; git remote -v
git status --porcelain ; git diff --stat ; git diff --name-status ; git diff --cached --name-status

# Frontend
node --version ; npm --version
npm run build                 # exit 0
npm run lint                  # exit 1 (863 problems)
node --test tests/<file>.test.js   # 14/16 files pass

# Backend
java -version ; ./mvnw -B verify    # exit 0 (476 tests, BUILD SUCCESS)
jps -l

# Runtime (read-only)
netstat -ano | grep LISTEN
curl -s http://localhost:8080/v1/actuator/health   # {"status":"UP"}
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/   # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/v1/cad-conversion/health  # 401
```

*End of report. Read-only; no source, config, dependency, database record or existing documentation
was modified.*
