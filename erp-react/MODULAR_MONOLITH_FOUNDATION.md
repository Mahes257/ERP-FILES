# Modular Monolith Foundations — ERP Backend

**Scope of this phase:** establish the *foundations* for a modular monolith — a verified map of what is shared, what is module-specific, what currently depends on what, and an executable boundary guard — **without moving code**. No package was renamed, no class was moved, no route, schema, entity mapping, security rule, deployment artifact or frontend file was touched.

**Repository:** `erp-react`, backend `erp-react/erp-backend`, commit `93a76c3`.

> **Revision note — after the CRM phase.** The CRM module has since been extracted into `com.vishatech.erp.crm.*`; see [CRM_MODULE_REFACTOR.md](CRM_MODULE_REFACTOR.md). Deltas to this document: the architecture suite now has **16 `@ArchTest` rules + 1 hygiene test (17 tests)** instead of 14, because the CRM rules were added; the layer rules in §4/§6 now cover both the flat packages and the CRM packages, so nothing in this document lost coverage; the CRM proposal in §4.2 is realised (CRM is no longer a class-name convention); and `CadWorkerConfiguration.@EntityScan` now lists `com.vishatech.erp.crm.entity` as well as `com.vishatech.erp.entity` (§5 risk 2 materialised and was fixed — `CadWorkerPersistenceUnitTests` guards it). Everything else in this document still describes the repository as it is.

### How to read this document

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | Established by running a command or reading the source in this phase; the exact command/source is cited. |
| **[MEASURED]** | Produced by a mechanical scan whose method and limitations are stated. |
| **[PROPOSED]** | A recommendation. Not implemented. |
| **[OPEN]** | Could not be verified in this environment. |

---

## 1. Baseline — what the code and build actually are

### 1.1 Shape of the application **[VERIFIED]**

| Fact | Evidence |
|---|---|
| One Maven artifact, one bootable jar | `erp-backend/pom.xml` — only `spring-boot-maven-plugin` + `maven-compiler-plugin`; `mainClass` = `com.vishatech.erp.ErpApplication` |
| One Spring Boot application serving `/v1` on 8080 | `ErpApplication` is annotated `@SpringBootApplication` + `@EnableJpaAuditing` with **no** `scanBasePackages`, so the component-scan root is its own package `com.vishatech.erp` |
| A second, port-less process from the *same* jar | `ErpApplication.main` branches on `CadWorkerApplication.isWorkerMode(args)` and runs `CadWorkerConfiguration`, started with `WebApplicationType.NONE` |
| Test scope only: H2 in-memory, MySQL mode | `src/test/resources/application.properties` shadows the main one; `ddl-auto=create-drop`; `AbstractSecurityTest` injects the H2 URL and recreates `audit_logs` |

`src/main/java` holds **728** Java files: **722** under `com.vishatech.erp` and **6** under `com.vishatech.cadworker` **[VERIFIED]**.

### 1.2 The structure is package-by-layer, not package-by-feature **[VERIFIED]**

File counts per top-level package under `com/vishatech/erp`:

| Package | Files | Package | Files |
|---|---|---|---|
| `dto` | 218 | `config` | 22 |
| `entity` | 163 | `cad` | 13 |
| `repository` | 110 | `util` | 11 |
| `service` | 93 | `security` | 10 |
| `controller` | 75 | `exception` | 6 |

Only `production` (under `service`, `controller`, `repository`, `entity`, `dto`, `util`, `config`) and the CAD engine package are true feature sub-packages. Everything else is one flat layer file-per-class.

### 1.3 The modules exist as a shared vocabulary, not as boundaries **[VERIFIED]**

Three independent sources in the repository agree on the same module names:

1. **Test packages** — `src/test/java/com/vishatech/erp/api/{administration, auth, documents, engineering, finance, inventory, marketing, production, purchase, sales, users}`, each with exactly one `*ApiTest` class.
2. **The frontend** — `src/purchase/`, `src/production/` in the React app (read only, not modified).
3. **Class-name prefixes** — `Sales*`, `Purchase*`, `Production*`, `Marketing*`, `Cpr*`, `CostWorkout*`, …

Because the modules are only a vocabulary today, **the boundary rules below are expressed on class-name prefixes and packages that exist now**, and are designed to keep working after the eventual package move (each rule is a one-line change of the "what" predicate, not a rewrite).

### 1.4 Baseline gates **[VERIFIED]**

| Gate | Command | Result |
|---|---|---|
| Backend build + full test suite | `cd erp-backend && ./mvnw -B -o verify` | **PASS** — exit 0, `BUILD SUCCESS`, **490 tests, 0 failures, 0 errors**, 5:52 min (476 baseline + 14 new architecture tests) |
| Architecture tests (new) | `./mvnw -B -o test -Dtest=ModuleBoundaryTests,SourceHygieneTests` | **exit 0**, `Tests run: 14, Failures: 0, Errors: 0` |
| ArchUnit dependency resolvable **offline** | `./mvnw -B -o test` | **[VERIFIED]** — `archunit-junit5:1.4.2` (test scope) resolves from the local repository, so CI without network access still runs the guard |

---

## 2. Task 1 — Shared infrastructure inventory

Fan-in below is **[MEASURED]** as: the number of *other* source files that mention the class simple name (word-boundary match), plus the top-level packages those files live in. Method and limitations:

- Counting **files**, not dependency edges, and the file that declares the class is excluded.
- Same-package references are counted (Java needs no import for them), which is why `package`-flat services show realistic numbers.
- It cannot see reflection, string-based bean lookup, or `@PreAuthorize("hasAuthority(...)")` string references — those are noted where relevant.
- Command shape: `grep -rlw <SimpleName> --include=*.java src/main/java`, filtered to drop the declaring file.

### 2.1 Security, authentication and identity **[VERIFIED]**

| Class | Path | Fan-in | Used by (packages) |
|---|---|---|---|
| `User` (entity) | `entity/User.java` | 40 | config, controller, dto, entity, repository, security, service, util |
| `UserRepository` | `repository/UserRepository.java` | 10 | controller, repository, security, service |
| `UserRole` | `entity/UserRole.java` | 5 | entity, security, service |
| `JwtService` | `security/JwtService.java` | 3 | config, security, service |
| `JwtAuthenticationFilter` | `security/JwtAuthenticationFilter.java` | 1 | config |
| `CustomUserDetailsService` | `security/CustomUserDetailsService.java` | 2 | security, service |
| `SecurityAuditLogger` | `security/SecurityAuditLogger.java` | 7 | controller, security, service |
| `Permission`, `RolePermissions` | `security/` | 0 (imports) | consumed via `@PreAuthorize` strings and `SecurityConfig` |
| `AuthRateLimitFilter`, `RateLimiter`, `RestAuthenticationEntryPoint`, `RestAccessDeniedHandler` | `security/` | 0 | filter chain only, registered in `config/SecurityConfig` |
| `SecurityConfig` | `config/SecurityConfig.java` | 0 | the single security configuration (plus `StompJwtInterceptor` for WebSocket) |

**Verdict: genuinely shared.** `User`, `UserRepository`, `UserRole`, `JwtService`, `CustomUserDetailsService`, `SecurityAuditLogger`, `Permission`, `RolePermissions` and the security filter chain are used by several modules and are owned by no business module. Note `Permission`/`RolePermissions` are referenced only *by name inside annotation strings* — invisible to bytecode analysis, worth remembering when the package eventually moves (a stale string fails at runtime, not at compile time).

### 2.2 Exception handling **[VERIFIED]**

| Class | Fan-in | Used by (packages) |
|---|---|---|
| `BadRequestException` | 58 | controller, exception, service, util |
| `ResourceNotFoundException` | 42 | controller, exception, service |
| `DuplicateResourceException` | 5 | exception, service |
| `ForbiddenException`, `TooManyRequestsException` | 1, 1 | controller/service |
| `GlobalExceptionHandler` | 7 | controller, service (referenced; it is the `@RestControllerAdvice`) |

**Verdict: genuinely shared, and a leaf.** The ArchUnit suite asserts it: `exception_layer_stays_leaf` — nothing in `com.vishatech.erp.exception..` may depend on `service..`, `repository..` or `controller..`, and that already holds **[VERIFIED]**. This is the safest package to extract into a shared module first.

### 2.3 Notifications **[VERIFIED]**

| Class | Path | Fan-in | Used by (packages) |
|---|---|---|---|
| `Notification` (entity) | `entity/Notification.java` | 11 | config, dto, repository, service |
| `NotificationRepository` | `repository/NotificationRepository.java` | 2 | repository, service |
| `NotificationService` | `service/NotificationService.java` | 7 | config, controller, repository, service |
| `NotificationController`, `NotificationRequest/Response` | `controller/`, `dto/` | — | HTTP surface |
| `NotificationScheduler` | `config/NotificationScheduler.java` | 1 | config only |

**Verdict: genuinely shared, but its *scheduler* is infrastructure.** `NotificationService` is injected from several modules; `NotificationScheduler` is a platform concern. `dto/production/NotificationCountsDTO` is a *production* DTO that happens to carry the name **[VERIFIED]** — a naming collision, not a shared class.

### 2.4 Audit logging **[VERIFIED]** — the most interesting split

| Class | Path | Fan-in | Owner |
|---|---|---|---|
| `AuditContext` | `util/AuditContext.java` | 29 (controller, security, service) | **shared** (request-scoped actor/IP context) |
| `SecurityAuditLogger` | `security/SecurityAuditLogger.java` | 7 | **shared** (auth events) |
| `DocumentAudit`, `DocumentAuditRepository`, `DocumentAuditService` | `entity/`, `repository/`, `service/` | 3, —, 1 | documents module |
| `SettingsAuditLog`, `SettingsAuditLogRepository` | `entity/`, `repository/` | — | administration (`LocationMasterService` reads it) |
| `AuditLog`, `AuditLogRepository`, `AuditService` | `entity/production/`, `repository/production/`, `service/production/` | 2–5 | **production** — the audit *implementation* and its read API (unchanged by §12) |
| `AuditPort`, `AuditRecord`, `AuditAction`, `AuditModule` | `audit/` | — | **shared** — the audit *write contract* and vocabulary, relocated in §12 |
| `PurchaseRequisitionIngressPort`, `PurchaseRequisitionIngressRequest`, `PurchaseRequisitionIngressResult` | `purchase/api/` | 1 (CPR) | **Purchase-owned published ingress** — the CPR conversion's only Purchase dependency, introduced in §13 |
| `MarketingExpenseAuditLog`, `MarketingExpenseAuditLogRepository` | `entity/`, `repository/` | — | marketing |

**The leak, and its resolution [VERIFIED — see §12]:** `entity/production/AuditAction` and `entity/production/AuditModule` used to be imported by `service/PurchaseSupportService` — the **only** non-shared dependency Purchase had on another business module. They are now shared, owned by the neutral `com.vishatech.erp.audit` package together with the new `AuditPort`/`AuditRecord` write contract, and Purchase depends on that contract instead of on `service.production.AuditService`. Purchase imports no production package at all any more, and its allow-list entry in `outside_does_not_depend_on_production_persistence` is gone (§12.3). The audit *implementation* (`AuditService`, `AuditLog`, `AuditLogRepository`, the `/audit` read API and its DTOs) deliberately stayed where it is: moving it would drag the read API and its mapper along for no boundary benefit, because the dependency that mattered was the compile-time one.

`AuditContext` is the single most widely used piece of infrastructure after the exception classes, and it is used from `controller`, `security` and `service` alike — a genuine shared concern.

### 2.5 Document storage, attachments and file upload **[VERIFIED]**

| Class | Path | Fan-in | Used by (packages) |
|---|---|---|---|
| `FileStorageService` | `service/FileStorageService.java` | 25 | controller, entity, service |
| `AttachmentStorageService` | `service/AttachmentStorageService.java` | 8 | config, controller, entity, repository, service |
| `AttachmentStorageLedgerListener` | `service/AttachmentStorageLedgerListener.java` | 10 | entity, service |
| `AttachmentStorageUsage` (entity) + repository | `entity/`, `repository/` | 1 | repository |
| `AttachmentStorageReconciliationJob` | `config/` | 0 | scheduled infrastructure |
| `UploadStorageConfig`, `UploadSizeGateFilter` | `config/` | 0 | filter/bean registration |
| `UploadStreams` | `util/UploadStreams.java` | 3 | service |
| `AttachmentTransfer` | `service/AttachmentTransfer.java` | 7 | service |
| `DocumentRepositoryService` | `service/DocumentRepositoryService.java` | 19 | controller, dto, service |
| `DocumentPermissionService`, `DocumentModuleScope` | `service/` | 4, 4 | controller, entity, service |
| `DocumentSettingsService`, `DocumentReconciliationService`, `DocumentAuditService`, `DocumentBackfillService` | `service/` | 2, 2, 1, 1 | controller/service |
| `DocumentRepositoryController` | `controller/` | — | HTTP surface |

**Verdict: two distinct things live here.**

1. **Shared storage primitive** — `FileStorageService`, `AttachmentStorageService`, `AttachmentStorageUsage`, `AttachmentStorageLedgerListener`, `AttachmentStorageReconciliationJob`, `UploadStorageConfig`, `UploadSizeGateFilter`, `UploadStreams`. Every module that stores a file goes through these. This is the clearest candidate for a shared infrastructure module.
2. **A documents *feature*** — the `Document*` classes, which are their own module (they have their own controller, DTOs, permission model, and an `api/documents/DocumentsApiTest`).

**The one structural oddity [VERIFIED]:** eight attachment entities (`Attachment`, `CprAttachment`, `CustomerAttachment`, `FollowUpAttachment`, `MarketingExpenseAttachment`, `PurchaseAttachment`, `QFormAttachment`, `SalesAttachment`) declare `@EntityListeners(AttachmentStorageLedgerListener)`, i.e. the persistence layer points *upwards* at the service layer. It is deliberate — the ledger must be updated inside the writing transaction — but it is the only entity→service edge in the codebase. `entities_do_not_depend_on_services` freezes it: the eight are listed explicitly, no ninth entity may join.

### 2.6 Numbering **[VERIFIED]**

| Class | Path | Fan-in | Owner |
|---|---|---|---|
| `PurchaseNumbering` | `util/PurchaseNumbering.java` | 5 | **Purchase** — mislocated in the shared `util` package |
| `PurchaseTotals` | `util/PurchaseTotals.java` | 2 | **Purchase** — ditto |
| `NumberGenerator` | `util/production/NumberGenerator.java` | production-only | production |
| 11 `*NextNumberResponse` DTOs | `dto/` | per module | one per document type — *not* a shared numbering service |

**Finding:** there is **no shared numbering infrastructure**. Each document type has its own "next number" DTO, and the sales documents calculate their numbers in their own services (e.g. `QuotationService`, `SalesOrderService`, `SalesContractService` each own their sequence logic). Only Purchase has extracted a `util` helper — and it sits in the shared `util` package despite being Purchase-specific. Moving those two classes is a *later, tiny, test-protected* step, not part of this phase.

### 2.7 Configuration and technical infrastructure **[VERIFIED]**

`config/` (22 files) is a single package mixing **platform plumbing** and **business seeders**:

- **Platform:** `SecurityConfig`, `SpringContext`, `StompJwtInterceptor`, `WebSocketConfig`, `ApiRequestLoggingFilter`, `UploadSizeGateFilter`, `UploadStorageConfig`, `ProcessingJobAsyncConfig`, `ErpMetrics`, `NotificationScheduler`, `AttachmentStorageReconciliationJob`, `ProcessingJobRecoveryJob`, `PurchasePaymentReminderScheduler`.
- **Business / demo data:** `DataSeeder`, `MasterDataSeeder`, `LocationSeeder`, `ContactBackfillRunner`, `MarketingModuleDataSeeder`, `MarketingExpenseSeeder`, `SalesContractTestDataSeeder`, `config/production/ProductionDataSeeder`.

**Verdict:** the second group is module-specific code living in the shared package. It is *not* a boundary violation today (nobody depends on it; it only runs at startup) but it will have to move with its module. `SpringContext` (a static bean-lookup helper, fan-in 3) is shared but is a service-locator: **[PROPOSED]** treat it as a candidate for removal during the port phase, not as shared API to grow.

### 2.8 What is *not* shared (business-module-specific code currently in shared packages) **[VERIFIED]**

| Class | Lives in | Belongs to |
|---|---|---|
| `PurchaseNumbering`, `PurchaseTotals` | `util/` | Purchase |
| `PdfGenerationService` | `service/` | document rendering across Production/Packing — reads `PackingListRepository` |
| `DashboardController`, `DashboardService` | `controller/`, `service/` | cross-module read model (see §3.2) |
| `MasterValueService`, `LocationMasterService` | `service/` | administration masters that reach into 12–13 sales/CPR repositories |
| `AttachmentTransfer` | `service/` | moves attachments between Sales and Production rows — deliberately cross-module |
| `DocumentBackfillService`, `DocumentReconciliationService` | `service/` | documents |
| `prod` seeders | `config/` | their modules |
| `dto/production/NotificationCountsDTO` | `dto/production/` | production (naming collision with shared notifications) |

---

## 3. Task 3 — Cross-module dependency map (imports and calls)

All edges below were read from the actual source in this phase **[VERIFIED]**.

### 3.1 The key structural insight: coupling happens at the *flat persistence* level

Modules do **not** call each other's services in this codebase — they read each other's **repositories and entities**, which all live in the two flat packages `repository/` and `entity/`. Examples:

- `service/QuotationService.java` imports **17** repositories: `CprRepository`, `CreditNoteRepository`, `CustomerRepository`, `DeliveryChallanRepository`, `EditHistoryRepository`, `FollowUpRepository`, `InvoiceRepository`, `PaymentReceiptRepository`, `ProformaInvoiceRepository`, `QuotationRemarkRepository`, `QuotationRepository`, `RecordRevisionRepository`, `SalesAttachmentRepository`, `SalesContractRepository`, `SalesHistoryRepository`, `SalesOrderRepository`, `SalesTimelineRepository`.
- `service/SalesOrderService.java` and `service/SalesContractService.java` each import a comparable cross-document set.

Consequently **the sales document chain (Quotation → SalesOrder → SalesContract → ProformaInvoice → DeliveryChallan → Invoice → PaymentReceipt → CreditNote) is one module in practice**, even though it is eight services and eight controllers. Treating them separately during a later migration would create an artificial cycle. This is the single most important conclusion for planning.

### 3.2 Verified cross-module edges

| # | Edge | Evidence (source) | Weight |
|---|---|---|---|
| 1 | **Production → Sales** | `service/production/ProductionOrderService` imports `entity.SalesOrder` + `repository.SalesOrderRepository`; uses only `cpo.getId()` (line 107) and `cpo.getSoNo()` (line 108) via `resolveCpo(...)` (line 699) and copies them onto `ProductionOrder.setSalesOrderId/setSalesOrderNumber` | **2 fields.** `ProductionOrder` stores them as plain columns, no JPA association |
| 2 | **Dashboard → Production + CRM** | `controller/DashboardController` imports `dto.production.{Dispatch,Drawing,Model,Packing,Production,TV}StatsDTO`, `entity.production.{EntryStatus,ProductionType}`, `repository.production.ProductionEntryRepository`, `service.production.{Dispatch,Drawing,Model,PackingList,ProductionOrder,TechnicalVerification}Service`, plus `repository.{CustomerRepository,FollowUpRepository}` and shared `CprTechnicalVerificationService`, `QualityInspectionService` | High — one controller fanning into 6 production services |
| 3 | **Outside → production persistence** | 77 edges from 5 classes: `controller.DashboardController`, `service.PdfGenerationService`, `service.PurchaseSupportService`, `service.SalesDashboardService`, `service.cad.CadConversionJobService` | Medium-High |
| 4 | **Production services → flat persistence** | 220 edges from 5 classes: `service.ProductionTrackerService`, `service.production.{ProductionAttachmentService, ProductionKpiService, ProductionOrderService, ProductionSettingsService}` | High volume, narrowed to 5 classes |
| 5 | **Controllers → repositories (bypassing services)** | 45 edges from 7 classes: `DashboardController`, `ExpenseTripController`, `FileController`, `ProductController`, `QuestionnaireFormController`, `RecordRevisionController`, `UserController` | Layering smell, not a module edge — easy to fix |
| 6 | **Entities → services** | 8 edges: the eight attachment entities' `@EntityListeners(AttachmentStorageLedgerListener)` | Deliberate, frozen |
| 7 | **Marketing → CRM / sales attachments** | 87 edges from `service.MarketingMapService`, `service.MarketingVisitService`. `MarketingVisitService` imports `entity.Customer`, `entity.MarketingFollowUp`, `entity.MarketingLead`, `repository.CustomerRepository`, …; `config/MarketingModuleDataSeeder` imports `entity.PlantContact` + `repository.PlantContactRepository` | Medium — Marketing is *not* self-contained |
| 8 | **Marketing → Production/Packing/Accounts/CPR/Purchase** | **No imports found** — `production_does_not…` equivalent: Marketing touches none of them today | Enforced as a rule (see §4) |
| 9 | **Purchase → other business modules** | **No Sales/CRM/CPR imports found.** The only non-shared import is two production audit enums `entity.production.{AuditAction, AuditModule}` used by `service/PurchaseSupportService` | **Two enums** — Purchase is the most isolated module |
| 10 | **Masters → sales chain (in-use checks)** | `service/MasterValueService` imports 13 repositories (`CostWorkout`, `CprItem`, `Cpr`, `CreditNote`, `Customer`, `DeliveryChallan`, `Invoice`, `MasterValue`, `PaymentReceipt`, `ProformaInvoice`, `Quotation`, `SalesContract`, `SalesOrder`); `service/LocationMasterService` imports 12 (`City`, `Country`, `Customer`, `DeliveryChallan`, `District`, `Invoice`, `Lead`, `Quotation`, `SalesContract`, `SalesOrder`, `SettingsAuditLog`, `StateRegion`) | High — a master-data delete check must ask every document module |
| 11 | **Sales-side → sales attachments** | `SalesAttachment`/`SalesHistory`/`SalesTimeline` are read from `QuotationService`, `SalesOrderService`, `SalesContractService`, `ProformaInvoiceService`, `DeliveryChallanService`, `InvoiceService`, `CreditNoteService`, `PaymentReceiptService` — **all sales-chain classes**, so this is intra-module, not a violation | Informational |
| 12 | **Production → sales attachment table** | `service/production/ProductionAttachmentService` imports `SalesAttachmentRepository` | Small, but a real cross-module read |
| 13 | **`AttachmentTransfer`** | imports `entity.SalesAttachment` + `repository.SalesAttachmentRepository`; moves attachments between Sales and Production rows | Deliberate cross-module service |
| 14 | **CPR ↔ CostWorkout — a real cycle** | `service/CprService` and `service/CprTechnicalVerificationService` import `repository.CostWorkoutRepository`; `service/CostWorkoutService` imports `repository.CprRepository` | **The only verified module-level cycle** |

### 3.3 Cycles

- **[VERIFIED] `CPR ↔ CostWorkout`** — both directions exist in the imports today (edge 14). Any later extraction of those two modules must happen together or through a port.
- **[OPEN]** The earlier planning document described a `Sales → Engineering → Accounts → Sales` cycle. That was **not** reproducible with name-prefix analysis in this phase: no class in the repository carries a simple name starting with `Engineering` or `Account`. The verified cycle is the CPR one above; the sales-chain coupling is better described as "one module, eight services" (edge 1 of §3.1) plus the `ProfitWorkoutService → QuotationRepository/CustomerRepository` read. Nothing in this phase's guards depends on the earlier framing.

### 3.4 Method of measurement and its blind spots **[MEASURED]**

- Static **import** analysis of `src/main/java` plus ArchUnit's **bytecode** analysis of the compiled classes. Both agree on the edges above.
- **Blind spots:** wildcard imports (`import com.vishatech.erp.entity.*;`) hide targets from an import scan; reflection and bean-name strings (including `@PreAuthorize("hasAuthority('X')")`) are invisible to both; ArchUnit sees annotations, which is how edge 6 was found. The wildcard blind spot is why §5 adds a source-level hygiene test.
- Sixteen files currently use an own-package wildcard import; they are listed in `SourceHygieneTests.KNOWN_WILDCARD_IMPORT_FILES` **[VERIFIED]** (the earlier plan's count of seven was incomplete).

---

## 4. Tasks 2 & 4 — Separation and explicit module dependency rules

### 4.1 Proposed shared infrastructure ("platform")

| Shared concern | Classes (current path) | Why shared |
|---|---|---|
| Identity & security | `entity/User`, `entity/UserRole`, `repository/UserRepository`, `security/*` (JWT, filters, handlers, rate limit, `Permission`, `RolePermissions`), `config/SecurityConfig`, `config/StompJwtInterceptor` | used from config, controller, security and service layers |
| Errors | `exception/*` | leaf, 100+ references from controllers and services |
| Audit context & auth audit | `util/AuditContext`, `security/SecurityAuditLogger` | request-scoped actor/IP, needed everywhere |
| File storage & attachments | `service/FileStorageService`, `service/AttachmentStorageService`, `service/AttachmentStorageLedgerListener`, `entity/AttachmentStorageUsage` + repository, `config/{UploadStorageConfig, UploadSizeGateFilter, AttachmentStorageReconciliationJob}`, `util/UploadStreams` | every module that stores a file |
| Notifications | `entity/Notification`, `repository/NotificationRepository`, `service/NotificationService`, `controller/NotificationController`, `config/NotificationScheduler` | injected by several modules |
| Technical config | `config/{SpringContext, WebSocketConfig, ApiRequestLoggingFilter, ProcessingJobAsyncConfig, ErpMetrics, ProcessingJobRecoveryJob}`, `cad/` engine abstraction | runtime plumbing, no business rule |
| Cross-cutting persistence base | `AbstractAuditableEntity` / audit annotations used by all entities | schema-wide |

### 4.2 Proposed module ownership (business)

`sales` (the whole document chain as **one** module), `purchase`, `production`, `marketing`, `crm` (`Customer`, `Contact`, `Lead`, `FollowUp`, `PlantContact`), `engineering`/`technical-verification` (`Cpr*`, `PrReference*`, technical verification), `accounts` (`CostWorkout`, `ProfitWorkout`, `ExchangeRate`), `documents` (document repository/versions/visibility), `administration` (masters: `MasterValue`, `Location*`, settings, users admin), `cad` (worker + engine). These are the names the test packages and the frontend already use **[VERIFIED]**.

### 4.3 Rules — allowed directions

1. Every module may depend on **platform** (§4.1). Platform depends on **no** business module.
2. `exception` and `util` are leaves: no dependency on `service`, `repository` or `controller`.
3. Repositories and entities never depend on services or controllers (the eight attachment listeners are the sole, frozen exception).
4. Controllers do not talk to repositories directly — only through services.
5. `purchase`, `production`, `marketing` do not depend on `sales` or `crm`, except through the ports below.
6. The CAD worker package does not depend on the ERP web/business/security/dto layers.

### 4.4 Rules — the exceptions that exist today (frozen, not approved)

| Boundary | Frozen violators | Target state |
|---|---|---|
| Controllers → repositories | 7 controllers (§3.2 edge 5) | route through the owning service |
| Entities → services | 8 attachment entities | inject the ledger via a JPA `@PrePersist`-free event or a shared port |
| Production services → flat `entity`/`repository` | 5 classes | a `ProductionReadModel` / lookup port |
| Outside → production persistence | 5 classes | dashboard/PDF/purchase-audit/CAD read through a production read façade |
| Marketing → CRM/sales | 2 services | `CustomerLookupPort` + a shared attachment port |

### 4.5 Ports to introduce (later phase — **[PROPOSED]**)

`SalesOrderLookupPort` (id + `soNo` only), `CustomerLookupPort`, `ProductionReadModel`, `MasterUsageProvider` (for the delete-time "is this master in use" checks), `SharedAttachmentPort`, `NotificationPort`. All are *interfaces inside the consuming module or the shared module*, implemented by a thin adapter that delegates to the existing repository — so transactions and query behaviour are preserved. This is deliberately **not** done in this phase, with one exception that has since been built: `PurchaseRequisitionIngressPort` (CPR → Purchase) was introduced in §13 and is the first of these ports to exist; the rest remain **[PROPOSED]**.

---

## 5. Task 5 — Configuration and component-scanning surface that a package move would break

Grepped across `src/main` **and** `src/test` **[VERIFIED]**:

| Location | Literal | Risk |
|---|---|---|
| `cadworker/CadWorkerConfiguration.java:34` | `scanBasePackages = {"com.vishatech.erp.cad", "com.vishatech.cadworker"}` | **High** — moving `cad` silently narrows the worker's scan; the worker then starts with no engine beans |
| `cadworker/CadWorkerConfiguration.java:39` | `@EntityScan(basePackages = "com.vishatech.erp.entity")` | **High** — the worker shares the ERP schema; a moved `entity` package breaks worker start-up |
| `cadworker/CadWorkerConfiguration.java:40` | `@EnableJpaRepositories(basePackages = "com.vishatech.erp.repository")` | **High** — same, for repositories |
| `ErpApplication.java` | implicit default scan root `com.vishatech.erp` (no `scanBasePackages`) | Medium — any class moved *outside* `com.vishatech.erp` stops being a bean |
| `src/main/resources/logback-spring.xml:82` | logger name `com.vishatech.erp.config.ApiRequestLoggingFilter` | Low — logging only |
| `src/main/resources/application.properties:324` | `logging.level.com.vishatech.erp=INFO` | Low |
| whole `src/` | **no** `@ComponentScan`, **no** `@ConfigurationProperties`, **no** `@ConfigurationPropertiesScan`, **no** `@Import` | Good news: only the four places above |
| `src/test/resources/application.properties` | shadows the main config; `context-path=/v1`; H2 `create-drop` | Medium — tests would still catch a break, since 78 test classes boot the real Spring context |

**Practical rule for later phases:** before moving any package, grep for its literal name in `*.java`, `*.properties`, `*.xml` and `src/test/**`, and run the worker-mode smoke tests. The three `CadWorkerConfiguration` literals are the highest-risk strings in the repository.

---

## 6. Tasks 6 & 7 — Architecture tests with ArchUnit

### 6.1 Compatibility check (done before writing anything) **[VERIFIED]**

| Question | Answer |
|---|---|
| Is ArchUnit compatible with this build? | Yes. Spring Boot parent-managed Java version, JUnit 5 already in use by all 78 test classes, Surefire already runs them. |
| Which artifact? | `com.tngtech.archunit:archunit-junit5:1.4.2`, **test scope**. |
| Does it resolve offline (CI without network)? | Yes — `./mvnw -B -o test` compiled and ran the tests from the local repository. |
| Does it change the shipped artifact or startup? | No. Test scope only; nothing is packaged into the bootable jar, and the suite does not start a Spring context (it analyses bytecode). API routes, auth, schema, deployment: untouched. |
| Does it break the CAD worker? | No — the suite does not load the worker; the worker's own tests are unaffected. |

### 6.2 What was added

| File | Contents | Purpose |
|---|---|---|
| `erp-backend/pom.xml` | `archunit-junit5:1.4.2`, `<scope>test</scope>` (with an inline comment) | the only production-file change in this phase; shipped artifact unchanged |
| `src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java` | **13 `@ArchTest` rules** | executable module boundaries, bytecode-level |
| `src/test/java/com/vishatech/erp/architecture/SourceHygieneTests.java` | **1 JUnit test** | source-level guard ArchUnit cannot see: own-package wildcard imports |

### 6.3 The 13 rules

**Enforced today (these already hold — a regression now fails the build):**

1. `entities_do_not_depend_on_repositories`
2. `repositories_do_not_depend_on_services_or_controllers`
3. `exception_layer_stays_leaf`
4. `security_does_not_depend_on_business_services`
5. `util_does_not_depend_on_services_or_controllers`
6. `cadworker_is_isolated_from_the_erp` — the worker must never reach `service`, `controller`, `security`, `config`, `dto` or `util`
7. `purchase_does_not_depend_on_other_business_modules` — Purchase is the most isolated module
8. `marketing_does_not_depend_on_other_business_modules` — Production, Packing, Accounts, CPR, Quotation, DeliveryChallan, ProformaInvoice, CreditNote, PaymentReceipt, Invoice, Purchase

**Frozen today (explicit allow-list; only *new* violators fail):**

9. `controllers_do_not_depend_on_repositories` — 7 allow-listed controllers
10. `entities_do_not_depend_on_services` — the 8 attachment listeners
11. `production_services_do_not_depend_on_flat_persistence` — 6 allow-listed classes. The sixth, `service.production.ProductionDashboardReadAdapter` (dashboard modular refactor, phase D4; reviewed again in phase D7), is a production-owned class reading production persistence: it counts the `quality_inspections` table, which still lives in the flat `com.vishatech.erp.repository` package. The adapter inherits the pre-existing naming inconsistency this rule already freezes for the services above, instead of the dashboard reaching across the boundary itself. Measured review: evaluating the rule without allow-lists reports 223 edges across these six classes, of which the adapter contributes exactly three, all on `repository.QualityInspectionRepository` (constructor parameter, field, and the `qualityTotal() → count()` call). The smallest safe follow-up is moving `QualityInspectionRepository` (and `QualityInspectionService`) beside its siblings in `repository.production` — a production-module change outside the dashboard refactor; reading the total from `QualityInspectionService.stats(null)` instead would cost six statements per `/sales/dashboard` request rather than one, so it was rejected.
12. `outside_does_not_depend_on_production_persistence` — 5 allow-listed classes
13. `marketing_does_not_depend_on_crm_or_sales` — 2 allow-listed services

**Frozen-rule mechanics:** the allow-list holds **source classes** (the classes that violate the boundary), because the rule's `notIn(...)` predicate filters `.that()`. Removing an entry is always safe; adding one is an architectural decision and must be justified in this document. An explicit allow-list was chosen over ArchUnit's `FreezingArchRule` so that **no violation-store file has to be generated or committed** and the frozen set is reviewable in code review.

### 6.4 Results **[VERIFIED]**

```
./mvnw -B -o test -Dtest=ModuleBoundaryTests,SourceHygieneTests -DfailIfNoSpecifiedTests=false
Tests run: 1,  Failures: 0, Errors: 0, Skipped: 0  -- SourceHygieneTests
Tests run: 13, Failures: 0, Errors: 0, Skipped: 0  -- ModuleBoundaryTests
Tests run: 14, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS   (exit 0)
```

### 6.5 Proof the guard is not vacuous **[VERIFIED]**

Emptying the five allow-lists and re-running produced exactly the expected failures, with a **complete** (untruncated) violation listing — declared counts equal detail lines:

| Rule | Violations when unfrozen | Distinct offending source classes |
|---|---|---|
| `controllers_do_not_depend_on_repositories` | 45 | 7 |
| `entities_do_not_depend_on_services` | 8 | 8 |
| `production_services_do_not_depend_on_flat_persistence` | 220 | 5 |
| `outside_does_not_depend_on_production_persistence` | 77 | 5 |
| `marketing_does_not_depend_on_crm_or_sales` | 87 | 2 |

The allow-lists were then restored from those measured sets, and all 14 tests pass again. This demonstrates both that the rules detect real violations and that the recorded violator sets are the complete truth for commit `93a76c3`.

### 6.6 Maintenance note **[PROPOSED]**

When a frozen violation is fixed, remove its entry from the allow-list in the same commit. There is intentionally no test asserting that each entry still violates (it would need a second, unfrozen copy of every rule); stale entries are caught instead by code review and by the violation counts tabulated in §6.5, which are the recorded baseline for this commit.

---

## 7. Task 8 — Nothing was moved, and why

No class was moved or renamed in this phase **[VERIFIED — see §11 diff]**:

- The boundaries that matter are already **narrow** (§3.2): Production needs two fields from Sales, Purchase needs two enums from Production, Marketing needs CRM customer lookups. Moving a package changes none of that — it only relocates it.
- `CadWorkerConfiguration` hard-codes `erp.entity` and `erp.repository` (§5): a package move is a **runtime** hazard that the current tests catch only partially, whereas a guard catches regressions continuously.
- The 78 existing test classes boot the real Spring context on H2 with `ddl-auto=create-drop`. They protect behaviour — which is exactly why the *later* moves should be gated on them, but they cannot protect against the worker-mode scan strings.
- Introducing the rules first means every later move is **verified by a test that already exists** rather than by hope.

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Frozen allow-lists rot — a fix lands but the entry stays, so the rule keeps excusing a class that no longer violates | Low | remove entries when fixing; §6.5 holds the baseline counts |
| 2 | `CadWorkerConfiguration` scan literals break silently on a package move | **High** | grep gate in §5; run `CadWorkerSafetyTests` + a worker smoke start after any move |
| 3 | `Permission`/`RolePermissions` are referenced from `@PreAuthorize` **strings** — invisible to ArchUnit and to import scans | Medium | grep annotation strings before moving `security` |
| 4 | Wildcard imports hide cross-module targets | Medium | `SourceHygieneTests` freezes the existing 16 and fails on a 17th |
| 5 | The 220-edge Production→flat-persistence set is large; a later port must not change JPA lazy-loading semantics | Medium | ports delegate to existing repositories; run the `performance/` and dashboard tests after any seam |
| 6 | `CPR ↔ CostWorkout` cycle (§3.3) blocks a clean split of those two | Medium | extract them together, or behind a port |
| 7 | `MarketingVisitService` / `MarketingMapService` write CRM customers | Medium | `CustomerLookupPort` before marketing moves |
| 8 | ArchUnit analyses bytecode: classes not compiled by the current module are not checked | Low | the suite runs inside `./mvnw test`, which always compiles first |
| 9 | Master-data "in-use" checks (`MasterValueService`, `LocationMasterService`) fan into 12–13 repositories; they will be the hardest thing to relocate | Medium | leave in place; introduce `MasterUsageProvider` in a later phase |
| 10 | `ddl-auto=validate` against the live schema (the previously reported `contacts` question) is still unverified **[OPEN]** | Medium | unrelated to this phase; verify the live schema before any entity-package work |

---

## 9. Next steps

1. **Keep the guard green.** Every future boundary rule is a new `@ArchTest`; every fix shrinks an allow-list.
2. **Cheap layering wins first** (no module semantics involved): move the 7 controllers off repositories, and re-home `util/PurchaseNumbering` + `util/PurchaseTotals` into Purchase — both are protected by existing tests.
3. **Kill the wildcard imports** the hygiene test froze (16 files), so the next set of rules can be written against explicit targets.
4. **Then** introduce the ports (§4.5) and only afterwards consider physical package moves, one module per commit, starting with the safest: `exception` → `util` → `purchase` → `documents` → `production`.
5. **Never** move `entity`/`repository`/`cad` without first re-checking the three `CadWorkerConfiguration` literal strings and running a worker smoke test.

---

## 10. Files modified in this phase

| File | Change |
|---|---|
| `erp-backend/pom.xml` | **modified** — added `com.tngtech.archunit:archunit-junit5:1.4.2` with `<scope>test</scope>` and an explanatory comment. No other dependency, plugin, property or packaging change. |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java` | **added** — 13 ArchUnit rules (8 enforced, 5 frozen with explicit allow-lists) |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/SourceHygieneTests.java` | **added** — 1 JUnit test freezing the 16 existing own-package wildcard imports |
| `MODULAR_MONOLITH_FOUNDATION.md` | **added** — this document |

**Not touched:** every file under `src/main` (no Java, resource, `application.properties` or `logback-spring.xml` change), `src/test` outside the two new files, the React app under `src/`, `pom.xml` beyond the one test dependency, any SQL/schema, any deployment script, and `MODULAR_MONOLITH_MIGRATION_PLAN.md` / `ERP_ARCHITECTURE_CLASSIFICATION.md`. No file was deleted or renamed.

## 11. Test results

| Command | Result |
|---|---|
| `./mvnw -B -o test -Dtest=ModuleBoundaryTests,SourceHygieneTests -DfailIfNoSpecifiedTests=false` | **PASS** — exit 0, `Tests run: 14, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS |
| Same command with the 5 allow-lists emptied (temporary experiment, reverted) | **FAIL as intended** — 45 / 8 / 220 / 77 / 87 violations, proving each frozen rule detects its boundary |
| `./mvnw -B -o verify` (full suite after the change) | **PASS** — exit 0, `BUILD SUCCESS`, `Tests run: 490, Failures: 0, Errors: 0, Skipped: 0`, total time 5:52 min. Baseline before this phase was 476 tests, so all 14 new tests run and nothing regressed. |

**Not run / could not run:** the live `erp_db` schema (`ddl-auto=validate`) was not inspected — no MySQL client is available in this environment; the CAD worker was not started against a real engine.

---

## 12. Purchase audit hardening — guard, transaction and audit ownership (P0–P2)

Follow-up to the read-only Purchase audit. Three phases, executed in order, each verified on its own before the next started. Nothing here changes an API route, a response contract, the schema, the persisted audit representation, or frontend behaviour.

### 12.1 P0 — closing the two guard gaps **[VERIFIED]**

The Purchase isolation guard is `purchase_does_not_depend_on_other_business_modules`, whose only target vocabulary is `BUSINESS_MODULE_PREFIXES`. The audit measured that this list was incomplete, i.e. Purchase could have imported real business types without failing anything. Added, each inspected first:

| Prefixes added | What they really are (evidence) |
|---|---|
| `Dispatch`, `Drawing`, `Model` | Packaged production workflows (`entity.production.*`, `service.production.*`, `dto.production.*`). The production *package* rules already covered them; this name-based list did not name them. |
| `TechnicalVerification` | Production's TV classes **plus** CPR's flat `entity.TechnicalVerificationStatus`, referenced only by `CprService`/`CprTechnicalVerification*`. |
| `QualityInspection` | A genuine blind spot: flat `entity.QualityInspection`, `service.QualityInspectionService`, `repository.QualityInspectionRepository`. |
| `Product` | The `products` master-data module (`entity.Product`, `repository.ProductRepository`, `controller.ProductController`; only `DataSeeder` else). Purchase stores product *names* as strings, so a future catalog read must be a deliberate port. |
| `QuestionnaireForm`, `QForm` | Marketing's form sub-module (`QuestionnaireForm*`, `QFormAttachment*`); every consumer today is a `Marketing*` class. |

**Deliberately not added, with reasons:** `Audit*` (shared infrastructure — see §12.3; listing it would forbid the legal shared dependency), `ShopFloor` and `Maintenance` (no such classes exist in this codebase, so no prefix was invented), and `Document*`/`Attachment*`/`Notification`/`User*`/`Settings*`/`MasterValue`/`Location*`/`Plant*`/`City`/`StateRegion`/`Country`/`District`/`Activity`/`Note`/`HistoryEntry`/`TimelineEntry`/`ProcessingJob*`/`GridConfig*`/`EditHistory*`/`RecordRevision*`/`AppSetting` (shared platform, master data and audit-trail child rows used across modules).

**New rule `cpr_does_not_depend_on_purchase_internals`** — frozen, one entry. CPR writes into Purchase (a verified CPR item becomes a Purchase Requisition) and nothing guarded that direction: the Purchase rule only covers Purchase as the *source*, and the CPR classes live in the flat `service`/`entity`/`controller` packages, so no package rule reaches them either. The predicate targets Purchase-prefixed project classes only and exempts a Purchase-owned ingress port (`Purchase*Port`) — the declared target of the migration that will retire the entry.

**Non-vacuity, measured with a temporary reflection probe (created, run, deleted — no rule or allow-list was modified or weakened):**

- 976 project classes are imported by the suite; 85 classes are in the Purchase rule's source scope.
- The unfrozen CPR rule reports **11 violations, all in `CprTechnicalVerificationService`** — the constructor parameter and field of `PurchaseRequisitionService`, its `create(...)` call, the nested `PurchaseRequisitionRequestWrapper` constructor/return type and the `PurchaseDtos` usages. Frozen, it reports 0. The violation set is exactly the documented coupling.
- Every added prefix matches at least one real class (e.g. `QualityInspection` → controller/entity/repository/service; `TechnicalVerification` → 12 classes including the flat status enum).
- Shared types are provably *not* treated as business modules: `AuditModule`, `AuditAction`, `AuditPort`, `AuditLog`, `Notification`, `User`, `UserRole`, `Document`, `Attachment`, `MasterValue`, `Settings`, `Location` all fail the prefix test.
- The `Purchase*Port` allowance currently matches nothing (no ingress port exists yet), so the rule's scope today is exactly "all `Purchase*` classes".

**Result:** `ModuleBoundaryTests` 17/17 pass (16 before P0), `SourceHygieneTests` 1/1, BUILD SUCCESS.

### 12.2 P1 — the audit write can no longer roll back a Purchase transaction **[VERIFIED]**

**Before.** `PurchaseSupportService.audit()` called the production `AuditService` from inside `log()` — i.e. inside the Purchase business transaction (`@Transactional(REQUIRED)` on both sides) — and swallowed exceptions in a `try/catch` under a Javadoc claiming *"a central-audit hiccup must never roll back a committed business transaction"*. The claim was wrong: a persistence failure inside a `REQUIRED` audit call marks the shared transaction **rollback-only**, and catching the exception does not undo that. Measured, not theorised (see the probe below): the requisition API answered **HTTP 500** and the business row was rolled back.

**After.** Two independent changes, both in the Purchase module:

1. `PurchaseCentralAuditWriter` (new bean) performs the mirror in **its own transaction** (`@Transactional(propagation = REQUIRES_NEW)`). Because it is a separate Spring bean, the propagation is applied by the transaction proxy; the business transaction is suspended while the audit insert runs, so an audit failure can only roll back the audit transaction. The class documents this explicitly so the annotation cannot be silently "optimised" into `this.write(...)`.
2. `PurchaseSupportService` invokes the mirror from a `TransactionSynchronization.afterCommit()` callback, so the audit row is written **only after** the business transaction committed. That keeps the audit trail honest — no audit row can exist for a rolled-back operation — while still being isolated from it. The best-effort policy is unchanged in intent but now explicit: failures are caught and **logged** (`java.util.logging`, WARNING) instead of silently ignored.

**What is guaranteed / not guaranteed (documented in code, not claimed):** guaranteed — an audit-mirror failure never rolls back and never silently fails a Purchase business operation; not guaranteed — the mirror always lands. It is a best-effort mirror of `purchase_timelines`, which remains the authoritative Purchase trail; a mirror that fails after commit leaves no audit row (and logs it). Trade-off accepted: one extra short transaction (and one pooled connection for its duration) per timeline entry, and the mirror is no longer atomic with the business write — it never was, since the old code already swallowed audit failures.

**Tests added** (`src/test/java/com/vishatech/erp/purchase/`):

| Test | What it proves |
|---|---|
| `PurchaseAuditWriteTests.timelineEntryAndCentralAuditRowAreStillBothWritten` | one timeline entry still yields exactly one audit row, with module/entity/display-id/action/actor/JSON values unchanged and no IP/request-id (the persisted representation is preserved) |
| `PurchaseAuditWriteTests.timelineActionVocabularyIsUnchanged` | all 13 timeline-action → `AuditAction` mappings still resolve as before |
| `PurchaseAuditFailureIsolationTests.theInjectedAuditFailureIsReal` | the injected failure is genuine: the writer throws `DataAccessException` and leaves no row |
| `PurchaseAuditFailureIsolationTests.aFailedCentralAuditInsertDoesNotRollBackThePurchaseOperation` | with every audit insert failing, `POST /api/purchase/requisitions` still returns 2xx, the requisition row and its timeline entry are committed, and the audit row is genuinely absent |

The failure is injected as a **real database failure**: the primary `AuditPort` delegates to the real implementation with an over-length `entity_type`, so the database rejects it (`audit_logs.entity_type` is `VARCHAR(100)`); the test log shows H2's `Value too long for column "entity_type CHARACTER VARYING(100)"`.

**Discrimination check (temporary probe, reverted):** restoring the old semantics (synchronous call, `Propagation.REQUIRED`) made `aFailedCentralAuditInsertDoesNotRollBackThePurchaseOperation` fail with exactly the old defect — `[API] POST /api/purchase/requisitions -> 500` and "Range for response status value 500 expected:<SUCCESSFUL> but was:<SERVER_ERROR>". Both files were then restored and verified **md5-identical** to their pre-probe content, and the suite re-run green.

**Result:** 21/21 focused Purchase tests pass (4 new + 17 pre-existing Purchase audit/work-queue tests), BUILD SUCCESS.

### 12.3 P2 — shared audit ownership **[VERIFIED]**

**Design (smallest safe boundary).** A new neutral package `com.vishatech.erp.audit` owns the *shared* half of the audit subsystem:

| Type | Role |
|---|---|
| `AuditPort` | the write contract; the seam every module may depend on |
| `AuditRecord` | the deliberately named request contract (12 components, nulls where the table allows them) |
| `AuditModule`, `AuditAction` | the audit vocabulary, **moved** from `entity.production` — enum constants and display names byte-identical, so the persisted representation (`@Enumerated(EnumType.STRING)`) is unchanged |

The *implementation* stays where it is on purpose: `service.production.AuditService` now `implements AuditPort` and gains a one-line `record(AuditRecord)` adapter that delegates to its existing creation method; `AuditLog`, `AuditLogRepository`, the `/audit` read API, its DTOs and `OrderMapper` are untouched. Moving the implementation would drag the read API, its mapper and its DTOs along for no additional boundary benefit — the dependency that mattered was the compile-time one, and it is gone.

**Transaction policy is unchanged in the adapter:** `AuditService` remains `@Transactional`/`REQUIRED`, so production callers keep today's semantics, and the P1 isolation stays where it belongs — in the Purchase caller.

**New rule `shared_audit_contract_stays_neutral`** (enforced, no allow-list): nothing in `com.vishatech.erp.audit..` may depend on `service`, `controller`, `repository`, `entity`, `dto`, `dashboard` or `crm` packages. The implementation may (and does) depend on the contract; the reverse is now impossible.

**Obsolete exception removed.** `PurchaseSupportService` was deleted from `OUTSIDE_TO_PRODUCTION_PERSISTENCE_ALLOWLIST` — the dependency it excused no longer exists. Verified rather than asserted: with the entry gone the rule passes, and a **temporary probe** (adding a production-persistence field to `PurchaseCentralAuditWriter`) made the same rule fail naming that class, proving the entry was obsolete rather than the rule being blind. The probe was reverted and the file verified md5-identical. The remaining two entries (`PdfGenerationService`, `CadConversionJobService`) are unrelated to the audit work and stay.

**Dependency result:** `grep` over all `Purchase*` classes shows **no import of any production package** (`entity.production.`, `repository.production.`, `service.production.`, `dto.production.`, `util.production.`, `config.production.`); the only audit types they import are `com.vishatech.erp.audit.{AuditAction,AuditModule,AuditPort,AuditRecord}` (in `PurchaseCentralAuditWriter` only).

**Tests added:** `SharedAuditContractTests` — writing the same entry through the port and through the implementation's own API persists field-for-field identical rows (including enum names `PRODUCTION`/`VERIFY`), and rows written through the port are returned by the existing `getEntityHistory` read path with the unchanged display-name vocabulary used by its filters.

**Result:** `ModuleBoundaryTests` 18/18 pass (rule count 16 → 18), `SharedAuditContractTests` 2/2, BUILD SUCCESS.

### 12.4 Files added / modified / removed in §12

| File | Change |
|---|---|
| `erp-backend/src/main/java/com/vishatech/erp/audit/AuditModule.java` | **added** (moved from `entity/production`, same constants) |
| `erp-backend/src/main/java/com/vishatech/erp/audit/AuditAction.java` | **added** (moved from `entity/production`, same constants) |
| `erp-backend/src/main/java/com/vishatech/erp/audit/AuditPort.java` | **added** — shared write contract |
| `erp-backend/src/main/java/com/vishatech/erp/audit/AuditRecord.java` | **added** — request contract |
| `erp-backend/src/main/java/com/vishatech/erp/entity/production/AuditModule.java` | **removed** (moved) |
| `erp-backend/src/main/java/com/vishatech/erp/entity/production/AuditAction.java` | **removed** (moved) |
| `erp-backend/src/main/java/com/vishatech/erp/service/PurchaseCentralAuditWriter.java` | **added** — own-transaction, port-based mirror |
| `erp-backend/src/main/java/com/vishatech/erp/service/PurchaseSupportService.java` | **modified** — after-commit mirror, logged best-effort failure, no production or audit-service imports |
| `erp-backend/src/main/java/com/vishatech/erp/service/production/AuditService.java` | **modified** — `implements AuditPort` + `record(AuditRecord)` adapter + javadoc; no behaviour change |
| `erp-backend/src/main/java/com/vishatech/erp/entity/production/AuditLog.java` | **modified** — imports the relocated enums |
| `erp-backend/src/main/java/com/vishatech/erp/repository/production/AuditLogRepository.java` | **modified** — imports the relocated enums |
| `erp-backend/src/main/java/com/vishatech/erp/service/production/IntegrationService.java` | **modified** — imports the relocated `AuditModule` (wildcard import no longer covered it) |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java` | **modified** — extended prefix list, new CPR rule + frozen entry, new audit-neutrality rule, Purchase entry removed from the production-persistence allow-list, javadoc |
| `erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseAuditWriteTests.java` | **added** — 2 tests (normal mirror) |
| `erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseAuditFailureIsolationTests.java` | **added** — 2 tests (failure isolation) |
| `erp-backend/src/test/java/com/vishatech/erp/audit/SharedAuditContractTests.java` | **added** — 2 tests (write parity + read path) |
| `erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseDocumentAuditIntegrationTests.java` | **modified** — imports the relocated enums only |
| `MODULAR_MONOLITH_FOUNDATION.md` | **modified** — §2.4 ownership, this section |

**Not touched:** the React app under `src/`, any REST route or response contract, any `application*.properties`, `pom.xml`, any SQL/schema script, entity mappings, `entity.production.AuditLog`'s table/columns/indexes, the `/audit` read API, and every unrelated dirty/staged/untracked file already present in the worktree.

### 12.5 Remaining allow-list exceptions after §12

| Rule | Entries | Why they remain |
|---|---|---|
| `controllers_do_not_depend_on_repositories` | 6 | Unrelated to Purchase/audit; each is a documented master-data or file controller. |
| `entities_do_not_depend_on_services` | 8 | The deliberate `AttachmentStorageLedgerListener` mechanism, unchanged. |
| `production_services_do_not_depend_on_flat_persistence` | 6 | Production persistence naming, unchanged by §12. |
| `outside_does_not_depend_on_production_persistence` | **2** (was 3 — the Purchase entry was removed because the dependency is gone) | PDF rendering and the CAD job service. |
| `marketing_does_not_depend_on_crm_or_sales` | 2 | Unchanged. |
| `outside_does_not_depend_on_crm_internals` | 15 | Unchanged. |
| `crm_does_not_depend_on_the_sales_document_chain` | 1 | Unchanged. |
| **`cpr_does_not_depend_on_purchase_internals`** | **1** (new) | `CprTechnicalVerificationService` — the real, still-unmigrated CPR → Purchase write. Retire it when the conversion moves to a `Purchase*Port`. |

### 12.6 Final verification of §12

| Command | Result |
|---|---|
| `./mvnw -B -o test -Dtest=ModuleBoundaryTests,SourceHygieneTests,PurchaseAuditFailureIsolationTests,SharedAuditContractTests,PurchaseAuditWriteTests,PurchaseDocumentAuditIntegrationTests -DfailIfNoSpecifiedTests=false` | **PASS** — exit 0, `Tests run: 31, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS (`ModuleBoundaryTests` 18, `PurchaseDocumentAuditIntegrationTests` 6, `SharedAuditContractTests` 2, `PurchaseAuditFailureIsolationTests` 2, `PurchaseAuditWriteTests` 2, `SourceHygieneTests` 1) |
| `./mvnw -B -o verify` (full backend suite, final state) | **PASS** — exit 0, `Tests run: 539, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS, 5:36 min. The 531-test run earlier in this phase predates the two new test classes and the 17th/18th architecture rule; 539 = 531 + `ModuleBoundaryTests` 16→18 + the three §12 test classes. `com.vishatech.erp.purchase.*` is fully green (work-queue 11 + technical-review 11 + receiving paging 12 + document audit 6 + audit write 2 + failure isolation 2). |
| Enum-compatibility check | `AuditModule`/`AuditAction` constants **and** display names are byte-identical to the `HEAD` originals (`diff` of the extracted constant and string-literal lists), so `@Enumerated(EnumType.STRING)` rows keep their stored names. |
| Dependency check | `grep` for `import com.vishatech.erp.{entity,repository,service,dto,util,config}.production` over all `Purchase*` files matches **main sources not at all**; the only matches are three Purchase *test* classes that read `AuditLog`/`AuditLogRepository`/`AuditService` to assert persisted rows (tests are outside the architecture rules' scope). Main-source Purchase imports of shared audit types are `com.vishatech.erp.audit.{AuditAction,AuditModule,AuditPort,AuditRecord}` in `PurchaseCentralAuditWriter` only. |

**Frontend:** no file under `src/` was touched in §12, so no frontend build/test was run — the React/Vite behaviour and every REST contract are unchanged by construction (no controller, route, DTO or mapper was edited).

**Worktree safety (reconciled, not assumed):** the task-end `git status --short` contains **147** entries = the **134** pre-existing entries measured before any edit (2 ` D`, 48 ` M`, 34 `??`, 1 `A `, 1 `D `, 1 `R `, 47 `RM`) plus exactly this task's deltas: **+2 ` D`** (the two moved enums), **+6 ` M`** (`PurchaseSupportService`, `AuditService`, `AuditLog`, `AuditLogRepository`, `IntegrationService`, `PurchaseDocumentAuditIntegrationTests` — all verified clean *before* the first edit) and **+5 `??`** (`audit/` package, `PurchaseCentralAuditWriter`, `PurchaseAuditWriteTests`, `PurchaseAuditFailureIsolationTests`, `audit/` test package). Nothing pre-existing was reverted, overwritten, deleted or staged by this task; no `target/`, surefire or log artifact entered the index or the untracked set. Both temporary probes were reverted and verified md5-identical, and a `grep` for probe artifacts returns nothing. **Note for reviewers:** `ModuleBoundaryTests.java` (and `SourceHygieneTests.java`) already was — and still is — an *untracked* file from the foundation phase, so this task's rule additions to it appear in neither `git diff` nor `git diff --cached`; the file path is reported under the untracked `architecture/` directory entry and the rule inventory is documented in §12.1/§12.3.

---

## 13. CPR → Purchase ingress boundary (P3)

Follow-up to the Purchase audit work of §12: the **last** CPR → Purchase dependency — the one frozen as a single-class exception there — is eliminated behind a Purchase-owned ingress port. Nothing here changes an API path, an HTTP method, an authority, a response contract, the schema, the persisted requisition or frontend behaviour.

### 13.1 What the coupling was **[VERIFIED]**

`CprTechnicalVerificationService.convertItemToPurchaseRequisition(...)` — the item-level "convert verified item to Purchase Requisition" action behind `POST /cpr-technical-verifications/{id}/convert-to-purchase-requisition` (`CPR_CREATE`) — injected `service.PurchaseRequisitionService` and assembled Purchase's internal payload itself: `PurchaseRequisitionService.PurchaseRequisitionRequestWrapper` (28 positional fields) and `dto.PurchaseDtos.PurchaseItemRequest` (12 positional fields). Measured before the change: 11 bytecode dependencies in that one class, every one of them against a Purchase internal, and nothing except the frozen exception covered them.

The flow is unchanged in shape: CPR reads the real CPR header + the exact item the row covers, resolves the client's currency and the defaults, and builds the request → Purchase validates, allocates the PR number, persists the requisition and writes its own timeline entry → CPR records the requisition id and PR number on the verification row → one transaction commits or rolls back → the same `TechnicalVerificationConversionResponse` goes back to the frontend.

### 13.2 The port and its contract **[VERIFIED]**

New Purchase-owned package `com.vishatech.erp.purchase/api` (the module's published ingress surface, mirroring the existing `cpr/api`, `crm/api` and `sales/api` packages):

| Type | Role |
|---|---|
| `PurchaseRequisitionIngressPort` | the capability: `PurchaseRequisitionIngressResult createRequisition(PurchaseRequisitionIngressRequest)` |
| `PurchaseRequisitionIngressRequest` (+ nested `Line`) | 13 named fields plus a list of 7-field lines — exactly the values a conversion legitimately supplies |
| `PurchaseRequisitionIngressResult` | `requisitionId` + `prNo`, and nothing else |

No entity and no `PurchaseDtos`: the contract carries plain values, and Purchase's own payload is assembled on the Purchase side.

**Adapter** — `service/PurchaseRequisitionIngressAdapter` (internal, deliberately *outside* the published package) maps the contract onto `PurchaseRequisitionRequestWrapper`/`PurchaseItemRequest` and delegates to `PurchaseRequisitionService.create(...)`: the very method the requisition REST API calls. Validation, PR-number allocation, totals, draft/approval status and the Purchase timeline entry are therefore untouched, and every field the contract does not publish (`prNo`, `status`, buyer/vendor, terms, GST/incoterm/transport/warehouse/cost-center/location/branch, money, and per-line rate/discount/GST/category/hsn) is passed as `null` exactly as the pre-port conversion passed it.

**Transactions** — the adapter is deliberately annotated with nothing: the delegated service is `@Transactional`/`REQUIRED`, so the requisition still joins CPR's transaction. No new boundary, no asynchronous work, no HTTP hop between modules; §13.5 proves it.

**Migration** — `CprTechnicalVerificationService` now injects the port and builds `PurchaseRequisitionIngressRequest`; neither `PurchaseRequisitionService` nor `PurchaseDtos` is referenced anywhere in CPR any more. CPR keeps its own eligibility and idempotency checks (an already-converted row opens the existing requisition) and its own value resolution (client currency, priority default, provenance text); Purchase keeps the requisition record and every rule about it.

### 13.3 Rule: the exception is gone **[VERIFIED]**

`cpr_does_not_depend_on_purchase_internals` is now enforced with **no** allow-list: `CPR_TO_PURCHASE_ALLOWLIST` and its whole mechanism were deleted. `purchaseModuleInternals()` gained one narrow, principled exemption — classes in the published ingress package (`PURCHASE_INGRESS_PACKAGE = com.vishatech.erp.purchase.api`) — alongside the existing `Purchase*Port` suffix exemption. The adapter, `PurchaseRequisitionService` and `PurchaseDtos` all remain internals.

Two explicit rules were added so the requirement is legible in the suite itself rather than only through the name-prefix predicate:

- `cpr_does_not_depend_on_the_purchase_requisition_service` — no `Cpr*` class may depend on that exact service;
- `cpr_does_not_depend_on_purchase_dtos` — nor on `PurchaseDtos` or any record nested inside it (the predicate walks the enclosing-class chain, so `PurchaseDtos$PurchaseItemRequest` is caught).

Rule count 18 → 20; all 20 pass.

### 13.4 Non-vacuity, measured **[VERIFIED]**

A temporary probe class `CprBoundaryProbe` (created, run, deleted — no rule was modified or weakened) depending on `PurchaseRequisitionService` and `PurchaseDtos.PurchaseItemRequest`:

- `cpr_does_not_depend_on_purchase_internals` → **4 violations**, all naming the probe (constructor parameters and fields);
- `cpr_does_not_depend_on_the_purchase_requisition_service` → **2 violations**;
- `cpr_does_not_depend_on_purchase_dtos` → **2 violations**, including the nested `PurchaseDtos$PurchaseItemRequest` — which is what proves the enclosing-class predicate really resolves nested DTO records.

The probe was deleted, its stale class file removed from `target/classes`, the following full build was `clean verify`, and no trace of it exists in `git status`, `find` or the compiled output.

Permanent counterpart — `architecture/PurchaseIngressBoundaryTests` (3 tests): the rule's source scope is real (and contains `CprTechnicalVerificationService`), the published ingress package exists and is genuinely exempt from the internals predicate, and that predicate still classifies 20+ real internals including the requisition service, the DTO container and the adapter. This is the guard that fails if the exemption is ever widened or a prefix drifts.

### 13.5 Tests

| Test | What it proves | Result |
|---|---|---|
| `PurchaseRequisitionIngressAdapterTests` (5) | delegation to the existing creation logic; the id and PR number come from the created record; every published field lands on the same internal field the pre-port conversion set; Purchase keeps ownership of everything the contract does not publish; an existing validation failure propagates with Purchase's own message | **5/5 pass** |
| `CprPurchaseRequisitionConversionIntegrationTests` (4) | end to end over the REST API on H2 — exactly one requisition created (row count + `findByPrNo` returns the number the caller was told), the CPR row linked (`purchaseRequisitionId`, `purchaseRequisitionPrNo`, `forwardedToPrAt`/`By`, status), the response fields unchanged, a repeat call idempotent and creating nothing, a **real** Purchase validation failure (required date before request date) leaving the row unforwarded, and the endpoint still 401 without a token | **4/4 pass** |
| `CprPurchaseRequisitionRollbackTests` (1) | atomicity: the injected port delegates to the **real** adapter (so a real requisition row is inserted inside the caller's transaction) and then fails → that requisition is rolled back and the CPR row is untouched. Would fail if the port had introduced its own transaction | **1/1 pass** |

Migrated tests: `CprItemConversionTests` (5/5) now mocks the port and asserts the published contract instead of Purchase's wrapper; `CprTechnicalVerificationStatusTests` (6/6) builds the service with the port. Both files were already modified before this phase (pre-existing work) and were edited with targeted replacements only.

### 13.6 Pre-existing test brittleness found and fixed

Running the new CPR conversion tests *before* `PurchaseAuditFailureIsolationTests` (§12) made the latter fail; alone, it passed. Root cause, measured rather than guessed: `audit_logs` is excluded from Hibernate's schema filter for **create and drop** (`AuditSchemaFilterProvider`), so its rows survive across Spring contexts in the same JVM, while the business tables are recreated per context and their identity ids restart — a row for the same `("PR", <id>)` can therefore already exist from an earlier test class. The assertion "the mirror wrote no row for this document" is now expressed as "no **new** row for this document" (identified by pre-captured row ids); the global `purchaseAuditCount()` equality beside it is unchanged. Verified discriminating: the pair failed before the fix (`Expecting empty but was: [AuditLog@…]`, exit 1) and passes after (exit 0), and the test still passes alone and in the full suite.

### 13.7 Files added / modified in §13

| File | Change |
|---|---|
| `erp-backend/src/main/java/com/vishatech/erp/purchase/api/PurchaseRequisitionIngressPort.java` | **added** — ingress port |
| `erp-backend/src/main/java/com/vishatech/erp/purchase/api/PurchaseRequisitionIngressRequest.java` | **added** — published request contract (+ nested `Line`) |
| `erp-backend/src/main/java/com/vishatech/erp/purchase/api/PurchaseRequisitionIngressResult.java` | **added** — published result (id + PR number) |
| `erp-backend/src/main/java/com/vishatech/erp/service/PurchaseRequisitionIngressAdapter.java` | **added** — internal adapter delegating to `PurchaseRequisitionService.create` |
| `erp-backend/src/main/java/com/vishatech/erp/service/CprTechnicalVerificationService.java` | **modified** — injects the port, builds the contract instead of Purchase internals |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java` | **modified** — allow-list deleted, ingress-package exemption, 2 explicit rules, javadoc |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/PurchaseIngressBoundaryTests.java` | **added** — permanent non-vacuity guard (3 tests) |
| `erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseRequisitionIngressAdapterTests.java` | **added** — 5 adapter tests |
| `erp-backend/src/test/java/com/vishatech/erp/cpr/CprPurchaseRequisitionConversionIntegrationTests.java` | **added** — 4 end-to-end conversion tests |
| `erp-backend/src/test/java/com/vishatech/erp/cpr/CprPurchaseRequisitionRollbackTests.java` | **added** — 1 atomicity test |
| `erp-backend/src/test/java/com/vishatech/erp/service/CprItemConversionTests.java` | **modified** — port mock + contract assertions |
| `erp-backend/src/test/java/com/vishatech/erp/service/CprTechnicalVerificationStatusTests.java` | **modified** — port constructor |
| `erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseAuditFailureIsolationTests.java` | **modified** — order-independent "no new audit row" assertion (§13.6) |
| `MODULAR_MONOLITH_FOUNDATION.md` | **modified** — §2.4, §4.5, this section |

**Not touched:** the React app under `src/` (so no frontend build/test was needed), any REST route, HTTP method, authority or response contract, `application*.properties`, `pom.xml`, any SQL/schema script, entity mappings, the `audit_logs` table, the `/audit` read API, and every unrelated dirty/staged/untracked file already present in the worktree.

### 13.8 Verification of §13

| Command | Result |
|---|---|
| `./mvnw -B -o test -Dtest=<13 focused classes>` | **PASS** — exit 0, `Tests run: 62, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS (`ModuleBoundaryTests` 20, `PurchaseIngressBoundaryTests` 3, `SourceHygieneTests` 1, `CprItemConversionTests` 5, `CprTechnicalVerificationStatusTests` 6, `CprApiTest` 5, `CprPurchaseRequisitionConversionIntegrationTests` 4, `CprPurchaseRequisitionRollbackTests` 1, `PurchaseRequisitionIngressAdapterTests` 5, `PurchaseAuditWriteTests` 2, `PurchaseAuditFailureIsolationTests` 2, `PurchaseDocumentAuditIntegrationTests` 6, `SharedAuditContractTests` 2) |
| `./mvnw -B -o clean verify`, then `./mvnw -B -o verify` (full backend, final state) | **PASS on both runs** — `Tests run: 554, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS, 4:23 min and 4:17 min; the second run captured the shell exit status explicitly (**0**). 539 (§12) → 554 = 13 new tests + `ModuleBoundaryTests` 18 → 20; every Purchase, CPR, production, dashboard, security and performance suite green. |
| Probe runs | `ModuleBoundaryTests` failed with 4 / 2 / 2 violations naming the probe while it existed, and passed again after deletion |
| Dependency check | `grep` over all `Cpr*` main sources: no `PurchaseRequisitionService`, no `PurchaseDtos`, and no Purchase package import other than `com.vishatech.erp.purchase.api` (referenced only by `CprTechnicalVerificationService`) |

**Worktree safety (reconciled, not assumed):** the `git status --short` at the end of §13 holds **150** entries = the **147** measured before §13 (4 ` D`, 54 ` M`, 39 `??`, 1 `A `, 1 `D `, 1 `R `, 47 `RM`) plus exactly this phase's three new untracked entries (`purchase/api/` package directory, `PurchaseRequisitionIngressAdapter.java`, `PurchaseRequisitionIngressAdapterTests.java`). The new test files inside the already-untracked `test/…/cpr/` and `test/…/architecture/` directories add no entries of their own. The single tracked file this phase edited — `CprTechnicalVerificationService.java` — was **already** modified before this phase (pre-existing CRM import refactor, `repository.CustomerRepository` → `crm.repository.CustomerRepository`), and that pre-existing content is intact: `git diff` on it shows only the §13 port migration as this phase's change. No file was reverted, deleted, staged or overwritten, and no `target/`, surefire or probe artifact entered the index or the untracked set.

### 13.9 Remaining architecture exceptions after §13

| Rule | Entries | Change |
|---|---|---|
| `cpr_does_not_depend_on_purchase_internals` | **0** (was 1) | the exception was removed because the dependency is gone |
| `cpr_does_not_depend_on_the_purchase_requisition_service` | 0 (new rule) | — |
| `cpr_does_not_depend_on_purchase_dtos` | 0 (new rule) | — |
| All other frozen rules | unchanged | controllers→repositories 6, entities→services 8, production→flat persistence 6, outside→production persistence 2, marketing→CRM/sales 2, outside→CRM internals 15, CRM→sales chain 1 — *(as measured at §13; §14.9 has the current inventory: production→flat persistence is now 5 and outside→production persistence 4, after the P5–P7 migrations and the guard re-scoping)* |

No Production, CRM, Marketing or shared-audit exception was removed, added or otherwise touched by §13.

### 13.10 Risks and limitations

- **The port is a synchronous in-process call.** It preserves today's atomicity but does not by itself survive extracting Purchase into its own deployable: the adapter would then become the seam where an outbox or saga has to be introduced. Stated here, not solved.
- **The contract is a value contract, not a full requisition API.** It publishes only what a conversion supplies; a second consumer needing rates, GST or the approval workflow needs a deliberately wider contract — widening it now would re-leak Purchase's payload.
- **The ingress-package exemption is package-wide.** Anything placed in `com.vishatech.erp.purchase.api` becomes touchable by every module. `PurchaseIngressBoundaryTests` guards the exemption's *effect*, but the package should stay as small as it is today.
- **The reverse-pattern coupling is untouched and out of scope:** CPR still converts items to Cost Workouts through `CostWorkoutService` (a different module, the same direct-injection pattern). This phase covers the CPR → Purchase boundary only.
- Nothing here claims the ERP is fully modularized: §13 covers the CPR → Purchase ingress boundary, and the other §4.5 ports remain **[PROPOSED]**.
---

## 14. Production outbound boundaries — attachment port, CPO lookup port, tracker, guard hardening (P4–P7)

Follow-up to §12 (Purchase audit hardening) and §13 (CPR → Purchase ingress). P4 measured that **Production was the only business module with no outbound guard** and froze the three Production → Sales violations it found; P5, P6 and P7 migrated all three onto published Sales ports, deleted the freeze, and re-scoped the guards that had blind spots. Nothing here changes a REST path, an HTTP method, an authority, a response field, the schema, the stored rows or the frontend: the architecture stays `React SPA → one Spring Boot application → module-facing ports → shared MySQL`.

### 14.1 What the coupling was **[VERIFIED]**

Measured from bytecode, not from the brief:

| Production class | Sales internals it depended on | Which it used them for |
|---|---|---|
| `service.production.ProductionAttachmentService` | `entity.SalesAttachment`, `repository.SalesAttachmentRepository`, `dto.SalesAttachmentResponse` | **writing and deleting** rows in `sales_attachments` (the shared `moduleType`/`moduleId` pattern) |
| `service.production.ProductionOrderService` | `entity.SalesOrder`, `repository.SalesOrderRepository` | `resolveCpo(...)` — numeric CPO id or canonical SO number |
| `service.ProductionTrackerService` | `entity.SalesOrder`, `repository.SalesOrderRepository` | linking a tracker to a CPO |
| `controller.production.ProductionOrderController`, `DrawingController`, `ModelController` | `dto.SalesAttachmentResponse` | returning the attachment payload of three endpoints |

Those three services were frozen in `PRODUCTION_TO_SALES_INTERNALS_ALLOWLIST`, and `ProductionSalesBoundaryTests` proved the set was exactly the real offender set.

### 14.2 P5 — a neutral attachment port **[VERIFIED]**

| Type | Role |
|---|---|
| `sales.api.AttachmentStorePort` (**added**, Sales-owned published surface) | `list(moduleType, moduleId)`, `add(moduleType, moduleId, file)`, `delete(moduleType, moduleId, attachmentId)` |
| `AttachmentStorePort.AttachmentRef` (nested record) | `id`, `name`, `contentType`, `size`, `url`, `uploadedAt` — the neutral contract |
| `service.SalesAttachmentStoreAdapter` (**added**, Sales-internal) | mechanical delegation to `SalesAttachmentRepository` + `FileStorageService`; same entity fields, same `url` construction, same `ResourceNotFoundException`, same ordering |
| `service.production.ProductionAttachmentService` (**rewritten**) | delegates to the port; same three method names, same `@Transactional` annotations, same 404 semantics |
| `ProductionOrderController`, `DrawingController`, `ModelController` (**modified**) | return `AttachmentStorePort.AttachmentRef` instead of `SalesAttachmentResponse` |

**Behaviour preserved.** Attachment rows, ids, ordering and the file bytes are untouched; transactions keep `REQUIRED` semantics, so an upload made inside a caller's transaction still commits or rolls back with it — *measured* by `ProductionAttachmentAtomicityTests`, which fails if the adapter is given `REQUIRES_NEW` (the port introduces no boundary, no async work and no HTTP hop); the endpoint paths and authorities are unchanged. The one thing that is not transactional is the stored file itself, a pre-existing property of `FileStorageService` that the test documents instead of changing. The payload keeps its six components with identical names and types — `uploadedBy`, which the DTO carried only as a null, is simply not declared, and production configuration (`spring.jackson.default-property-inclusion=non_null`) never emitted it.

### 14.3 P6 — a Sales order lookup port **[VERIFIED]**

| Type | Role |
|---|---|
| `sales.api.SalesOrderLookupPort` (**added**) | `Optional<SalesOrderRef> findById(Long)`, `Optional<SalesOrderRef> findBySoNo(String)` |
| `SalesOrderLookupPort.SalesOrderRef` (nested record) | `id`, `soNo`, `clientName`, `clientId`, `orderDate` |
| `sales.api.SalesOrderLookupAdapter` (**added**, Sales-internal) | delegates to `SalesOrderRepository.findById` / `findBySoNo` |
| `service.production.ProductionOrderService` (**modified**) | injects the port; `resolveCpo(...)` returns `SalesOrderRef` |

`resolveCpo` semantics are unchanged, branch for branch: numeric id → `findById`; a non-numeric id → `findBySoNo(id)` (the legacy-client fallback that is why the request field is a `String`); no id → `findBySoNo(number)`; no match → `null`, so the order keeps whatever the client sent instead of failing. Auto-fill rules are unchanged: customer and customer code are filled from the CPO only when the client left them blank, and the stored reference is always the real primary key plus the canonical SO number.

### 14.4 P7 — the tracker, and one entity mapping **[VERIFIED]**

`ProductionTrackerService` now injects `SalesOrderLookupPort` and stores only the CPO id; `create(...)` resolves through the port (same 404 `ResourceNotFoundException` for an unknown id), and `autoCreateForCpo(...)` takes the published `SalesOrderRef` instead of a `SalesOrder`.

One structural change was required to make that real rather than cosmetic: `entity.ProductionTracker.salesOrder` was a `@ManyToOne SalesOrder`, which meant Production's own persistence layer still held a Sales entity, and nothing but a Sales entity instance can be assigned to such an association. The mapping is now the raw `Long salesOrderId` on **the same `sales_order_id` column**:

- the column, its type, its nullability, its constraint and every stored value are unchanged — no migration, no DDL. This was **measured against the live shared MySQL**, read-only, not inferred: `information_schema` reports `production_trackers.sales_order_id` as `bigint`, `IS_NULLABLE=YES`, `COLUMN_KEY=MUL` with the foreign key `FKbx8jmfkcsqv250xv0o0xywnku → sales_orders(id)` intact, and the table still holds its 2 rows (`SELECT COUNT(*)`). The test profile builds the schema from the mapping; runtime `ddl-auto=validate` is the startup net that would reject a mismatch;
- `@JsonIgnore` is kept, so the field is neither serialised nor bound: the tracker payload is byte-for-byte what it was (the association was already ignored in both directions, i.e. a request body could never link a CPO by JSON — a fact the new tests pin rather than assume);
- `ProductionTrackerRepository.findBySalesOrderId(Long)` resolves to the same column as before;
- what is *no longer possible* is a JPA association traversal from a Production entity to `sales_orders`; that is the point, and it is recorded here rather than discovered later.

### 14.5 Guard changes **[VERIFIED]**

| Rule | Before | After |
|---|---|---|
| `production_services_do_not_depend_on_sales_internals` | frozen, 3 entries | **enforced, 0** — the freeze was deleted after the last migration |
| `production_does_not_depend_on_other_business_module_internals` | absent | **enforced, 0** (new) |
| `production_services_do_not_depend_on_flat_persistence` | source `service..` + name prefix `Production*`; 6 entries | source `productionOwnedServices()` (package-based); **5 entries** |
| `outside_does_not_depend_on_production_persistence` | target `entity.production..`/`repository.production..`; source `service..`/`controller..`/`crm..`/`dashboard..`; 2 entries | target **plus the flat production persistence**; source **everything Production does not own**; 4 entries |

Details of each correction:

- **The name-prefix blind spot.** The flat-persistence rule's source was
  `resideInAPackage("com.vishatech.erp.service..").and().haveSimpleNameStartingWith("Production")`, which skipped `ModelService`, `DrawingService`, `DispatchService`, `PackingListService` and the rest of `service.production`. All three Production outbound rules now share one scope, `productionOwnedServices()` (the seven `*.production` packages plus the two production-owned flat services), so a production service cannot be outside the scope because of its name.
- **Sales detection widened.** `salesOwnedInternals()` classified only `Sales*`-named flat types, so `QuotationService`, `InvoiceRepository`, `PaymentReceiptResponse` … were invisible. The predicate now also classifies the sales document chains (derived from the same `SALES_CHAIN_PREFIXES` list CRM's rule uses, so the two cannot drift) and the flat `controller` package.
- **The `*Port` exemption is live and narrow.** It now lets through exactly the two published ports *and the contracts nested inside them* (`AttachmentRef`, `SalesOrderRef`) — a nested type is exempt by its outermost type's `Port` suffix. It deliberately does **not** exempt the adapters (`SalesOrderLookupAdapter`, `SalesAttachmentStoreAdapter`), Sales entities, repositories, DTOs or service implementations, so it cannot hide an implementation dependency. This was not cosmetic: without the nested-contract rule the ports' own request/response types would have been reported.
- **Outside → Production re-scoped.** Its target was blind to the flat `ProductionTracker`/`QualityInspection` persistence (yet `PdfGenerationService` reads the tracker table), and its source never looked at the `cad` package at all. Widening both surfaced exactly two additional genuine couplings, `cad.CadModelProjection` and `cad.ConversionProviderRegistry` (the CAD engine projects `entity.production.Model` and consults `ModelConversionStatus`) — recorded in the allow-list as follow-up work instead of remaining invisible.
- **Dead entries removed, one added with a reason.** `ProductionAttachmentService` and `ProductionOrderService` left the flat-persistence allow-list *because* their Sales dependency was migrated (their only flat-package edges were the Sales ones); the widened scope in turn revealed `QualityInspectionService`, a production-owned flat service reading its own flat persistence, which is now listed explicitly.
- **Deliberately not re-classified:** `entity.TechnicalVerificationStatus` (ownership shared with CPR, and no table), `audit.AuditPort`/`entity.ProcessingJobStatus` (javadoc mentions only — no class-file dependency), the shared `AppSetting` store, the shared dashboard contracts and the CAD engine are *not* business-module internals.

### 14.6 Non-vacuity, proved permanently **[VERIFIED]**

Deleting a freeze is only defensible if the rule still bites, so the proof is a *persistent* fixture rather than a temporary probe (no probe file was created and deleted in this phase; the two fixtures below stay, are test-scoped, carry no Spring annotation, are never instantiated, and are excluded from every whole-project ArchUnit import):

| Fixture / helper | Purpose |
|---|---|
| `service.production.SalesBoundaryProbe` (test-only) | re-introduces the exact frozen dependencies — Sales entity, repository, DTO, service implementation, a document-chain service — *and* injects the legal `AttachmentStorePort`; its name does not start with `Production`, so it also proves the package scope beats a name-prefix scope |
| `service.production.PublishedPortConsumerProbe` (test-only) | depends only on the published ports, their nested contracts and shared platform types |
| `architecture.BoundaryFindings` (test-only) | imports the real codebase once and reads the origin **and target** classes out of ArchUnit's own failure details, so expectations cannot drift from what the rules report |

What `ProductionSalesBoundaryTests` (7) + `ProductionBoundaryScopeTests` (8) assert:

- the rule reports `SalesBoundaryProbe` and **only** it, naming entity, repository, DTO and service targets, and never the port the probe also injects;
- `PublishedPortConsumerProbe` passes on its own;
- the real codebase has **zero** Production → Sales internals edges, and `ModuleBoundaryTests` carries no `PRODUCTION_TO_SALES_INTERNALS_ALLOWLIST` field at all (asserted by reflection, so re-introducing a freeze fails the suite);
- both remaining Production freezes are evaluated through the **same factory the shipped rule uses** with an empty allow-list, and the reported origins equal the frozen set exactly — non-vacuity, no hidden offender and no dead entry in one assertion per rule;
- scope and predicate classification is asserted class by class, including that production's own types, shared infrastructure, other modules' types and the two ports are classified correctly.

### 14.7 Tests

| Command | Result |
|---|---|
| `./mvnw -o test -Dtest='SalesOrderLookupAdapterTests,ProductionOrderCpoResolutionIntegrationTests,ProductionTrackerCpoLinkIntegrationTests'` | **PASS** — exit 0, `Tests run: 21, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test -Dtest='ModuleBoundaryTests,ProductionSalesBoundaryTests,ProductionBoundaryScopeTests,PurchaseIngressBoundaryTests,SourceHygieneTests'` | **PASS** — exit 0, `Tests run: 41, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test -Dtest='ProductionAttachmentContractIntegrationTests'` | **PASS** — exit 0, `Tests run: 2` |
| `./mvnw -o test -Dtest='ProductionAttachmentAtomicityTests'` | **PASS** — exit 0, `Tests run: 3`; with a temporary `REQUIRES_NEW` added to the adapter's `add(...)`, the same class **failed** (`Expecting empty but was: [SalesAttachment@…]`, exit 1) and passed again after the probe was reverted — the atomicity claim is measured, not asserted |
| `./mvnw -o test` (full backend, final state) | **PASS** — exit 0, `Tests run: 599, Failures: 0, Errors: 0, Skipped: 0`, BUILD SUCCESS (4:39 min, 98 test classes) |
| live schema check (read-only, `information_schema` on `erp_db`) | **PASS** — `production_trackers.sales_order_id` is `bigint`, nullable, `MUL`, FK `FKbx8jmfkcsqv250xv0o0xywnku → sales_orders(id)`, table still holds 2 rows; no DDL and no write was issued |

New tests added by this phase — **37** test executions against the 562 recorded at the start of the task (= 599 − 562): 34 methods in the six new test classes, +2 net methods in the rewritten Production → Sales guard (5 → 7), +1 new ArchUnit rule (which ArchUnit itself reports as a test):

| Class | Tests | What it pins |
|---|---|---|
| `sales.api.SalesOrderLookupAdapterTests` | 6 | the port's field-by-field contract, empty-on-miss, exact (un-normalised) matching, no database call for a null reference |
| `production.ProductionOrderCpoResolutionIntegrationTests` | 9 | CPO resolution over a real database: numeric id, legacy number-in-id-field, number field, unknown numeric, non-numeric fallback, customer auto-fill precedence, update re-resolution, and that the port resolves real rows in the running context |
| `production.ProductionTrackerCpoLinkIntegrationTests` | 6 | tracker linkage through the port (denormalisation, `sales_order_id` persisted, unknown id → 404, edit leaves the link alone, `autoCreateForCpo` idempotence) and that the request/response payload still can neither set nor expose the link |
| `production.ProductionAttachmentContractIntegrationTests` | 2 | the three attachment endpoints over real HTTP: payload keys and values on upload and list, module/record addressing, wrong-record delete → 404 with the row intact, real delete, second delete → 404, and 401 without a token |
| `production.ProductionAttachmentAtomicityTests` | 3 | the port adds **no** transaction boundary: an upload inside a caller's rolled-back transaction leaves no row (and is visible inside it), a committed upload persists and lists, and a rolled-back delete restores the row. The uploaded *bytes* are not transactional — a pre-existing property of `FileStorageService`, documented in the test rather than changed |
| `architecture.ProductionSalesBoundaryTests` | 7 (was 5) | scope, widened predicate, port/nested-contract exemption, probe detection, port-consumer cleanliness, clean real codebase, no freeze |
| `architecture.ProductionBoundaryScopeTests` | 8 (new) | the shared service scope, both freezes exactly equal to the real offenders, ownership/persistence/internals classification, and the new rule's cleanliness |
| `architecture.ModuleBoundaryTests` | 22 rules (was 21) | one new enforced rule |

Migration of pre-existing tests: `ModuleBoundaryTests`' Production rules were re-scoped in place; no test was deleted, skipped, weakened or given an allow-list entry to pass.

### 14.8 Files added / modified in §14

| File | Change |
|---|---|
| `erp-backend/src/main/java/com/vishatech/erp/sales/api/AttachmentStorePort.java` | **added** (P5) |
| `erp-backend/src/main/java/com/vishatech/erp/sales/api/SalesOrderLookupPort.java` | **added** (P6) |
| `erp-backend/src/main/java/com/vishatech/erp/sales/api/SalesOrderLookupAdapter.java` | **added** (P6) |
| `erp-backend/src/main/java/com/vishatech/erp/service/SalesAttachmentStoreAdapter.java` | **added** (P5) |
| `erp-backend/src/main/java/com/vishatech/erp/service/production/ProductionAttachmentService.java` | **modified** (P5) |
| `erp-backend/src/main/java/com/vishatech/erp/service/production/ProductionOrderService.java` | **modified** (P6) |
| `erp-backend/src/main/java/com/vishatech/erp/service/ProductionTrackerService.java` | **modified** (P7) |
| `erp-backend/src/main/java/com/vishatech/erp/entity/ProductionTracker.java` | **modified** (P7 — id mapping, same column) |
| `erp-backend/src/main/java/com/vishatech/erp/controller/production/{ProductionOrder,Drawing,Model}Controller.java` | **modified** (P5 — payload type) |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java` | **modified** — freeze deleted, scopes widened, new rule, allow-lists re-measured |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/ProductionSalesBoundaryTests.java` | **rewritten** — probe-based non-vacuity |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/ProductionBoundaryScopeTests.java` | **added** |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/BoundaryFindings.java` | **added** |
| `erp-backend/src/test/java/com/vishatech/erp/service/production/SalesBoundaryProbe.java` | **added** (test-only fixture) |
| `erp-backend/src/test/java/com/vishatech/erp/service/production/PublishedPortConsumerProbe.java` | **added** (test-only fixture) |
| `erp-backend/src/test/java/com/vishatech/erp/sales/api/SalesOrderLookupAdapterTests.java` | **added** |
| `erp-backend/src/test/java/com/vishatech/erp/production/ProductionOrderCpoResolutionIntegrationTests.java` | **added** |
| `erp-backend/src/test/java/com/vishatech/erp/production/ProductionTrackerCpoLinkIntegrationTests.java` | **added** |
| `erp-backend/src/test/java/com/vishatech/erp/production/ProductionAttachmentContractIntegrationTests.java` | **added** |
| `erp-backend/src/test/java/com/vishatech/erp/production/ProductionAttachmentAtomicityTests.java` | **added** |
| `MODULAR_MONOLITH_FOUNDATION.md` | **modified** — this section, §13.9 note |

**Not touched:** the React app under `src/` (so no frontend build was needed), any route, HTTP method, authority or response field, `application*.properties`, `pom.xml`, any SQL/schema script, entity tables other than the tracker's Java-side mapping, the other modules, and every unrelated dirty/staged/untracked file already in the worktree.

### 14.9 Remaining architecture exceptions after §14

| Rule | Entries | Change |
|---|---|---|
| `production_services_do_not_depend_on_sales_internals` | **0** (was 3) | freeze deleted — the dependency is gone |
| `production_does_not_depend_on_other_business_module_internals` | 0 (new rule) | measured clean from the start |
| `production_services_do_not_depend_on_flat_persistence` | **6** (was 5 after §14.12) | +1: the production-owned document reader §14.13 created for the two still-flat tables |
| `outside_does_not_depend_on_production_persistence` | **0 — the freeze is deleted** (2 at P4, 4 after the P7 widening, 2 after §14.12, 0 now) | −2 migrated by §14.13, then the emptied allow-list itself removed |
| `controllers_do_not_depend_on_repositories` | 6 | unchanged |
| `entities_do_not_depend_on_services` | 8 | unchanged |
| `marketing_does_not_depend_on_crm_or_sales` | 2 | unchanged |
| `outside_does_not_depend_on_crm_internals` | 15 | unchanged |
| `crm_does_not_depend_on_the_sales_document_chain` | 1 | unchanged |
| `cpr_does_not_depend_on_purchase_internals` (+2 explicit rules) | 0 | unchanged (§13) |

Production now has **no** dependency on Sales internals, **none** on another business module's internals, and **no code outside it reads its persistence at all** — since §14.13 migrated the rule's last two readers, that rule is enforced with no allow-list whatsoever. What remains frozen is production's own flat persistence (six classes after §14.13.4) and the shared settings store that happens to live in the flat packages.

### 14.10 Risks and limitations

- **The ports are synchronous in-process contracts.** They preserve today's atomicity and add no boundary, but they do not make Production deployable on its own; if Sales were ever extracted, `SalesAttachmentStoreAdapter`/`SalesOrderLookupAdapter` are the seams where an outbox would have to appear.
- **The tracker's CPO reference is no longer an association.** A future Sales-side "create the tracker when the CPO is created" call must pass the published `SalesOrderRef`; a JPA join from `ProductionTracker` to `sales_orders` is deliberately no longer available. `autoCreateForCpo(...)` has no caller in the codebase today (it was already dead before this phase) and is preserved, retyped, rather than deleted.
- **Production's own flat persistence is still flat.** `ProductionTracker*` and `QualityInspection*` keep their tables in the flat packages, and four allow-list entries plus the shared settings store remain for that reason; migrating them is a production-module change with its own tests, not a boundary fix.
- **The two CAD couplings recorded here were the follow-up, and §14.12 removed them** (the projection now goes through `production.api.ModelConversionProjectionPort`, the format classification through `cad.CadFileTypes`). §14.13 removed the two entries that remained after it — `PdfGenerationService` and `service.cad.CadConversionJobService` — and deleted the freeze entirely rather than leaving it empty; §14.13 records what that cost.
- **Production's document reads are still flat, and §14.13 made them production-owned.** The tracker and inspection tables have not moved out of the flat packages, so the module's new document reader is listed in `PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST`; that entry disappears when those tables move beside their twenty siblings in `repository.production` / `entity.production`. The alternative — keeping those reads in the shared reporting service — would have preserved a cross-module violation in exchange for an intra-module naming one, which is the wrong trade.
- **No architecture rule imports `com.vishatech.cadworker`.** `BoundaryFindings.PROJECT_CLASSES` imports `com.vishatech.erp`, so the isolated worker process — which legitimately reads the production model and its repositories through the shared persistence unit — is outside every rule in this suite. That is deliberate (it would otherwise need a large allow-list for the queue's own coordination surface) and it is why the worker's own projection behaviour is pinned by an integration test instead: see §14.12.
- **The widened outside → production source is judged by ownership, not by package:** anything that is not production-owned is checked. That is deliberate (it is what closed the gap), and `ProductionBoundaryScopeTests` pins the ownership predicate so it cannot quietly swallow a non-production class.
- **The application was not booted against the live shared MySQL.** Credentials come from `ERP_DATABASE_USERNAME/PASSWORD` in the environment (absent here), and booting would run the data seeders against the real `erp_db` — a write this task must not perform. The tracker column was therefore verified by a read-only `information_schema` query against the live database (see §14.4/§14.7) plus the entity-graph tests, not by a `ddl-auto=validate` startup.
- **Live REST Assured tests did not run:** the `BaseApiTest` subclasses (including `api.production.ProductionApiTest`) are gated on `ERP_API_TEST_ENABLED=true` and reported `Tests run: 0`, exactly as before this phase. The attachment and tracker endpoints are therefore verified here through MockMvc in the real Spring context rather than against a running server.
- **Nothing here claims the ERP is fully modularized.** §14 covers the Production → Sales boundary, the tracker and the three Production outbound guards; the remaining §4.5 ports stay **[PROPOSED]**.
### 14.11 Worktree safety (reconciled, not assumed)

`git status --short` at the end of §14 holds **165** entries: 49 `??`, 1 `A `, 4 ` D`, 1 `D `, 62 ` M`, 1 `R `, 47 `RM`. That checkout carries a large amount of **pre-existing** work from earlier phases and from other threads working the same local checkout (the whole CRM package move, the dashboard package move, the staged deletion of the old `DashboardController`, 47 staged renames, the purchase/CPR/audit work of §12–§13). All of it is intact: the 47 `RM` staged renames and the staged `DashboardController` deletion are present exactly as measured before this task, and no file was reverted, deleted, overwritten, stashed or staged by this task — `git add`, `git commit`, `git checkout`, `git restore` and `git stash` were never run.

The entries this task adds are its own new files (the four new main-source types, the five new focused test classes, the two test-only probe fixtures, `ProductionBoundaryScopeTests` and `BoundaryFindings`) plus the pre-existing files it modified in place:

| Kind | This task's entries |
|---|---|
| **added (untracked)** | `sales/api/AttachmentStorePort.java`, `sales/api/SalesOrderLookupPort.java`, `sales/api/SalesOrderLookupAdapter.java`, `service/SalesAttachmentStoreAdapter.java`, `service/production/SalesBoundaryProbe.java`, `service/production/PublishedPortConsumerProbe.java`, `architecture/BoundaryFindings.java`, `architecture/ProductionBoundaryScopeTests.java`, `sales/api/SalesOrderLookupAdapterTests.java`, `production/ProductionOrderCpoResolutionIntegrationTests.java`, `production/ProductionTrackerCpoLinkIntegrationTests.java`, `production/ProductionAttachmentContractIntegrationTests.java`, `production/ProductionAttachmentAtomicityTests.java` |
| **modified in place** | `service/production/ProductionAttachmentService.java` (+30/−55 incl. §14.2's rewrite), `service/production/ProductionOrderService.java` (+23/−18), `service/ProductionTrackerService.java` (+40/−21), `entity/ProductionTracker.java` (+23/−6), `controller/production/{ProductionOrder,Drawing,Model}Controller.java` (4+/4− each), `architecture/ModuleBoundaryTests.java`, `architecture/ProductionSalesBoundaryTests.java`, `MODULAR_MONOLITH_FOUNDATION.md` |

Two of those files (`ModuleBoundaryTests.java`, `ProductionSalesBoundaryTests.java`) and `MODULAR_MONOLITH_FOUNDATION.md` are themselves **untracked** (they are foundation-phase files that were never committed), which is why their edits appear in no `git diff` and must be reviewed as files. `target/` stayed out of the index and out of the untracked set entirely, and the one-off editing script this phase used was deleted from both locations it was written to (`find` and `git status` confirm nothing remains).

**Concurrency caveat, stated plainly:** this is a shared checkout and other threads may be editing it; the entry counts above are a reading of one moment, and the pre-existing staged work is the part that must not move — which is exactly what was verified.

### 14.12 The last two CAD → Production couplings (follow-up to P7) **[VERIFIED]**

P7 closed every Production outbound boundary but had to *record* two couplings it did not migrate, because they point the other way: classes of the shared CAD engine reaching into Production persistence. Both are now gone.

**What the coupling was** (measured from bytecode and call sites, not from the earlier report):

| CAD class | Production internals it depended on | Which it used them for |
|---|---|---|
| `cad.CadModelProjection` | `entity.production.Model`, `entity.production.ModelConversionStatus` | wrote the model projection columns (`conversionStatus`, `conversionError`, `conversionStartedAt/CompletedAt`, `convertedFilePath`) from a job state. Called from 5 sites: the ERP-side `service.cad.CadConversionJobService` (queue, cancel, three refusal paths) and the isolated worker's `cadworker.CadJobStore` (completed, failed ×3) |
| `cad.ConversionProviderRegistry` | `entity.production.ModelConversionStatus` | `isBrowserNative(ft)` / `isRecognisedStoredOnly(ft)` — format capability classification inside `resolve(...)` |

Both sat in `OUTSIDE_TO_PRODUCTION_PERSISTENCE_ALLOWLIST`; P7's widening is what made them visible at all.

**14.12.1 Coupling A — the projection becomes a published Production contract.**

| Type | Role |
|---|---|
| `production.api.ModelConversionProjectionPort` (**added**, Production-owned published surface) | `recordConversionOutcome(ConversionOutcome)`; the nested `ConversionOutcome` record carries a six-stage vocabulary (`QUEUED`, `PROCESSING`, `READY`, `FAILED`, `CANCELLED`, `UNSUPPORTED`) with named factories so an incoherent combination cannot be built |
| `entity.production.Model` (**modified**) | **implements** the port. The projection semantics that used to live in the CAD engine — which status value each outcome produces (`COMPLETED → READY`, `CANCELLED → NOT_CONVERTED`), which timestamps are stamped or cleared, the 490-character bound on `conversionError`, and the rule that a `READY` with no path *keeps* the existing preview reference — are now decided by the module that owns the columns |
| `cad.CadModelProjection` (**rewritten**) | a pure mapper: job state → `ConversionOutcome`, reported through the port. It imports no production package any more |

**Why the entity implements the port rather than a Production `@Component` adapter.** The worker process runs from the same jar with a deliberately narrow component scan (`com.vishatech.erp.cad` + `com.vishatech.cadworker`), so no Production service bean exists there and a bean-based adapter would have broken the worker at startup. The contract is therefore a plain in-memory contract: both callers already hold the model inside their own transaction, `recordConversionOutcome` performs no persistence call, and the caller's transaction, dirty-checking and write ordering are unchanged. That is also why the port lives in `production.api` rather than `cad.api`: the *provider* owns the semantics, exactly as `sales.api` publishes what Sales owns. `PRODUCTION_PACKAGES` in `ModuleBoundaryTests` was extended with `com.vishatech.erp.production` so the module's published surface is classified as Production-owned (asserted in §14.12.5).

**14.12.2 Coupling B — format capability moves to the engine that implements it.**

`cad.CadFileTypes` (**added**) owns the format catalogue: browser-native (GLB/GLTF/STL/OBJ by the original substring rule, plus the exactly-matched PLY/DAE/3DS loaders), recognised-stored-only (Parasolid, Rhino/JT, CATIA, NX/Creo, Inventor, Solid Edge, Fusion/FreeCAD/Blender/OpenSCAD), `requiresBackendConversion` and `isDirect`. The predicates moved **verbatim** — same sets, same matching — so every classification answer is unchanged. `entity.production.ModelConversionStatus` (**reduced**) now holds only what the column means (`NOT_REQUIRED` … `UNSUPPORTED` plus `isInFlight`), and the three callers that needed the capability ask the CAD catalogue: `ConversionProviderRegistry` (coupling removed), `service.production.ModelService` and `service.cad.CadConversionJobService` (Production → CAD engine is the already-accepted direction, and the enforced outbound rules stayed green).

A *port* was deliberately not used here: a Production-implemented bean is unavailable in the worker process, and the knowledge is CAD capability rather than production persistence, so it belongs with the conversion engine.

**14.12.3 Behaviour preserved.** Status values, timestamps, path setting/clearing and the error bound are branch-for-branch identical to the replaced `switch`, with one documented tightening: an *unknown* admission state used to be written into `conversion_status` verbatim; the only value ever passed was `UNSUPPORTED` (the ERP's refusal paths), which the contract now names explicitly, so the column value is unchanged and a future state cannot silently become a fake status. Nothing else moved: no REST path, method, authority, response field, schema, queue behaviour, engine selection or worker lifecycle change, and the four `CadConversionJobStatus` → column mappings documented on `CadConversionJobStatus` still hold.

**14.12.4 Allow-list: 4 → 2 entries.**

| Rule entry | Status |
|---|---|
| `cad.CadModelProjection` | **removed** — the class imports no production package (bytecode assertion, §14.12.5) |
| `cad.ConversionProviderRegistry` | **removed** — same |
| `service.PdfGenerationService` | kept — a real reader of `repository.ProductionTrackerRepository`; unchanged by this phase |
| `service.cad.CadConversionJobService` | kept — ERP-side CAD job bookkeeping reads production models through `ModelRepository`; unchanged by this phase |

Deleting an entry is the last step of a migration, never the first: both dependencies were gone from the bytecode before the freeze shrank, and `ProductionBoundaryScopeTests` re-evaluates the unfrozen rule so the remaining two entries are still proven to be exactly the real offender set.

**14.12.5 Tests** (focused commands, actual output):

| Command | Result |
|---|---|
| `./mvnw -o test -Dtest='CadProductionBoundaryTests,CadModelProjectionTests,ModelConversionProjectionTests,CadFormatSupportTests,ProductionBoundaryScopeTests,ModuleBoundaryTests,ProductionSalesBoundaryTests'` | **PASS** — exit 0, `Tests run: 80, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test -Dtest='CadWorkerProjectionTests,CadWorkerPersistenceUnitTests,CadWorkerSafetyTests,CadConversionJobServiceTests,CadMissingEngineStartupTests,CadEngineAutoDetectionTests,SolidWorksConversionEngineTests,CadirToGlbBuilderTests,CadmpegConversionEngineTests,SatAcisConversionEngineTests'` | **PASS** — exit 0, `Tests run: 53, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test` (full backend, final state) | **PASS** — exit 0, **`Tests run: 631, Failures: 0, Errors: 0, Skipped: 0`**, BUILD SUCCESS |

| New test class | Tests | What it pins |
|---|---|---|
| `architecture.CadProductionBoundaryTests` | 9 | no production-persistence dependency in either former offender (direct bytecode reading); each depends on the contract that replaced it (`ModelConversionProjectionPort` / `CadFileTypes`) and no longer names the entity or the status type; **no `cad` origin** in the unfrozen rule's output; the published port is Production-owned but not production persistence and is never "outside" production; a regression probe that re-introduces both dependencies **is reported** with the model entity, the repository and the status type named as targets; the contract-consumer probe passes with no freeze; the remaining freeze equals the real offender set |
| `cad.CadModelProjectionTests` | 8 | the mapper's job state → outcome mapping for all five job states plus the admission refusal, one report per state, the timestamp it stamps, and that it needs nothing from Production (the projection is a recording stub implementing only the contract) |
| `production.ModelConversionProjectionTests` | 12 | what each outcome means for the columns: reset on QUEUED, start-without-completion on PROCESSING, preview + error cleared on READY, an existing preview kept when READY carries no path, reason + preview dropped on FAILED, NOT_CONVERTED on CANCELLED, UNSUPPORTED naming the gap, a null reason preserved, the 490-character bound, and the CAD mapper driving the entity end to end |
| `cadworker.CadWorkerProjectionTests` | 3 | the **worker process** (real narrow-scan context, H2): `CadJobStore.markCompleted` publishes READY + preview + the `Converted` timeline entry, `markFailed` publishes only the sanitised reason and no preview, and a job whose model row is gone still fails the queue row without a projection crash |

**Non-vacuity, permanently.** Two inert test-only probes live in `com.vishatech.erp.cad`: `CadProductionRegressionProbe` re-introduces exactly the two former dependencies — and calls a *method* on the production status type, because reading a `static final String` constant would be inlined by javac and create no class-file edge at all, which is the detail that made this probe worth writing — and `CadProjectionPortConsumerProbe` depends only on the published contract and the CAD-owned catalogue. The former must be reported, the latter must not, and neither is a Spring bean, is ever instantiated, or reaches the application jar. No temporary probe file was created and deleted in this phase.

**14.12.6 Limitations.**

- **The contract is in-process, not a boundary.** It removes the dependency, not the coupling in time: the ERP service and the worker still write the model projection inside their own transactions, which is the existing design and is asserted by the worker integration test.
- **The CAD worker package is outside every architecture rule.** `BoundaryFindings.PROJECT_CLASSES` imports `com.vishatech.erp`, so `com.vishatech.cadworker` — which legitimately reads production models and repositories for the queue's coordination surface — is not covered by ArchUnit at all; a worker-side regression is caught by tests, not by a rule. Widening the import would require an allow-list for that whole persistence surface and was out of scope.
- **Two allow-list entries remain in this rule**, both pre-existing ERP-side readers (`PdfGenerationService`, `service.cad.CadConversionJobService`). Moving the CAD job service's model access behind a production-facing port is a separate change with its own call sites (queue admission, cache hit, cancel) and its own tests.
- **Upload-side extension knowledge still lives in more than one place:** `CadFileTypes` answers "can the browser render this / does it need an engine", while `ModelService.ALLOWED_EXTENSIONS` and `CadContentSniffer` answer "which extensions are accepted and how is content sniffed". That split predates this phase and was left untouched.
- **Nothing here claims the ERP is fully modularized.** §14.12 removes two couplings and shrinks one freeze; the remaining §4.5 ports stay **[PROPOSED]**.
**§14.12 worktree delta (same checkout, re-measured).** `git status --short` after §14.12 holds **179** entries — the §14 midpoint's 165 plus exactly this phase's 14: 7 new untracked entries (56 `??`, +7: `cad/CadFileTypes.java`, the new `production/api/` package, and the five new test classes) and 7 modified-in-place files (69 ` M`, +7). The pre-existing parts are unmoved: the 47 `RM` staged renames, the staged `A `, the staged `D ` and the four unstaged ` D` deletions are present exactly as measured at the start of §14.12, and again no `git add`, `git commit`, `git checkout`, `git restore` or `git stash` was run by this phase.

| Kind | This phase's entries |
|---|---|
| **added (untracked)** | `main/cad/CadFileTypes.java`, `main/production/api/ModelConversionProjectionPort.java`, `test/cad/CadModelProjectionTests.java`, `test/cad/CadProductionRegressionProbe.java`, `test/cad/CadProjectionPortConsumerProbe.java`, `test/production/ModelConversionProjectionTests.java`, `test/cadworker/CadWorkerProjectionTests.java` |
| **modified in place** | `main/cad/CadModelProjection.java` (+43/−58), `main/cad/ConversionProviderRegistry.java` (+2/−2), `main/entity/production/Model.java` (+81/−1), `main/entity/production/ModelConversionStatus.java` (+6/−83), `main/service/cad/CadConversionJobService.java` (+2/−1), `main/service/production/ModelService.java` (+8/−8), `test/cad/CadFormatSupportTests.java` (+12/−13) — 154 insertions / 166 deletions across the seven |
| **modified, untracked (no `git diff`)** | `test/architecture/ModuleBoundaryTests.java` (freeze 4 → 2, comment, `PRODUCTION_PACKAGES` + `com.vishatech.erp.production`), `MODULAR_MONOLITH_FOUNDATION.md` (this section) |

No temporary probe file, no stale class file and no throwaway script was left behind: the two probes are deliberate permanent fixtures under `src/test/java`, `find src/main -name '*Probe*'` is empty, and the only file written outside the source tree during this phase was the Maven log under `target/` (ignored).

### 14.13 The last two outside → Production readers (follow-up to §14.12) **[VERIFIED]**

§14.12 removed the two CAD-<em>engine</em> couplings and left `OUTSIDE_TO_PRODUCTION_PERSISTENCE_ALLOWLIST` holding exactly two ERP-side readers. Both are now migrated, and the freeze is **deleted**: the rule is enforced with no allow-list at all, so nothing outside Production can read production persistence without failing the suite.

**What the coupling was** (traced from bytecode, call sites and the queries each path issues — not from the previous report):

| Class | Production internals it depended on | What it used them for |
|---|---|---|
| `service.PdfGenerationService` | `repository.ProductionTrackerRepository`, `repository.QualityInspectionRepository`, `repository.production.PackingListRepository`, and the three entities behind them | `buildHtml("productiontracker"` / `"packinglist"`, id)` and `buildQualityInspectionHtml(id)`: reading the record to print its reference, its curated summary rows and its complete-record reflection |
| `service.cad.CadConversionJobService` | `repository.production.ModelRepository`, `entity.production.Model` | the admission, cache and cancel paths: the file facts a job is built from (`fileType`, `fileSize`, `fileChecksum`, `filePath`), the "`READY` with a preview still on disk" cache check, and the save that writes the conversion projection after every refusal, queue and cancel |

**14.13.1 Coupling A — the documents become Production's, the rendering stays shared.**

| Type | Role |
|---|---|
| `pdf.DocumentView` (**added**, shared) | a neutral description of a printable document: `title`, `reference`, `createdOn`, and ordered `Field(label, value)` rows for the summary and the complete-record details. No entity, repository, DTO or service type of any module — that is what makes it publishable. |
| `pdf.DocumentHtml` (**added**, shared) | the HTML toolkit the document builders were assembled from — letterhead and printable CSS, `esc`, the row tables, the date format, and the reflection behind "Complete Record Details". Its bodies moved **verbatim** from `PdfGenerationService`, which now reaches them through static imports, so its fifteen other document builders were not touched and not one byte of produced HTML changed. |
| `production.api.ProductionDocumentPort` (**added**, Production-published) | `productionTracker(Long)`, `qualityInspection(String)`, `packingList(Long)` → `Optional<DocumentView>` |
| `service.production.ProductionDocumentService` (**added**, Production-owned) | the moved document bodies: it loads the three records and describes them as `DocumentView`s. Missing record = empty result (the original `findById(...).orElse(null)`), never an exception. |
| `service.PdfGenerationService` (**modified**) | injects the port instead of the three repositories; the three builders became `renderDocument(port…)`, and the QC entry point kept its `try/catch` + warning semantics. |

Why the reads moved instead of being mirrored into a DTO: the "Complete Record Details" section is **reflection over the real entity** — it is what guarantees that a field someone adds to `ProductionTracker` tomorrow appears in tomorrow's PDF without anyone maintaining a list. A hand-written read model would have silently turned that guarantee into a chore, and copying the entity's fields would have been evasion rather than a boundary. Moving the three builders keeps the reflection where the records live and keeps the HTML shared, which is exactly the split the task's first option describes.

**14.13.2 Coupling B — the job pipeline asks for facts and reports outcomes.**

| Type | Role |
|---|---|
| `production.api.ModelConversionJobPort` (**added**, Production-published) | `find(Long)` → `Optional<ModelFacts>` and `recordOutcome(Long, ConversionOutcome)`, plus the published `NOT_REQUIRED` status word. `ModelFacts` bundles the job-relevant facts (`id`, `fileType`, `fileSize`, `fileChecksum`, `filePath`, `previewConverted`, `convertedFilePath`) |
| `service.production.ModelConversionJobAdapter` (**added**, Production-owned) | loads the model, reports the facts, and on an outcome loads → applies → saves — the exact sequence the service performed inline |
| `service.cad.CadConversionJobService` (**modified**) | holds the port and no model type at all. Every decision it made is unchanged: browser-native refusal, missing source file, duplicate in flight, queue bound, disabled pipeline, engine availability, size limit, preview cache, and the cancel path's "model row is gone → skip". |

Two details are deliberate. **`previewConverted` is computed by the adapter**, because "`READY` means a preview exists" is the column's vocabulary and belongs to the module that owns the column — the caller still decides whether that preview is on *its* disk. **The refusal status reported to the client is the outcome's own stage name** (`FAILED`, `UNSUPPORTED`), so the word the caller sees and the value written to `conversion_status` cannot disagree; the browser-native refusal uses the published `NOT_REQUIRED` constant, which a test pins against the entity's own value. A **bean** adapter is correct here — unlike §14.12's projection port — because the isolated CAD worker never needs this contract: its narrow component scan loads no `service.production` beans, so it keeps its own store and its own repository access, exactly as before.

**14.13.3 Behaviour preserved.** For the documents: same titles, references, row labels, row order, `%` suffixes, `-` placeholders, date format, escaping, letterhead, footer, complete-record reflection and missing-record behaviour — the rows were *moved*, not rewritten, which is why the tests can assert the rendered document against a literal built row by row. For the CAD pipeline: same job rows, same status vocabulary, same timestamps, same cache decision, same 404 and refusal messages, same queue bound, same response statuses (`CadConversionJobServiceTests`, unchanged, still passes). No REST path, HTTP method, authority, response field, schema, SQL, queue behaviour, engine selection or worker lifecycle changed. Nothing outside the two coupling sites was touched.

**14.13.4 Allow-list: 2 → 0, and one honest new flat entry.**

| Rule | Before | After |
|---|---|---|
| `outsideDoesNotDependOnProductionPersistence()` | frozen via `OUTSIDE_TO_PRODUCTION_PERSISTENCE_ALLOWLIST`, 2 entries | **enforced, no allow-list, 0** — the unfrozen rule reports no origin at all for the real codebase, and `ProductionPersistenceBoundaryTests` asserts the constant no longer exists in `ModuleBoundaryTests` |
| `productionServicesDoNotDependOnFlatPersistence(...)` | `PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST`, 5 entries | **6** — `service.production.ProductionDocumentService`, because the tracker and inspection tables are still flat |

The trade is stated rather than hidden: migrating the reads put them in the module that owns the columns, where the module's *own* still-flat tables are — the pre-existing debt that rule exists to freeze. What changed category is the violation, not its count: a **cross-module** violation was replaced by an **intra-module naming** one that disappears when `ProductionTracker*`/`QualityInspection*` move beside their twenty siblings. The alternative — leaving the reads in the shared PDF service — would have kept a violation that no future migration removes. Everything else about the flat list is unchanged, and `ProductionBoundaryScopeTests` still proves it is exactly the set of real offenders (dead entry or hidden offender ⇒ failure).

**14.13.5 Tests** (focused commands, actual output):

| Command | Result |
|---|---|
| `./mvnw -o test -Dtest='ProductionPersistenceBoundaryTests,ModuleBoundaryTests,ProductionBoundaryScopeTests,CadProductionBoundaryTests,ProductionSalesBoundaryTests,SourceHygieneTests,ProductionDocumentServiceTests,ProductionDocumentContractIntegrationTests,ModelConversionJobAdapterTests,CadConversionJobServiceTests,CadMissingEngineStartupTests,CadWorkerProjectionTests,CadWorkerPersistenceUnitTests,CadWorkerSafetyTests,ModelConversionProjectionTests,CadModelProjectionTests,CadFormatSupportTests'` | **PASS** — exit 0, `Tests run: 127, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test` (full backend, final state) | **PASS** — exit 0, **`Tests run: 657, Failures: 0, Errors: 0, Skipped: 0`**, BUILD SUCCESS (5:13 min) |

| New test class | Tests | What it pins |
|---|---|---|
| `architecture.ProductionPersistenceBoundaryTests` | 9 | neither former offender has a production-persistence dependency any more (direct bytecode reading); each depends on the contract that replaced it and no longer names the repositories/entities; the rule is **clean and parameterless** and `ModuleBoundaryTests` carries no such field again (reflection); two probes that reintroduce the exact former edges **are reported**, with the tracker repository, the inspector repository, the packing-list repository, the tracker/inspection entities, and the model repository/entity/status type named as targets; a third probe that consumes only the published contracts and the shared toolkit passes; the contracts are production-owned published surface (never persistence, never "outside"); the document reader is inside the module's own service scope and implements the port; the job adapter adds **no** flat edge, which is why it needed no entry. |
| `service.production.ProductionDocumentServiceTests` | 7 | each document's summary compared **against a literal**, row by row, in order (including `%` suffixes, `-` placeholders, `<`/`&` escaping and the `Instant → dd MMM yyyy` conversion); the complete-record section still reproduces the fields the summary does not show, still keeps ERP-internal columns out, and is omitted entirely when nothing is left; the stored inspection number is used and the `QC-<id>` fallback kept; a missing record (and a null id) is no document. |
| `production.ProductionDocumentContractIntegrationTests` | 4 | the public entry points over a real context and real rows: the tracker document built from the module's own persisted record (including reflection over the saved entity), the HTML stable between two reads, the packing list rendered to **real PDF bytes** (`%PDF-`) through the unchanged iText path, missing records → no document, the unchanged null dispatch for the inspection module, and the port served by the production-owned adapter. |
| `production.ModelConversionJobAdapterTests` | 6 | the facts a job is built from; `previewConverted` only for `READY`; missing model → empty (no exception); every outcome still reaches the same columns through the shared projection (QUEUED → PROCESSING → READY+path → FAILED+reason → NOT_CONVERTED → UNSUPPORTED); an outcome for a missing model is a no-op; the published refusal word equals the entity's `NOT_REQUIRED`. |
| `architecture.ProductionBoundaryScopeTests` | 8 (unchanged count, one test rewritten) | `outsideDoesNotDependOnProductionPersistence()` is asserted clean **with no allow-list**; `PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST` is still exactly the unfrozen rule's offender set. |
| `architecture.CadProductionBoundaryTests` | 9 (unchanged count, one test rewritten) | the CAD entries are still gone and the rule now reports nothing at all for the real codebase. |

Migration of pre-existing tests: two testify-style assertions were replaced (the rule no longer has a freeze to compare against, so the "freeze equals the offenders" proof became "the rule is clean", and the non-vacuity proof moved to the probes). No test was skipped or weakened, no assertion was deleted without a replacement, and no allow-list entry was added to make a rule pass.

**14.13.6 Limitations.**

- **The contracts are in-process, not a boundary.** They remove the dependency, not the coupling in time: the pipeline still writes the projection inside the caller's transaction, which is the existing design and is asserted by the adapter tests.
- **The CAD worker still reads the model directly.** `com.vishatech.cadworker.CadJobStore` is outside every ArchUnit rule (`BoundaryFindings` imports `com.vishatech.erp`) and cannot use this contract anyway, because it is a bean and the worker's component scan loads no Production services. Migrating the worker was out of scope; a worker-side regression is caught by its own tests, not by a rule.
- **One new flat-persistence entry** (§14.13.4), for the reason recorded there and in `ModuleBoundaryTests`: the tracker and inspection tables have not moved. It is a real, measured edge, not a broad package allow-list.
- **Reflection still governs the complete-record section.** A field that is *not* user-entered but also not in the internal list still appears in a document (a pre-existing property, unchanged); the document content follows the entity, so an entity change changes a PDF — which is the intent, and it is why the documents were moved rather than re-modelled.
- **The inspection document is not exercised against a live row in tests.** Its table declares MySQL `JSON` columns that H2 cannot create, so its content is pinned by the unit test (mock repositories) and its missing-row answer by the same test; the end-to-end path is pinned for the tracker and packing-list documents.
- **Not run, and why:** the live REST Assured suites are gated on `ERP_API_TEST_ENABLED=true` and report `Tests run: 0`, exactly as before; the application was not booted against the shared MySQL (this phase changed no mapping, column or SQL, and booting would run the seeders against the real `erp_db`). No schema or stored data was touched.
- **Nothing here claims the ERP is fully modularized.** §14.13 removes the last two readers and one freeze; the remaining §4.5 ports stay **[PROPOSED]**, and Production's own flat persistence is still a module-level migration of its own.

**§14.13 worktree delta.** `git status --short` now holds **188** entries — the §14.12 reading of 179 plus exactly this phase's nine: seven new files plus two new directories (`main/pdf/` with two files, `test/service/cad/` with one). Two of this phase's new files land inside directories that were already untracked, which is why they add no entry of their own: `main/production/api/ProductionDocumentPort.java` (the `production/` package was already new) and `test/architecture/ProductionPersistenceBoundaryTests.java` (that directory was already new). Everything pre-existing is unmoved — the 47 `RM` staged renames, the staged `A `/`D ` entries, the four ` D` deletions and the pre-existing modifications are exactly as measured at the start of §14.13 — and no `git add`, `git commit`, `git checkout`, `git restore` or `git stash` was run. `PdfGenerationService` and `CadConversionJobService` were already modified in this shared checkout before this phase (they carried previous phases' edits, including `PdfGenerationService`'s CRM-entity imports from the CRM package move); those lines were preserved untouched and appear in the diff alongside this phase's changes.

| Kind | This phase's files |
|---|---|
| **added — untracked; 13 files, landing as 9 new `??` entries (7 files + the new `pdf/` and `service/cad/` test directories)** | `main/pdf/DocumentView.java`, `main/pdf/DocumentHtml.java`, `main/production/api/ProductionDocumentPort.java`, `main/production/api/ModelConversionJobPort.java`, `main/service/production/ProductionDocumentService.java`, `main/service/production/ModelConversionJobAdapter.java`, `test/service/PdfProductionRegressionProbe.java`, `test/service/ContractConsumerProbe.java`, `test/service/cad/CadJobProductionRegressionProbe.java`, `test/service/production/ProductionDocumentServiceTests.java`, `test/production/ProductionDocumentContractIntegrationTests.java`, `test/production/ModelConversionJobAdapterTests.java`, `test/architecture/ProductionPersistenceBoundaryTests.java` |
| **modified in place — 6 files (all already ` M`/`??` before this phase, so the status counts do not move)** | `main/service/PdfGenerationService.java` (+/−: the toolkit and the three builders moved out, the port moved in), `main/service/cad/CadConversionJobService.java` (the model became the port), `test/architecture/ModuleBoundaryTests.java` (freeze deleted, one flat entry added, comments), `test/architecture/ProductionBoundaryScopeTests.java`, `test/architecture/CadProductionBoundaryTests.java`, `MODULAR_MONOLITH_FOUNDATION.md` (this section) |

No temporary probe, stale class file or throwaway script was left behind: the three probes are deliberate permanent fixtures under `src/test/java`, `find src/main -name '*Probe*'` is empty, and the only file written outside the source tree was the Maven log under `target/` (ignored). The one-off `sed` invocation this phase used for the mechanical block deletions left no script behind, and `PdfGenerationService`'s original line endings were restored and verified afterwards.

### 14.14 The last flat Production persistence moves home **[VERIFIED]**

§14.13 ended with one honest caveat: migrating the production documents into the module put their reads where the module's own *still-flat* tables were, so `ProductionDocumentService` joined `PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST` (six entries) instead of shrinking the outside → production freeze further. This phase removes that debt: **tracker and quality-inspection persistence now live beside their twenty-odd siblings, and the freeze is down to one class that is not production's at all.**

**14.14.1 What moved (and what deliberately did not).**

| Was (flat layer) | Now |
|---|---|
| `entity.ProductionTracker` | `entity.production.ProductionTracker` |
| `entity.QualityInspection` | `entity.production.QualityInspection` |
| `repository.ProductionTrackerRepository` | `repository.production.ProductionTrackerRepository` |
| `repository.QualityInspectionRepository` | `repository.production.QualityInspectionRepository` |
| `service.ProductionTrackerService` | `service.production.ProductionTrackerService` |
| `service.QualityInspectionService` | `service.production.QualityInspectionService` |
| `controller.ProductionTrackerController` | `controller.production.ProductionTrackerController` |
| `controller.QualityInspectionController` | `controller.production.QualityInspectionController` |

Controllers moved with their workflows on purpose: with them gone from the flat layer, production ownership no longer needs a class-name list at all (see §14.14.4), which is a *stronger* rule than the one it replaces — a future `Production*`-looking class left in a flat package is now classified as **outside** production, so the outside → production rule reports it the moment it reads a production table instead of quietly treating it as production's own. No DTO moved: none of the tracker or quality-inspection DTOs exist in the flat `dto` package (the controllers speak the entities and `ApiResponse` directly, exactly as before).

**Not moved, and why.** `CprTechnicalVerification`, `CprTechnicalVerificationDocument` and `TechnicalVerificationStatus` are **CPR-owned**, not production-owned: they carry the `cpr_technical_verifications` / `cpr_technical_verification_documents` tables (a `@ManyToOne Cpr`), CPR's own service and controller create and read them, and the status enum is also the status of the production-side `entity.production.TechnicalVerification`. The evidence is executable, not asserted: all four of their outside readers (`service.CprService`, `service.CprTechnicalVerificationService`, `repository.CprTechnicalVerificationRepository`, `controller.CprTechnicalVerificationController`) are classified **outside production ownership**, so moving those tables into `entity.production` would *create* the outside → production violation §14.13 just removed — that is exactly what `ProductionPersistenceOwnershipTests` pins. The shared `AppSetting` / `AppSettingRepository` store stays flat too: Settings, Purchase and CRM read it as much as Production does, so it is platform infrastructure rather than production persistence, and its single narrow allow-list entry (one class, never a package) is the honest way to record it.

**14.14.2 Rules: one narrow entry instead of six, and no name lists.**

| Rule | Before §14.14 | After §14.14 |
|---|---|---|
| `production_services_do_not_depend_on_flat_persistence` (`PRODUCTION_TO_FLAT_PERSISTENCE_ALLOWLIST`) | 6 entries | **1** — `service.production.ProductionSettingsService` (the `AppSetting` store) |
| its source scope (`productionOwnedServices()`) | `service.production..` **plus** a two-name flat list | `service.production..` **only** |
| `productionOwnedTypes()` | `PRODUCTION_PACKAGES` **plus** flat packages by name prefix (`Production`, `QualityInspection`) | `PRODUCTION_PACKAGES` **only** |
| `productionOwnedPersistence()` | production packages **plus** a four-class flat set | production packages **only** |

Both name-based fallbacks — `PRODUCTION_OWNED_FLAT_SERVICES`, `PRODUCTION_OWNED_FLAT_PACKAGES` + `PRODUCTION_OWNED_FLAT_PREFIXES`, `PRODUCTION_OWNED_FLAT_PERSISTENCE` — were deleted rather than emptied, because an empty list is what a vacuous rule looks like. The guards that keep the deletion defensible are executable: `ProductionBoundaryScopeTests` still evaluates the flat-persistence rule with an empty allow-list and requires the reported origins to be *exactly* the one remaining entry, `ProductionPersistenceOwnershipTests.theFlatLayerHoldsNoProductionWorkflowClassAnyMore()` fails the moment a production workflow class appears in a flat layer package again, and the outside → production rule keeps its probes (§14.13) now pointing at the packaged classes. The Production → Sales and Production → other-modules rules were unaffected — their scope (`productionOwnedServices()`) simply covers the moved services by package instead of by name.

**14.14.3 No mapping changed, and how that was verified.** This is a package move, not a schema change, and the evidence is four independent readings:

1. **Hibernate's own DDL**, captured from a test run (`-Dlogging.level.org.hibernate.SQL=DEBUG`): `create table "production_trackers" (… "sales_order_id" bigint … "cpo_no" varchar(50) not null …)` and `create table "quality_inspections" (… "production_order_id" varchar(50) … "checklist" "JSON", "inspection_report" "JSON", "dimensional_inspection" "JSON", "material_test_certificate" "JSON", "final_qc_info" "JSON", "history" "JSON" …)` — the same tables, the same columns, the same `sales_order_id` id column, and the same MySQL `JSON` declarations as before the move.
2. **Reflection pins** (`ProductionPersistenceOwnershipTests`): `@Table(name = "production_trackers")` / `(name = "quality_inspections")`; `salesOrderId` is still a raw `Long` mapped to `@Column(name = "sales_order_id")` and still `@JsonIgnore`d, so a tracker request and response are byte-for-byte unchanged; `QualityInspection` keeps its `String` id (`QI-…`), its `production_order_id` column and all six `columnDefinition = "JSON"` declarations.
3. **Every table is still mapped exactly once** — no duplicate entity mapping was introduced by the move (asserted over all 136 mapped entities).
4. **Each repository still targets the entity it targeted**, read from its `JpaRepository` declaration, and both are still Spring Data beans in the running context (the tracker and inspection integration tests autowire them).

**14.14.4 Tests** (focused commands, actual output):

| Command | Result |
|---|---|
| `./mvnw -o test -Dtest='ModuleBoundaryTests,ProductionBoundaryScopeTests,ProductionPersistenceBoundaryTests,ProductionSalesBoundaryTests,CadProductionBoundaryTests,SourceHygieneTests,PurchaseIngressBoundaryTests'` | **PASS** — exit 0, `Tests run: 59, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test -Dtest='ProductionPersistenceOwnershipTests,QualityInspectionPersistenceTests'` | **PASS** — exit 0, `Tests run: 19, Failures: 0, Errors: 0, Skipped: 0` |
| `./mvnw -o test` (full backend, final state) | **PASS** — exit 0, **`Tests run: 676, Failures: 0, Errors: 0, Skipped: 0`**, BUILD SUCCESS |

| Test class | Tests | What it pins |
|---|---|---|
| `architecture.ProductionPersistenceOwnershipTests` (**new**) | 10 | the eight moved classes are production-owned at their new locations (persistence, services, controllers — and a controller is still not a service); **no production workflow class sits in `entity`/`repository`/`service`/`controller`/`dto`**; each repository still declares `JpaRepository<theMovedEntity, …>`; the table names, the `sales_order_id` column, the `String` id, the `production_order_id` column and the six `JSON` declarations are unchanged; every entity's table is mapped exactly once; the CPR verification types are *not* production-owned persistence while their four readers are outside production (the ownership rationale, made executable); the freeze holds exactly the shared settings store. |
| `production.QualityInspectionPersistenceTests` (**new**) | 9 | the moved workflow driven through real SQL: the service's create path (id shape, legacy `inspection_id`, default checklist, history seed, `Pending`), the transition rules (`Pending → In Progress → Passed`, terminal `Passed`, out-of-range checklist index), the JSON QC-data columns round-tripping to the response map, explicit ids honoured and refused when taken, filtered paging (`totalElements`/`totalPages`/search across the documented columns/service delegation/`created_at` desc ordering), the SQL aggregates (`countByStatus`, `countByInspectionType`, `countByInspectionDate`, `countByProductionOrderId`, `sumAcceptedQuantity`, `sumRejectedQuantity`) and `stats()` equivalence, delete-then-reuse of an id, and the **HTTP contract of both moved controllers** (401 without a token, 200/201/`PATCH` with one, the same list envelope, the same parsed-JSON response and the same `/stats` and `/by-order` routes) — moving a `@RestController` between packages is only invisible if the route, the authority and the envelope still answer the same way. |
| `architecture.ProductionBoundaryScopeTests` | 8 (unchanged count) | the flat-persistence allow-list is still exactly what the unfrozen rule reports (now one class), the rule no longer names the migrated repositories/entities, the service scope is package-based only, and the outside → production rule is still clean with no freeze. |
| `architecture.ProductionPersistenceBoundaryTests` | 9 (unchanged count) | the §14.13 offenders stay severed with their probes now naming the packaged classes, and the document reader's production-persistence edges are **all** inside `entity.production`/`repository.production` — which is why its entry left the allow-list rather than being kept. |
| `production.ProductionTrackerCpoLinkIntegrationTests` | 6 (unchanged) | the tracker's persistence, its CPO link through `sales.api.SalesOrderLookupPort` and the `sales_order_id` column, re-run against the moved entity and repository. |

No test was skipped, no assertion was weakened, and no allow-list entry was widened; the two new classes are additions, and the two rewritten assertions in the boundary tests became *stricter* (an absence of flat edges instead of a presence of them).

**14.14.5 Limitations.**

- **The shared MySQL was not booted.** This phase changed no mapping, column, index or SQL, and booting the ERP would run its seeders against the real `erp_db`, so the schema comparison above is Hibernate's generated DDL plus mapping reflection on H2 — not a live diff against MySQL. The stored data is untouched: no migration script, no `ddl-auto` change, no write outside the test database.
- **The quality-inspection table is still not creatable by H2** (its `JSON` columns are MySQL-only), so the integration test declares the same table by hand, as the dashboard tests already did. The DDL failure is pre-existing and unrelated to the move — Hibernate logs it and continues, exactly as before.
- **The dashboard adapter's shortcut is untouched.** `ProductionDashboardReadAdapter.qualityTotal()` still calls the repository's `count()` rather than `QualityInspectionService.stats(null)` (six counting statements per dashboard request), which is why that design note stays in the code; moving the table did not change the query-count economics, and `DashboardStatsQueryCountTests` still measures them.
- **The CPR technical-verification tables remain flat** (§14.14.1). That is an ownership decision, not a leftover: their module (`cpr`) already has a package and they belong to it, which is a CPR-side migration with its own tests — not something to force into Production to make an allow-list look emptier.
- **`TechnicalVerificationStatus` remains shared** between the CPR verification record and the production-side verification record, so it is classified as neither production-owned nor another module's internals. A future CPR package move has to keep that shared status in mind.
- **Not run, and why:** the live REST Assured suites are still gated on `ERP_API_TEST_ENABLED=true` and still report `Tests run: 0` (11 classes).

**§14.14 worktree delta.** `git status --short` now holds **204** entries — the §14.13 reading of 188 plus this phase's sixteen: **eight unstaged deletions** (the moved sources at their old paths) and **nine new untracked entries** (the eight new source paths plus `test/production/QualityInspectionPersistenceTests.java`). The untracked count moves by nine rather than ten because `test/architecture/ProductionPersistenceOwnershipTests.java` lands in a directory that is already untracked and therefore already collapsed into one entry. Two ledger movements explain the rest of the arithmetic: one of the moved sources (`service/ProductionTrackerService.java`) was itself a pre-existing ` M` file, so it moved from the modified bucket into the deleted one (` M` 69 → 68, ` D` 5 → 13). Everything else is unmoved — the 47 `RM` staged renames, the staged `A `/`D ` entries, the remaining ` D` deletions and the pre-existing modifications (including `erp-backend/pom.xml` and `erp-backend/tmp-run-8099.sh`) are exactly as measured at the start of this phase, and no `git add`, `git commit`, `git checkout`, `git restore`, `git reset` or `git stash` was run. The moved files differ from `HEAD` only by their package/import lines plus the modifications earlier phases had already made to them (the `ProductionTracker.salesOrderId` javadoc and `ProductionTrackerService`'s Sales-port migration), which `git show HEAD:<old path> | diff - <new path>` confirms line by line — no pre-existing change was lost in the move.

| Kind | This phase's files |
|---|---|
| **moved (8 files)** | the tracker and quality-inspection entity, repository, service and controller, from `entity`/`repository`/`service`/`controller` into the matching `*.production` packages |
| **added (2 untracked files)** | `test/architecture/ProductionPersistenceOwnershipTests.java`, `test/production/QualityInspectionPersistenceTests.java` |
| **modified (untracked files)** | `test/architecture/ModuleBoundaryTests.java` (three name-based fallbacks deleted, freeze 6 → 1, comments), `test/architecture/ProductionBoundaryScopeTests.java`, `test/architecture/ProductionPersistenceBoundaryTests.java`, `test/architecture/ProductionSalesBoundaryTests.java`, `main/service/production/ProductionDocumentService.java`, `main/service/production/ProductionTrackerService.java` (javadoc), every consumer's imports |

No stale class file survives at an old path (verified: `target/classes/com/vishatech/erp/{entity,repository,service,controller}/ProductionTracker*.class` and their peers no longer exist, while the packaged locations compile), no probe or throwaway script was added (`find src/main -name '*Probe*'` is empty), and the only file written outside the source tree was the Maven log under `target/` (ignored).
