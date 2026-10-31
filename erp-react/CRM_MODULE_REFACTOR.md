# CRM Module Refactor — Toward a Modular Monolith

**Scope of this phase:** give the CRM module a real boundary inside the existing Spring Boot application — one package tree, a measured dependency surface, executable guards — **without changing a single API, table or business rule**. No controller mapping, DTO field, validation, permission, query or React file was touched.

**Repository:** `erp-react`, backend `erp-react/erp-backend`, base commit `93a76c3`.

### How to read this document

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | Established by reading the source or running a command in this phase; the command/source is cited. |
| **[MEASURED]** | Produced by a mechanical scan or by an ArchUnit run whose method is stated. |
| **[PROPOSED]** | A recommendation, not implemented. |
| **[OPEN]** | Could not be verified in this environment. |

---

## 1. CRM as it was (before this phase) **[VERIFIED]**

CRM existed as a *vocabulary*, not as a boundary: 47 classes spread across the five flat layer packages `controller/`, `service/`, `repository/`, `entity/`, `dto/`, with no package of its own.

### 1.1 What CRM actually is

| Layer | Classes |
|---|---|
| Controllers | `CustomerController`, `ContactController`, `LeadController`, `FollowUpController` |
| Services | `CustomerService`, `ContactService`, `LeadService`, `FollowUpService` |
| Repositories | `CustomerRepository`, `ContactRepository`, `LeadRepository`, `FollowUpRepository` |
| Entities | `Customer`, `CustomerContact`, `CustomerShippingAddress`, `CustomerAttachment`, `Contact`, `Lead`, `LeadStage`, `LeadStatus`, `FollowUp`, `FollowUpAttachment` |
| DTOs | 25 classes — the `Customer*`, `Contact*`, `Lead*`, `FollowUp*` shapes plus ten DTOs that were used **only** by CRM despite their generic names (`ActivityResponse`, `HistoryResponse`, `TimelineResponse`, `NoteRequest`, `NoteResponse`, `ExportRequest`, `AttachmentResponse`, `AssignOwnerRequest`, `ChangeStageRequest`, `ChangePriorityRequest`) |

**Not CRM, deliberately excluded:** `PlantContact` (`qform_plant_contacts`) belongs to the Questionnaire/CPR flow (`QuestionnaireFormService`, `MarketingModuleDataSeeder`); `MarketingLead` / `MarketingFollowUp` / `MarketingVisit*` are the separate Offline-Marketing module; `Activity`, `Attachment`, `Note`, `TimelineEntry`, `HistoryEntry` are shared detail tables (see §6.2).

### 1.2 HTTP surface — 78 handlers, all preserved

| Controller | Handlers | Base path | Class-level permission |
|---|---|---|---|
| `CustomerController` | 19 | `/customers` | `CRM_VIEW` |
| `ContactController` | 16 | `/contacts` | `CRM_VIEW` |
| `LeadController` | 28 | `/leads` | `CRM_VIEW` |
| `FollowUpController` | 15 | `/followups` | `CRM_VIEW` |

Method-level `@PreAuthorize` (`CRM_CREATE`, `CRM_EDIT`, `CRM_DELETE`) are unchanged; verified by diffing every `@*Mapping` / `@PreAuthorize` line before and after the move — **no mapping annotation line changed** **[VERIFIED]**.

### 1.3 Tables (unchanged)

`customers`, `customer_contacts`, `customer_shipping_addresses`, `customer_attachments`, `contacts`, `leads`, `followups`, `followup_attachments`. All are declared with explicit `@Table(name = ...)` and an implicit entity name (the simple class name), so neither the table names nor the JPQL entity names depend on the package **[VERIFIED]**. `CustomerAttachment` and `FollowUpAttachment` keep their `@EntityListeners(AttachmentStorageLedgerListener.class)` registration.

### 1.4 How other code reached into CRM (the problem)

With everything in flat packages, "CRM" could not be expressed as a rule. Measured fan-in of CRM types before the move **[MEASURED]** (files importing a CRM repository or entity, excluding CRM's own files):

| Consumer | CRM internals it used |
|---|---|
| `service/QuotationService` | `CustomerRepository`, `FollowUpRepository`, `Customer`, `FollowUp` |
| `service/ProfitWorkoutService` | `CustomerRepository`, `Customer` |
| `service/CprService` | `CustomerService`, `CustomerRepository`, `CustomerRequest`, `CustomerResponse`, `Customer` |
| `service/CprTechnicalVerificationService` | `CustomerRepository`, `Customer` |
| `service/MarketingVisitService` | `CustomerRepository`, `LeadRepository`, `FollowUpRepository`, `Customer`, `Lead`, `Contact` — **and it writes `Lead` / `FollowUp` rows** |
| `service/MarketingMapService` | `CustomerRepository`, `Customer` |
| `service/DashboardService`, `service/SalesDashboardService`, `controller/DashboardController` | `CustomerRepository`, `LeadRepository`, `FollowUpRepository`, `LeadStage`, `LeadStatus`, `Lead` |
| `service/LocationMasterService`, `service/MasterValueService` | `CustomerRepository`, `LeadRepository` (master-data "is it in use" checks) |
| `service/PdfGenerationService` | `CustomerRepository`, `LeadRepository`, `FollowUpRepository`, the entities |
| `service/DocumentBackfillService`, `DocumentReconciliationService`, `DocumentRepositoryService`, `DocumentPermissionService`, `DocumentModuleScope` | CRM entities/repositories or CRM services |
| `config/DataSeeder`, `config/MasterDataSeeder`, `config/MarketingExpenseSeeder`, `config/MarketingModuleDataSeeder` | the entities/repositories, to seed demo data |
| `entity/Activity`, `entity/Attachment`, `entity/HistoryEntry`, `entity/Note`, `entity/TimelineEntry` | a JPA `@ManyToOne Lead` association |

---

## 2. CRM now (after this phase) **[VERIFIED]**

47 files moved with `git mv` (history preserved) into a single module tree:

```
com.vishatech.erp.crm
├── controller   4   CustomerController, ContactController, LeadController, FollowUpController
├── service      4   CustomerService, ContactService, LeadService, FollowUpService
├── repository   4   CustomerRepository, ContactRepository, LeadRepository, FollowUpRepository
├── entity      10   Customer, CustomerContact, CustomerShippingAddress, CustomerAttachment,
│                    Contact, Lead, LeadStage, LeadStatus, FollowUp, FollowUpAttachment
└── dto         25   the CRM request/response shapes
```

Component scan, JPA entity scan and repository scan all still find every bean:

| Mechanism | Before | After | Status |
|---|---|---|---|
| `ErpApplication` component scan | root `com.vishatech.erp` (implicit) | root `com.vishatech.erp` — `crm.*` is under it | unchanged **[VERIFIED]** |
| ERP entity/repository scan | Boot default package root | same, `crm.entity` / `crm.repository` included | unchanged **[VERIFIED]** |
| CAD worker component scan | `{erp.cad, cadworker}` | unchanged (CRM is not worker code) | unchanged **[VERIFIED]** |
| CAD worker `@EntityScan` | `com.vishatech.erp.entity` | `{com.vishatech.erp.entity, com.vishatech.erp.crm.entity}` | **changed, required** — §3 |
| CAD worker `@EnableJpaRepositories` | `com.vishatech.erp.repository` | unchanged (no worker code uses a CRM repository) | unchanged **[VERIFIED]** |

---

## 3. The blocker that had to be solved first: the worker's persistence unit **[VERIFIED]**

`CadWorkerConfiguration` starts a second, port-less Spring Boot context from the same jar with a **narrow** component scan, so it declares its persistence surface explicitly:

```java
@EntityScan(basePackages = "com.vishatech.erp.entity")
@EnableJpaRepositories(basePackages = "com.vishatech.erp.repository")
```

Five entities in the flat `erp.entity` package declare `@ManyToOne @JoinColumn(name = "lead_id") private Lead lead;` — `Activity`, `Attachment`, `HistoryEntry`, `Note`, `TimelineEntry` (`lead_activities`, `lead_attachments`, `lead_history`). They belong to CRM functionally but are mapped in the shared package. Moving `Lead` without extending that scan breaks worker start-up. Measured experimentally by reverting the scan to its old value:

```
Failed to initialize JPA EntityManagerFactory:
Association 'com.vishatech.erp.entity.Activity.lead' targets the type
'com.vishatech.erp.crm.entity.Lead' which does not belong to the same persistence unit
```

**Resolution:** the scan now lists both packages, with the reason in a comment, and a new test protects the contract:

`src/test/java/com/vishatech/cadworker/CadWorkerPersistenceUnitTests.java` boots the **real worker context** on H2 and asserts the metamodel contains the conversion queue, the production model projection, `Activity` and `crm.entity.Lead`. The test fails exactly when the scan is wrong (proved by the experiment above) — so a future entity move can no longer break the worker silently **[VERIFIED]**.

This is the one production-configuration change in this phase. It widens the worker's *mapping* surface, not its behaviour: the worker has no CRM repository, service or controller on its classpath and its component scan is untouched.

---

## 4. Approved dependency rules **[VERIFIED / MEASURED]**

### 4.1 Outward — what CRM may use

CRM depends on **24** shared types, all pre-existing platform code **[VERIFIED]**:

| Concern | Types |
|---|---|
| Errors | `BadRequestException`, `DuplicateResourceException`, `ResourceNotFoundException` |
| Files / attachments | `AttachmentStorageLedgerListener`, `AttachmentSized`, `FileStorageService`, `UploadStreams`, `DocumentVisibility` |
| Audit / history | `EditHistoryRepository`, `EditHistoryService`, `RecordRevisionRepository` |
| Documents | `DocumentRepositoryService` |
| Notifications / HTTP envelope | `ApiResponse`, `BulkRequest` |
| Lead detail tables (still shared) | `Activity`, `Attachment`, `Note`, `TimelineEntry`, `HistoryEntry` |
| Administration masters | `LocationMasterService` (location validation on lead/customer save) |
| Sales document chain (**frozen**) | `Invoice`, `PaymentReceipt`, `InvoiceRepository`, `PaymentReceiptRepository` — used only by `CustomerService.getStatement()` |

CRM does **not** depend on Production, Packing List, Marketing or Purchase — enforced, no allow-list.

### 4.1b The categories this phase was asked about, verified one by one **[VERIFIED]**

| Concern | Does CRM use it? | Evidence |
|---|---|---|
| Sales document chain | **Yes, one place** | `crm/service/CustomerService` imports `entity.Invoice`, `entity.PaymentReceipt`, `repository.InvoiceRepository`, `repository.PaymentReceiptRepository` for `getStatement()`. Frozen rule, 1 allow-list entry. |
| Marketing | **No** | no `Marketing*` reference anywhere in `crm`; enforced by `crm_does_not_depend_on_other_business_modules` |
| Users | **No** | `User` / `UserRepository`: 0 references. The acting username comes from Spring Security itself — `SecurityContextHolder.getContext().getAuthentication()` in `CustomerService`, `FollowUpService`, `LeadService` — so identity stays a platform concern and CRM never touches the user table. |
| Notifications | **No** | `NotificationService` / `NotificationRepository`: 0 references. CRM emits no notifications today. |
| Audit logging | **No** | `AuditContext`, `SecurityAuditLogger`, `DocumentAuditService`: 0 references. CRM's record history is its own `EditHistory` / `RecordRevision` tables (`EditHistoryRepository`, `EditHistoryService`, `RecordRevisionRepository`), which are shared infrastructure, not an audit-log dependency. |
| Attachments | **Yes — via the shared primitive only** | `FileStorageService` (5 files) plus `@EntityListeners(AttachmentStorageLedgerListener.class)` on `CustomerAttachment` and `FollowUpAttachment`. CRM never talks to `AttachmentStorageService` directly; the listener keeps the shared 4 GB ledger — this is exactly the deliberate entity→service edge frozen in the previous phase. |
| Contacts | **Owned by CRM** | `Contact`, `ContactRepository`, `CustomerContact`, `CustomerShippingAddress` are CRM's; **no** file outside `com.vishatech.erp.crm` imports `ContactRepository` or `Contact` (only the unrelated `PlantContact`, which belongs to the Questionnaire flow). |
| CPR / CostWorkout / Production / Purchase | **No** | not in CRM's import set; Production/Marketing/Purchase enforced |

### 4.1c Cycles **[VERIFIED]**

The refactor introduces no cycle and removes none of the pre-existing ones. `CprService → CustomerService` (convert-to-customer) is one-way: CRM imports nothing from CPR. `CRM → Invoice/PaymentReceipt` and `CRM → LocationMasterService` are one-way too. The only cycle in the repository is still `CPR ↔ CostWorkout`, which CRM is not part of.

### 4.2 Inward — how other modules may use CRM

| Allowed | Meaning |
|---|---|
| `crm.service.*` | the module's coarse operations (e.g. `CprService` calls `CustomerService.create(...)` for "Convert to Customer") |
| `crm.dto.*` | the request/response shapes |
| `crm.entity.*`, `crm.repository.*` | **internals** — only the frozen allow-list may read them, and no entry may be added without changing this document |

---

## 5. Guards added and updated **[VERIFIED]**

`ModuleBoundaryTests` now carries **16** rules (13 before + 3 new) and `SourceHygieneTests` 1, so the architecture suite runs **17** tests.

**Updated so the move did not weaken the existing guard** (the same invariants, now covering both the flat and the CRM packages):

| Rule | Change |
|---|---|
| `entities_do_not_depend_on_repositories` | subject/target now include `crm.entity`, `crm.repository` |
| `repositories_do_not_depend_on_services_or_controllers` | same, both directions |
| `controllers_do_not_depend_on_repositories` | subject includes `crm.controller`; the 2 CRM attachment-entity entries in the allow-list were re-pointed to `crm.entity.*` |
| `entities_do_not_depend_on_services` | subject/target include the CRM packages |
| `outside_does_not_depend_on_production_persistence` | subject includes `crm.service`, `crm.controller`, so CRM cannot start reading production tables |

**New rules:**

| Rule | Kind | Measured today |
|---|---|---|
| `outside_does_not_depend_on_crm_internals` | frozen | 422 edges from **19** classes, all listed in the allow-list |
| `crm_does_not_depend_on_other_business_modules` | enforced | 0 violations |
| `crm_does_not_depend_on_the_sales_document_chain` | frozen | 32 edges from **1** class — `CustomerService` (the customer statement) |

**Method:** both new rules were first added with **empty** allow-lists and run; the failing output supplied the exact violator sets recorded above, which were then written into the allow-lists (verified green afterwards). **[MEASURED]**

**Finding worth keeping:** three of the sixteen files frozen by `SourceHygieneTests` (`DocumentBackfillService`, `MarketingMapService`, `PdfGenerationService`) relied on `import com.vishatech.erp.entity.*` to see CRM types — the package move surfaced that as a compile error. That is direct evidence for the hygiene rule: wildcard imports hide exactly this kind of cross-module edge.

---

## 6. Remaining coupling (honest inventory)

### 6.1 The 20 frozen readers of CRM internals

| Group | Classes | Genuine need | Target state **[PROPOSED]** |
|---|---|---|---|
| Lead detail tables | `entity.Activity`, `Attachment`, `HistoryEntry`, `Note`, `TimelineEntry` | they declare `@ManyToOne Lead` | move them into `crm.entity` too — now guarded by `CadWorkerPersistenceUnitTests`, so it is a safe follow-up |
| Dashboards / read model | `DashboardController`, `DashboardService`, `SalesDashboardService` | lead counts by stage/status, follow-up counts, recent activities | a CRM **read model** (`CrmStatsView`) |
| Master-data "in use" checks | `LocationMasterService`, `MasterValueService` | does any customer/lead reference this location/value | `CrmUsageProvider` |
| Sales / CPR | `QuotationService`, `ProfitWorkoutService`, `CprService`, `CprTechnicalVerificationService` | customer currency; duplicate-customer lookup before convert | `CrmCustomerQuery` (currency, duplicate match, id-by-lookup) |
| Marketing | `MarketingVisitService`, `MarketingMapService` | resolve a customer name; **write** `Lead` and `FollowUp` rows for a recorded visit | `CrmCustomerQuery` (read) + `CrmLeadCommand` (write) — the write is the most serious edge in this list |
| Documents | `DocumentBackfillService` | backfill CRM-linked document visibility | `CrmCustomerQuery` |
| Rendering | `PdfGenerationService` | render customer/lead/follow-up PDFs | shared view DTOs from `crm.api` |
| Demo/dev | `config.DataSeeder` (+ the three other seeders) | seed demo customers and leads | seed through `crm.service` (dev-only code, lowest risk) |

### 6.2 Structural inversions still open

1. **Lead's child tables live outside CRM** (`entity.Activity/Attachment/Note/TimelineEntry/HistoryEntry`) and point *into* CRM. This is the clearest next move; it is no longer risky because the worker contract is covered by a test.
2. **CRM entities are mapped by the CAD worker** as a side effect of §3. Harmless today (the worker has no CRM code), but it means CRM entity moves must keep that scan in sync.
3. **`CustomerService` reads the sales document chain** for the statement — one frozen rule, one allow-list entry.
4. **CRM depends on `LocationMasterService`** (administration) for location validation.
5. **No `crm.api` package yet.** §4.2 is expressed as "services + DTOs are public, entity/repository are internal", not yet as a narrow interface set.

### 6.3 Blockers encountered

None that stopped the refactor. The one real hazard — the worker's `@EntityScan` — was found *before* the move, fixed in the same change, and is now covered by a test that provably fails without the fix.

---

## 7. Changed files

**Moved (47, `git mv` → rename with history, package + import edits only):**

- `crm/controller/` (4): `CustomerController`, `ContactController`, `LeadController`, `FollowUpController`
- `crm/service/` (4): `CustomerService`, `ContactService`, `LeadService`, `FollowUpService`
- `crm/repository/` (4): `CustomerRepository`, `ContactRepository`, `LeadRepository`, `FollowUpRepository`
- `crm/entity/` (10): `Customer`, `CustomerContact`, `CustomerShippingAddress`, `CustomerAttachment`, `Contact`, `Lead`, `LeadStage`, `LeadStatus`, `FollowUp`, `FollowUpAttachment`
- `crm/dto/` (25): `Customer*` (7), `Contact*` (3), `LeadRequest`, `LeadResponse`, `FollowUp*` (3), `ActivityResponse`, `HistoryResponse`, `TimelineResponse`, `NoteRequest`, `NoteResponse`, `ExportRequest`, `AttachmentResponse`, `AssignOwnerRequest`, `ChangeStageRequest`, `ChangePriorityRequest`

**Modified for the boundary (49 files, excluding the `pom.xml` change that belongs to the earlier ArchUnit phase):**

- `src/main/java/com/vishatech/cadworker/CadWorkerConfiguration.java` — **the only production-configuration change**: `@EntityScan` now also lists `com.vishatech.erp.crm.entity` (§3). 1 file.
- `service/CprTechnicalVerificationService.java` — one fully-qualified reference re-pointed (`com.vishatech.erp.entity.Customer::getCurrency`); a second one (`Contact.STATUS_*` in `ContactController`) sits inside a moved file.
- **47 files import-updated only, one line each**: 31 under `src/main` (the `controller/`, `service/`, `repository/`, `dto/`, `entity/`, `config/` consumers listed in §1.4 and §6.1) and 16 test classes.
- A third file with rule changes — `src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java` — sits in a directory that is still untracked from the previous phase, so it appears under “Added (2)” below in `git status` terms; its content changed as described in §5.

**Added (2):**

- `src/test/java/com/vishatech/cadworker/CadWorkerPersistenceUnitTests.java` — the worker persistence-unit contract (§3)
- `CRM_MODULE_REFACTOR.md` — this document

`git status` at the end of the phase: **47 renames**, **50 modified** (the 49 above + `pom.xml`), **2 new files**, no deletions, frontend clean.

**Not touched:** the React frontend, `pom.xml` (the ArchUnit dependency is from the previous phase), `application.properties`, `logback-spring.xml`, any SQL/schema, any other module's behaviour. No file was deleted. 34 files that the mechanical passes touched were restored to byte-identical content (line endings normalized to the repository's `eol=lf` convention) so the diff contains only real changes.

---

## 8. Test results

| Command | Result |
|---|---|
| `./mvnw -B -o test -Dtest=CadWorkerPersistenceUnitTests,CrmApiTest,ContactsApiTest,LeadImportLimitTests` | **PASS** — `Tests run: 16, Failures: 0, Errors: 0` |
| `./mvnw -B -o test -Dtest=ModuleBoundaryTests,SourceHygieneTests` | **PASS** — `Tests run: 17, Failures: 0, Errors: 0` |
| Same worker test with `@EntityScan` reverted to the old single package (temporary experiment, reverted) | **FAIL as intended** — Hibernate refuses to build the persistence unit (§3) |
| The two new CRM rules with empty allow-lists (temporary experiment, filled afterwards) | **FAIL as intended** — 422 / 32 edges, giving the measured violator sets in §5 |
| `./mvnw -B -o verify` (full suite) | **PASS** — `BUILD SUCCESS`, `Tests run: 494, Failures: 0, Errors: 0, Skipped: 0` (490 before this phase − 14 replaced architecture tests + 17 architecture tests + 1 new worker test) |

**Not run / could not run:** the live MySQL schema (`ddl-auto=validate`) — no client in this environment; the CAD worker against a real conversion engine — unchanged by this phase and not required to verify a package move.

---

## 9. Next steps **[PROPOSED]**

1. **Add `com.vishatech.erp.crm.api`** with `CrmCustomerQuery` (reference, currency, duplicate match), `CrmUsageProvider` (master-data in-use counts) and `CrmStatsView` (dashboard aggregates), then migrate the 20 allow-listed readers away from entities/repositories — one consumer per commit, shrinking the allow-list each time.
2. **Move Lead's child tables** (`Activity`, `Attachment`, `Note`, `TimelineEntry`, `HistoryEntry`) into `crm.entity`, keeping `CadWorkerConfiguration`'s scan in sync (the new test enforces it).
3. **Move the CRM writes out of Marketing**: `MarketingVisitService` currently saves `Lead` and `FollowUp` rows directly; give CRM a command API and let Marketing call it.
4. **Re-home the CRM demo seeding** (`config.DataSeeder` and friends) behind CRM services.
5. **Only then** consider moving the *next* module — the same recipe applies: measure the fan-in, move with `git mv`, fix imports, extend the guards so coverage never drops.
