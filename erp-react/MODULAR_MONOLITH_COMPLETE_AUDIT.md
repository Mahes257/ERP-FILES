# MODULAR_MONOLITH_COMPLETE_AUDIT.md

**Phase 1 — read-only architecture audit.** No source file was modified, moved or renamed in this phase. The only artifact produced is this document. Everything below is derived from the working tree by reading files and running read-only commands; nothing is assumed.

**Repository:** `erp-react` · **Audited revision:** working tree on top of `93a76c3` (which already carries the uncommitted work of the two earlier phases — see §1.1) · **Date of audit:** 2026-10-14.

### How to read this document

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | Read from the source or produced by a command in this phase; the file or command is cited. |
| **[MEASURED]** | Produced by a mechanical scan; method and limitations stated. |
| **[PROPOSED]** | A recommendation, not implemented. |
| **[OPEN]** | Not decidable from the source alone — needs a human decision. |

---

## 1. Current architecture

### 1.1 Deployment shape and the state of the tree **[VERIFIED]**

| Fact | Evidence |
|---|---|
| One React + Vite frontend, one Spring Boot backend, one MySQL schema | `package.json` (Vite 8), `erp-backend/pom.xml` (single `spring-boot-maven-plugin`), `src/main/resources/application.properties` |
| One HTTP entry point, context path `/v1`, port 8080 | `application.properties`, `src/api/axiosInstance.js` (`baseURL: '/v1'`), `vite.config.js` (dev proxy `/v1` → `ERP_PROXY_TARGET`) |
| A second, port-less process from the *same* jar (CAD worker) | `CadWorkerApplication` / `CadWorkerConfiguration` — `WebApplicationType.NONE`, no port, same database |
| Backend main sources | **728** Java files: 722 under `com.vishatech.erp`, 6 under `com.vishatech.cadworker` |
| HTTP surface | **76** controllers, **1003** handler methods (`grep -c '@\(Get\|Post\|Put\|Patch\|Delete\)Mapping'` over `*Controller.java`) |
| Backend tests | **79** test classes under `src/test/java/com/vishatech/erp/**` + `com/vishatech/cadworker/**` |
| Frontend size | `pages/` 93 `.jsx`, `purchase/pages/` 104, `production/pages/` 39, `components/` 148, `services/` 41, 145 routes in `App.jsx` |

**Uncommitted work already on the tree** (`git status`: 47 renames, 50 modified, 6 untracked): the ArchUnit guard (earlier phase) and the CRM module extraction (`com.vishatech.erp.crm.*`, 47 files moved). This audit treats the working tree as the baseline, because that is what the next phases will build on.

### 1.2 Backend layout — still package-by-layer, with three real module packages **[VERIFIED]**

| Package | Files | Package | Files |
|---|---|---|---|
| `dto` | 218 | `config` | 22 |
| `entity` | 163 | `util` | 11 |
| `repository` | 110 | `security` | 10 |
| `service` | 93 | `exception` | 6 |
| `controller` | 75 | `cad` | 13 |
| `crm` (**module package**) | 47 | `*.production` (sub-packages under service/controller/repository/entity/dto/config) | **132** |

Only `crm` (extracted in the previous phase), the `production` sub-packages and the CAD engine are true feature packages. Everything else is one flat layer, file-per-class — which is why module ownership below is expressed as **package ∪ class-name prefix** rather than as a package path.

### 1.3 Frontend layout **[VERIFIED]**

`src/pages/**` (Sales, CRM, CPR, dashboard, marketing) is the legacy flat tree; `src/purchase/**` (447 files) and `src/production/**` (250 files) are already feature-foldered with their own `routes/`, `services/`, `pages/`, `components/`. Navigation is declared in `src/components/Layout/AppLayout.jsx` (498 lines, **40** sidebar labels) and `src/components/Layout/SalesNav.jsx` (**26** labels).

### 1.4 API prefix inconsistency (existing — must be preserved) **[VERIFIED]**

| Module | Base paths |
|---|---|
| Purchase | **`/api/purchase/...`** (`dashboard`, `orders`, `invoices`, `requisitions`, `rfq-follow-ups`, `vendors`, `work-queue`, `adjustment-notes`; two controllers share the plain `/api/purchase` root) |
| Everything else | module-rooted without `/api`: `/dashboard`, `/sales/dashboard`, `/sales/reports`, `/crm` resources (`/customers`, `/leads`, `/contacts`, `/followups`), `/marketing/**`, `/production-kpi`, `/production-orders`, … |

A future route normalisation would break the frontend and is explicitly out of scope; recorded here so no later phase "tidies" it.

---

## 2. Main module and submodule hierarchy

The sidebar is the starting scope; the list below adds what the source actually contains **[VERIFIED]**.

### 2.1 Dashboard

| Submodule | Frontend | Backend |
|---|---|---|
| Main dashboard | `src/pages/Dashboard.jsx` → `GET /dashboard/stats` **and** `GET /marketing/dashboard`; uses `SalesKpiCards` | `DashboardController` (1 endpoint) + `DashboardService` (13.4 KB) |
| Sales dashboard | `src/pages/sales/SalesDashboard.jsx` + `services/salesDashboardService.js` → `GET /sales/dashboard` | `SalesDashboardController` (1) + `SalesDashboardService` (32.4 KB — the largest service) |
| Purchase dashboard | `src/purchase/pages/Dashboard.jsx`, `hooks/usePurchaseDashboard.js`, `services/dashboard.js` | `PurchaseDashboardController` (`/api/purchase/dashboard/stats`) + `PurchaseDashboardStatsService` |
| Purchase work queue | `src/purchase/pages/documents/PurchaseWorkQueue.jsx`, `services/workQueue.js` | `PurchaseWorkQueueController` (`/api/purchase/work-queue`, `/{category}`, `/counts`) + `PurchaseWorkQueueService` |
| Production dashboard / KPI | `src/production/pages/ProductionDashboard.jsx`, `KpiDetailsPage.jsx`, `data/dashboard.js` | `ProductionKpiController` (`/production-kpi/{module}/counts`, `/{module}/kpi/{kpiKey}`) + `ProductionKpiService`; plus `/production/reports/*` |
| Marketing dashboard | `src/pages/marketing/DashboardPage.jsx`, `components/Marketing/MarketingDashboard.jsx` | `GET /marketing/dashboard` inside `MarketingController` |
| Approval summary (dashboard widget) | consumed by the dashboard/approval badges | `ApprovalSummaryController` (`/approvals`) + `ApprovalSummaryService` |

**Ten files** (`*Dashboard*`, `*WorkQueue*`, `ApprovalSummary*`: 5 controllers + 5 services) form the dashboard surface; they are spread across the flat `controller/` and `service/` packages, so they are not a module today.

### 2.2 Marketing **[VERIFIED]**

89 marketing-owned backend files (42 classes, 28 records, 19 interfaces); 10 marketing entries in the `AppLayout` sidebar plus `Marketing` / `Marketing Settings` in `SalesNav`; frontend routes under `/marketing/**` plus `/marketing/expenses/*`.

| Submodule | Frontend route(s) | Backend |
|---|---|---|
| Dashboard | `/marketing/dashboard` | `MarketingController` (47 endpoints — contains dashboard, visits, plans, reports) |
| Visits + follow-ups | `/marketing/visits`, `/marketing/follow-ups`, `/marketing/follow-ups/extensions/new` | `MarketingVisitActivityController`, `MarketingVisitService` |
| Calendar | `/marketing/calendar` | `MarketingCalendarController` |
| Expenses | `/marketing/expenses`, `/expenses/new`, `/expenses/:id/edit` | `ExpenseTripController` (17) + `ExpenseTripService` |
| Travel planners | `/marketing/travel-planners` | `TravelPlanController` (24) + `TravelPlanService` |
| Map / location tracking | `/marketing/map`, `/marketing/locations/:type/:id` | `MarketingMapController` (12), `MarketingMapController`, `MarketingLocationTrackingController` |
| Q Forms | `/marketing/q-forms` | `QuestionnaireFormController` (14) — entity `PlantContact` (`qform_plant_contacts`) **[OPEN: ownership, §13]** |
| Settings | `/marketing/settings` | `MarketingSettingsController` (`/settings/marketing`) |

### 2.3 Sales — main module and submodules **[VERIFIED]**

| Submodule | Frontend | Backend (owner) |
|---|---|---|
| Sales Dashboard | `/sales` dashboard page | `SalesDashboardController/Service` (Dashboard module today) |
| CRM | `/crm`, `/leads`, `/clients`, `/contacts`, `/followups`, `/leads/pipeline` | **`com.vishatech.erp.crm.*`** — 55 classes, 78 endpoints, 8 tables (extracted in the previous phase) |
| CPR | `/cprs`, `/cprs/reports`, `/cpr/technical-verification`, `/pr-references` | `Cpr*`/`PrReference*` — 39 classes, 34 + 20 + 5 endpoints |
| Sales Execution | `/quotations`, `/sales-orders`, `/sales-contracts`, `/proforma-invoices`, `/delivery-challans`, `/invoices`, `/payment-receipts`, `/credit-notes`, `/record-revisions`, `/history` | `QuotationService` (17 repositories), `SalesOrderService`, `SalesContractService`, `ProformaInvoiceService`, `DeliveryChallanService`, `InvoiceService`, `PaymentReceiptService`, `CreditNoteService`, `SalesOrderEAction*`, `RecordRevision*`, `EditHistory*` — 120 classes |
| Cost/Profit Workout | `/cost-workouts`, `/profit-workouts`, `/cost-workouts/design` | `CostWorkout*`, `ProfitWorkout*`, `ExchangeRate*` — 41 classes (**classified as `accounts` in this audit; the UI groups them under Sales — [OPEN, §13]**) |
| Documents | `/documents`, `/documents/:id/preview`, `/packing-lists/design` | `DocumentRepositoryService`, `DocumentPermissionService`, `DocumentModuleScope`, `DocumentSettingsService`, `DocumentBackfillService`, `DocumentReconciliationService`, `FileStorageService`, `PdfGenerationService` — 38 classes |
| Sales Reports | `/sales-reports`? (route list shows `/sales/reports` API only) | `SalesReportController/Service` (reads 8 sales repositories + `crm.entity.Customer`) |
| Sales Settings | `/settings/sales` | `SalesSettingsController` |

### 2.4 Purchase **[VERIFIED]**

66 backend classes — **10** controllers, **159** endpoints — 132 frontend routes, **11** submodule folders under `src/purchase/pages/`. Features that exist, from the route tree and controllers:

| Submodule | Route prefix | Backend |
|---|---|---|
| Dashboard | `dashboard` | `PurchaseDashboardController` + `PurchaseDashboardStatsService` (7 purchase repositories) |
| Work Queue | `work-queue` | `PurchaseWorkQueueController` + `PurchaseWorkQueueService` (6 purchase repositories/entities) |
| Purchase Requisition | `requisition/**` (incl. `approval`, `tech-spec`, `timeline`, `activity`, `360`) | `PurchaseRequisitionController` (25) |
| Vendor Management | `vendors/**` (incl. `performance`, `documents`, `approval`, `timeline`) | `PurchaseVendorController` (13) |
| RFQ & Quotations | `rfq/**` (incl. `approval`, `negotiation`, `compare`, `quotations`, `technical-evaluation`, `price-comparative-statement`) | `PurchaseRfqController` (35) + `PurchaseRfqFollowUpController` (8) |
| Purchase Orders | `orders/**` (incl. `acknowledgement`, `approval`, `released`) | `PurchaseOrderController` (15) |
| Logistics | `logistics/**` (grn, inventory, manufacturing, quality, shipment) | `PurchaseReceivingController` (31) |
| Purchase Invoice | `invoices/**` (incl. `three-way-matching`, `payment-approval`, `payment-advice`, `vendor-payment`, `notes`) | `PurchaseInvoiceController` (18) + `PurchaseAdjustmentNoteController` (10) |
| Documents / Reports / Settings | `documents`, `reports/**`, `settings/**` (17 settings screens) | served by the same controllers |

Approvals, releases, acknowledgements, GRNs, inspections, matching and payments are all present as routes and endpoints — nothing in this list is hypothetical.

### 2.5 Production **[VERIFIED]**

160 backend classes, **20 controllers** (18 under `controller/production/` plus `QualityInspectionController` and `ProductionTrackerController`), **217 endpoints**, 55 frontend routes.

| Submodule | Route | Backend |
|---|---|---|
| Production / entry | `entry` | `ProductionEntryController`, `ProductionTracker*` |
| Production Orders | `orders/**` | `ProductionOrderController` (29) + `ProductionOrderService` |
| Technical Verification | `technical-verification/**` | `TechnicalVerificationController` (12) + `TechnicalVerificationService` |
| Drawings | `drawings/**` | `DrawingController` (18) + `DrawingService` |
| Models | `models/**`, `model-viewer/:id` | `ModelController` (23) + `ModelService`; `production/modelviewer/**` |
| Casting | `casting/**` | `CastingController` (14) |
| Fabrication | `fabrication/**` | `FabricationController` (11) |
| Machine Shop | `machine-shop/**`, `machines`, `work-centers` | `MachineShopController` (11) |
| Assembly | `assembly/**` | `AssemblyController` (11) |
| Quality | `quality/**` | `QualityInspectionController` (14) |
| Packing | `packing/**` | `PackingListController` (7) |
| Dispatch | `dispatch/**` | `DispatchController` (7) |
| Acknowledgement | `acknowledgement` | `AcknowledgementController` (3) |
| Reports | `reports/**` (summary, delay-analysis, machine-utilization, material-consumption, department-efficiency) + `kpi/:module/:kpiKey` | `ProductionReportController` (5), `ProductionKpiController` (2) |
| Settings | `settings`, `status-masters`, `parameters`, `users-roles` | `ProductionSettingsController` (14) |
| CAD integration | model viewer / conversion | `com.vishatech.erp.cad.*` (13) + `com.vishatech.cadworker.*` (6) + `CadConversionJobService` |

---

## 3. Internal feature inventory (backend, by capability)

| Capability | Controllers (endpoints) | Notable services |
|---|---|---|
| Auth / users / notifications / settings | `AuthController` (5), `UserController` (2), `NotificationController` (6), `SettingsController` (4), `GridConfigController` (3), `MasterController` (4), `LocationController` (28), `ProductController` (1), `HealthController` (1) | `CustomUserDetailsService`, `JwtService`, `NotificationService`, `MasterValueService`, `LocationMasterService` |
| CRM | `crm/controller/*` (78) | `CustomerService`, `LeadService`, `ContactService`, `FollowUpService` |
| Sales execution | `QuotationController` (33), `SalesOrderController` (39), `SalesContractController` (30), `ProformaInvoiceController` (28), `DeliveryChallanController` (24), `InvoiceController` (25), `PaymentReceiptController` (21), `CreditNoteController` (24), `RecordRevisionController` (1), `EditHistoryController` (2) | the matching 9 services |
| CPR / engineering | `CprController` (34), `CprTechnicalVerificationController` (20), `PrReferenceController` (5), `CostWorkoutController` (24), `ProfitWorkoutController` (23), `ExchangeRateController` (2) | `CprService`, `CprTechnicalVerificationService`, `CostWorkoutService`, `ProfitWorkoutService` |
| Documents / files | `DocumentRepositoryController` (21), `FileController` (2) | `DocumentRepositoryService`, `FileStorageService` (25 importers), `AttachmentStorageService`, `AttachmentStorageLedgerListener` |
| Marketing | `MarketingController` (47), `TravelPlanController` (24), `ExpenseTripController` (17), `QuestionnaireFormController` (14), `MarketingMapController` (12), `MarketingVisitActivityController` (6), `MarketingLocationTrackingController` (4), `MarketingCalendarController` (3), `MarketingSettingsController` (3) | `MarketingVisitService`, `MarketingMapService`, `TravelPlanService`, `ExpenseTripService` |
| Purchase | 10 controllers, **159** endpoints | `PurchaseDashboardStatsService`, `PurchaseWorkQueueService`, `PurchaseSupportService`, `PurchaseRfqService` |
| Production | 20 controllers, **217** endpoints | `ProductionOrderService`, `TechnicalVerificationService`, `ProductionKpiService`, the 8 shop-floor services |
| Dashboard / cross-cutting reads | `DashboardController` (1), `SalesDashboardController` (1), `SalesReportController` (1), `ApprovalSummaryController` (1) | `DashboardService`, `SalesDashboardService`, `SalesReportService`, `ApprovalSummaryService` |

---

## 4. Frontend-to-backend mapping

| Frontend route (page) | API service / client | Backend base path | Owner |
|---|---|---|---|
| `/dashboard` (`pages/Dashboard.jsx`) | `api/axiosInstance` inline | `/dashboard/stats`, `/marketing/dashboard` | Dashboard + Marketing |
| `/sales/dashboard` | `services/salesDashboardService.js` | `/sales/dashboard` | Dashboard (reads Sales/CRM/CPR/Production) |
| `/marketing/dashboard` | `services/marketingService.js` | `/marketing/dashboard` | Marketing |
| `purchase → dashboard` | `purchase/services/dashboard.js`, `hooks/usePurchaseDashboard.js` | `/api/purchase/dashboard/stats`, `/api/purchase/invoices/three-way-matching`, `/api/purchase/invoices/vendor-payment`, `/api/purchase/orders`, `/api/purchase/requisition/approval` | Purchase |
| `purchase → work queue` | `purchase/services/workQueue.js` | `/api/purchase/work-queue*` | Purchase |
| `production → dashboard/KPI` | `production/data/dashboard.js`, `production/pages/ProductionDashboard.jsx` | `/production-kpi/{module}/counts` **and** per-module lists (`/production/casting`, `/production/dispatch`, `/production/fabrication`, `/production/orders`, `/production/packing`, `/production/quality`) | Production |
| `/crm`, `/leads`, `/clients`, `/contacts`, `/followups` | `services/{lead,customer,contact,followUp}Service.js` | `/leads`, `/customers`, `/contacts`, `/followups` | CRM |
| `/cprs`, `/cpr/technical-verification` | `services/{cpr,prReference,technicalVerification}Service.js` | `/cprs`, `/cpr-technical-verifications`, `/pr-references` | CPR |
| `/quotations`…`/credit-notes` | `services/{quotation,salesOrder,salesContract,proformaInvoice,deliveryChallan,invoice,paymentReceipt,creditNote}Service.js` | one base path per document type | Sales |
| `/cost-workouts`, `/profit-workouts` | `services/{costWorkout,profitWorkout,exchangeRate}Service.js` | `/cost-workouts`, `/profit-workouts`, `/exchange-rates` | accounts (UI: Sales) |
| `/documents` | `services/{document,documentSettings,gridConfig}Service.js` | `/documents`, `/settings/*` | Documents |
| `/marketing/**` | `services/{marketing,marketingSettings,map,route,geocoding}Service.js` | `/marketing/**` | Marketing |
| `purchase → requisition/rfq/orders/logistics/invoices/vendors/settings/reports` | `purchase/services/*.js` (845 URL references) | `/api/purchase/**` | Purchase |
| `production → shop floor/drawings/models/packing/dispatch` | `production/services/*.js` (275 URL references) | `/production-*`, `/drawings`, `/models`, `/packings`… | Production |

**[MEASURED]** URL references by module prefix across `src/services`, `src/pages`, `src/purchase/**`, `src/production/**`: `purchase` 845, `production` 275, `marketing` 171, `cprs` 105, `quotations` 79, `leads` 72, `cost-workouts` 53, `sales-orders` 52, `profit-workouts` 50, `followups` 50, `dashboard` 31, …

---

## 5. Module dependency matrix

### 5.1 Method and its limits **[MEASURED]**

- Every `*.java` under `src/main/java/com/vishatech` is assigned to a module by **package path ∪ class-name prefix** (the rule table is reproduced in §5.3 so it can be re-run and adjusted).
- An edge `A → B` is counted **per importing source file** that contains `import com.vishatech.…` of a type owned by `B` (own-package references need no import and are therefore *not* counted).
- Blind spots: wildcard imports (`import com.vishatech.erp.entity.*;` — 16 files, frozen by `SourceHygieneTests`), reflection, bean-name strings, `@PreAuthorize` strings, and Spring Data derived queries declared in an interface of another module. The ArchUnit suite covers the bytecode view (`ModuleBoundaryTests`, 16 rules) and agrees with the matrix on every edge spot-checked.

### 5.2 Matrix (files importing another module's types)

Rows = importer, columns = imported module **[MEASURED]**:

```
FROM\TO        accounts  admin   cad   cpr   crm  dash  docs  mktg  notif  plat  prod  purch  sales
accounts              .      2     .     6     4     .     .     1      .    18     .      .      4
admin                 3      .     .     2     5     .     3     2      .    16     .      .     13
cad                   .      .     .     .     .     .     .     .      .     .    14      .      .
cpr                  14      .     .     .     8     .     4     .      .    12    11      1      .
crm                   .      1     .     .     .     .    16     .      .    18     .      .     13
dashboard             .      5     .     2     6     .     .     .      .    14    16      .      8
documents             .      7     .     .    18     .     .     .      .    17     1      .      2
marketing             .     22     .     .    10     .     4     .      .    26     .      .      .
notifications         .      .     .     .     .     .     .     .      .     2     .      .      .
platform              .     13     .     .    11     1     .     .      .     .     .      .      .
production            .      4    14     .     .     .     3     .      .    47     .      .     10
purchase              .      4     .     .     .     .     1     .      8    29     2      .      .
sales                 .      4     .     5    15     .     9     .      .    72     8      .      .
```

Module sizes (main sources): production 160, sales 120, marketing 89, purchase 66, crm 55, platform 43, accounts 41, admin 40, cpr 39, documents 38, cad 21, dashboard 9, notifications 7.

### 5.3 Classification rules used (reusable, adjust as needed) **[VERIFIED as a convention]**

`crm` = `…/crm/**` ∪ `Activity|Note|TimelineEntry|HistoryEntry` (+ their repositories — the Lead child tables, see §8.5); `cad` = `cadworker/**` + `erp/cad/**` + `CadWorker*`; `platform` = `security/**`, `exception/**`, `util/**`, `config/**` + shared DTOs (`ApiResponse`, `BulkRequest`, `StatusRequest`, `ChangeRoleRequest`, `Conversion*`, `RevisionInfo`, `LoginRequest`, `RefreshToken*`, `RevisionSupport`); `marketing` = `Marketing*`, `ExpenseTrip*`, `TravelPlan*`, `VisitChangeHistory*`, `MapLocation*`, `FinancialSettings*`, `Questionnaire*`, `Plant*`, `QForm*`; `purchase` = `Purchase*|Vendor*|Logistics*|Grn*|WorkQueue*`; `production` = `Production*|Packing*|Dispatch*|Drawing*|Model*|Casting*|Fabrication*|MachineShop*|Assembly*|Quality*|TechnicalVerification*|Integration*|Acknowledgement*|CadConversion*` ∪ `**/production/**`; `cpr` = `Cpr*|PrReference*`; `sales` = `Quotation*|Sales*|ProformaInvoice*|DeliveryChallan*|Invoice*|PaymentReceipt*|CreditNote*|RecordRevision*|EditHistory*`; `accounts` = `CostWorkout*|ProfitWorkout*|ExchangeRate*|CwMasterData*`; `documents` = `Document*|File*|Attachment*|Upload*|Pdf*`; `admin` = `Master*|Location*|Settings*|User*|GridConfig*|Product*|AppSetting*|City*|Country*|District*|StateRegion*`; `notifications` = `Notification*`; `dashboard` = `Dashboard*|Approval*|Health*|Auth*`.

### 5.4 Edges that matter most

| Edge | Count | What it is | Verdict |
|---|---|---|---|
| `dashboard → production / sales / crm / admin / cpr / platform` | **16 / 8 / 6 / 5 / 2 / 14** | the dashboard family reads 5 other modules' repositories, entities, DTOs and services directly — ~45 distinct foreign internal types (§6) | **the priority boundary violation** |
| `documents → crm` | 18 | document backfill/visibility walks customers, leads, follow-ups | legitimate need, wrong access path |
| `platform → crm` / `platform → admin` | 11 / 13 | `config/**` seeders and runners write business tables directly | **violation** (seeders are dev/demo code) |
| `sales → crm` / `crm → sales` | 15 / 13 | currency + duplicate lookup one way; customer statement the other | cycle — needs a query port on each side |
| `sales → production` / `production → sales` | 8 / 10 | packing/processing reads one way; `SalesOrder` + `SalesAttachment` the other | cycle — see §8.4 |
| `cpr → accounts` / `accounts → cpr` | 14 / 6 | cost workout ↔ CPR conversions | cycle (pre-existing, documented) |
| `marketing → admin` | 22 | app settings, location tracking, settings audit log | mostly legit, should be narrowed |
| `marketing → crm` | 10 | customer/lead reads **and** writes (`MarketingVisitService` saves `Lead`/`FollowUp`) | violation — writes must become a CRM command |
| `production → cad` / `cad → production` | 14 / 14 | engine abstraction over the model projection + the conversion queue | deliberate, keep |
| `purchase → production` | 2 | two audit enums (`AuditAction`, `AuditModule`) | tiny, fix by moving the enums to shared |
| `crm → documents` | 16 | attachments + document visibility | keep (shared attachment primitive) |

---

## 6. Shared infrastructure inventory **[VERIFIED]**

| Concern | Classes (current location) | Who uses it |
|---|---|---|
| Identity, JWT, permissions | `security/*` (10), `entity.User`, `entity.UserRole`, `repository.UserRepository`, `config.SecurityConfig`, `config.StompJwtInterceptor` | everything |
| Errors | `exception/*` (6) | 100+ references |
| Audit context | `util.AuditContext` (29 files) | controller/service/security |
| File storage & attachments | `service.FileStorageService` (25 importers), `service.AttachmentStorageService`, `service.AttachmentStorageLedgerListener`, `entity.AttachmentStorageUsage` + repo, `config.{UploadStorageConfig,UploadSizeGateFilter,AttachmentStorageReconciliationJob}`, `util.UploadStreams` | CRM, CPR, Sales, Purchase, Production, Marketing |
| Document repository | `service.DocumentRepositoryService` (19), `DocumentPermissionService`, `DocumentModuleScope`, `DocumentSettingsService`, `DocumentVisibility`, `FileStorageService` | every document-owning module |
| Revision / edit history | `service.EditHistoryService`, `entity.EditHistory`, `RecordRevision*` | sales documents, CRM |
| Notifications | `entity.Notification`, `repository.NotificationRepository`, `service.NotificationService`, `controller.NotificationController`, `config.NotificationScheduler` | Purchase (8), Sales, dashboard |
| Numbering | **no shared service** — per-document sequences; `util.PurchaseNumbering`/`PurchaseTotals` are Purchase-specific but sit in `util` | — |
| Master data | `MasterValueService`, `LocationMasterService`, `MasterController`, `LocationController`, `City/Country/District/StateRegion` | Sales, CRM, CPR, Marketing, Purchase |
| Grid/JSON column helpers, audit enums | `util.*`, `entity.production.{AuditAction,AuditModule}` | multiple |
| CAD engine + worker | `cad/*` (13), `cadworker/*` (6) | Production only |

**Legitimate shared**: errors, security, audit context, file/attachment storage, notifications, documents, masters.
**Not shared but sitting in shared packages**: the four `config/*Seeder` classes + `ContactBackfillRunner` (they write business tables), `util.PurchaseNumbering`/`PurchaseTotals` (Purchase), `PdfGenerationService` (document rendering for Sales/Production/Purchase), the Lead child tables `Activity/Note/TimelineEntry/HistoryEntry` (CRM).

---

## 7. Existing boundary violations (all currently frozen by tests)

`ModuleBoundaryTests` carries **16** rules and **7** explicit allow-lists — **47** allowed class entries in total (19 CRM-internals readers + 1 CRM→sales + 7 controllers→repositories + 8 entities→services + 5 production→flat + 5 outside→production + 2 marketing→CRM/sales) **[VERIFIED]**:

| Frozen boundary | Allow-listed violators | Why it exists |
|---|---|---|
| `outside → CRM internals` | **19** classes (dashboards, masters, Sales, CPR, Marketing, documents, seeders) | CRM entity/repository access from outside |
| `CRM → sales document chain` | **1** class (`CustomerService`, customer statement) | statement renders invoices/payment receipts |
| `controllers → repositories` | **7** controllers (Dashboard, ExpenseTrip, File, Product, QuestionnaireForm, RecordRevision, User) | layering bypass |
| `entities → services` | **8** attachment entities via `@EntityListeners(AttachmentStorageLedgerListener)` | deliberate ledger update inside the writing transaction |
| `production services → flat persistence` | **5** classes (220 edges) | production reads `SalesOrder`/attachments/settings through flat packages |
| `outside → production persistence` | **5** classes (77 edges: `DashboardController`, `PdfGenerationService`, `PurchaseSupportService`, `SalesDashboardService`, `CadConversionJobService`) | dashboards/reports read production tables |
| `marketing → CRM/sales` | **2** services (87 edges) | `MarketingVisitService` writes leads/follow-ups |

### 7.1 The dashboard violation in numbers **[VERIFIED]**

The dashboard family (the 8 `*Dashboard*`/`*WorkQueue*` classes, 10 with `ApprovalSummary*`) imports **47 distinct types from other modules' internals** — production **19**, sales **14**, crm **7**, cpr **4**, platform/DTO **2**, other **1** — plus 15 purchase-owned types that the Purchase dashboards legitimately use:

- **production** (19 types, 16 importing files): `ProductionEntryRepository`, `repository.production.PackingListRepository`, `ProductionTrackerRepository`, `QualityInspectionRepository`, `QualityInspectionService`, `DispatchService`, `DrawingService`, `ModelService`, `PackingListService`, `ProductionOrderService`, `TechnicalVerificationService`, 6 `dto.production.*StatsDTO`, `EntryStatus`, `ProductionType`
- **sales** (14 types, 8 importing files): the 8 document repositories + `Quotation`, `SalesOrder`, `SalesContract`, `Invoice`, `PaymentReceipt`
- **crm** (7 types, 6 importing files): `CustomerRepository`, `FollowUpRepository`, `LeadRepository`, `Lead`, `LeadStage`, `LeadStatus`, `FollowUp`
- **admin** (5 importing files): `UserRepository`, `User`, `UserRole`, `UserResponse`
- **cpr** (4 types, 2 importing files): `CprRepository`, `CprTechnicalVerificationRepository`, `CprTechnicalVerificationService`, `Cpr`
- **platform** (2 types, 14 importing files): `ApiResponse`, exceptions, `RateLimiter`, auth DTOs

### 7.2 Production ⇄ Sales — the dependency specifically asked about **[VERIFIED]**

Still present, in two places:

1. `service/production/ProductionOrderService.java` — imports `entity.SalesOrder` (line 5) and `repository.SalesOrderRepository` (line 8), injects the repository (line 43), resolves it (line 105 `resolveCpo(...)`) and copies exactly **two values** onto the production order: `order.setSalesOrderId(String.valueOf(cpo.getId()))` (line 107) and `order.setSalesOrderNumber(cpo.getSoNo())` (line 108). `ProductionOrder` stores both as plain columns — there is **no JPA association**.
2. `service/production/ProductionAttachmentService.java` — imports `dto.SalesAttachmentResponse` (line 3), `entity.SalesAttachment` (line 4), `repository.SalesAttachmentRepository` (line 6); injects the repository (line 25) and reuses the Sales attachment table with the `moduleType`/`moduleId` pattern.

Both are frozen (`production_services_do_not_depend_on_flat_persistence`, `outside_does_not_depend_on_production_persistence`). Neither changes business behaviour if replaced by a narrow port: the first needs only "id + soNo by (id | number)", the second needs the attachment API it already shares.

---

## 8. Existing tests, build and CI (baseline)

| Gate | Command | Result |
|---|---|---|
| Backend full verification | `cd erp-backend && ./mvnw -B -o verify` | **PASS — BUILD SUCCESS, `Tests run: 494, Failures: 0, Errors: 0, Skipped: 0`, 4:16 min** (measured on this working tree during the CRM phase; no source file changed after that run) |
| Architecture guard | `-Dtest=ModuleBoundaryTests,SourceHygieneTests` | **PASS — 17 tests** (16 ArchUnit rules + 1 source-hygiene test) |
| CAD worker persistence contract | `-Dtest=CadWorkerPersistenceUnitTests` | **PASS — boots the worker context on H2 and asserts the entity scan** |
| Frontend production build | `npm run build` (Vite 8.2.0 / rolldown) | **PASS — `✓ built in 9.33s`, 3277 modules transformed**, `dist/` produced |
| CI | `.github/workflows/ci.yml` | frontend job: Node 22 → `npm ci` → `npm run build`; backend job: JDK 21 (temurin) → `./mvnw -B verify`. No MySQL/secrets needed (test profile is H2) |

**Pre-existing failures: none found.** Pre-existing *warnings* (not failures, worth knowing): 34 Hibernate DDL warnings during test schema creation (H2 tolerates an index/column mismatch), Spring Security's `UserDetailsService` notice, Mockito/ByteBuddy self-attachment and `sun.misc.Unsafe` warnings, and four frontend build warnings (chunk size > 500 kB, "ineffective dynamic import" for `purchase/services/purchaseOrder.js`, and `path`/`crypto` externalised by `occt-import-js`).

**Test coverage by area** (79 classes): `security` (API + authz tests, incl. `CrmApiTest`, `ContactsApiTest`, `SalesExecApiTest`), `service` (conversion, numbering, limits, mirrors), `api` (per-module API tests), `production`, `purchase`, `performance` (query-count and scalability assertions — **these constrain any refactor of read paths**), `architecture`, `crm`? (none — CRM's tests live in `security`/`service`), `cad`.

---

## 9. Proposed target package structure **[PROPOSED]**

One Spring Boot application, one component-scan root (`com.vishatech.erp`), no new ports — module packages only.

```
com.vishatech.erp
├── platform/                 # shared infrastructure, no business rules
│   ├── security/  audit/  error/  config/  notify/  files/  masters/  numbering/
├── crm/                      # DONE (entity, repository, service, controller, dto)
├── dashboard/                # aggregation + presentation only
│   ├── web/                  # DashboardController, SalesDashboardController, ApprovalSummaryController
│   ├── service/              # DashboardService, SalesDashboardService, ApprovalSummaryService
│   └── port/                 # the interfaces it consumes (see §10)
├── sales/{execution,dashboard,reports,settings}
├── cpr/       accounts(cost/profit workout)
├── marketing/
├── purchase/{requisition,rfq,orders,logistics,invoices,vendors,workqueue,settings}/ (already partially structured)
├── production/{orders,verification,drawings,models,shopfloor,quality,packing,dispatch,reports,settings}/
├── documents/
└── cad/ + com.vishatech.cadworker/   (unchanged)
```

Each module eventually exposes `api` (interfaces + DTOs) and keeps `entity`/`repository` internal. Migration is per module, one at a time, `git mv` + import fixes, exactly as CRM was moved — with the guard extended in the same change so coverage never drops.

---

## 10. Proposed module-boundary rules **[PROPOSED]**

**Ownership**

| Capability | Owner |
|---|---|
| Customers, leads, contacts, follow-ups (+ their child tables) | `crm` |
| Quotation → Sales Order → Contract → Proforma → DC → Invoice → Receipt → Credit Note, sales reports/settings | `sales` |
| CPR, PR references, technical verification | `cpr` |
| Cost/Profit workout, exchange rates | `accounts` |
| Marketing visits, plans, expenses, travel, calendar, map, settings | `marketing` |
| Requisition, RFQ, PO, logistics/GRN/inventory/quality/shipment, purchase invoices, vendors, work queue | `purchase` |
| Production orders, drawings, models, shop floor, quality, packing, dispatch, KPI/reports | `production` |
| Document repository, visibility, permissions, file storage, attachments | `documents` / `platform.files` |
| Users, masters, locations, settings, grid config, notifications | `platform` / `admin` |
| Aggregation + presentation for all dashboards | `dashboard` (owns no business table) |

**Allowed / prohibited**

1. A module may use another module only through its **`api` package** (interfaces + DTOs) or an already-approved read port.
2. No module may import another module's `entity` or `repository` package — the existing allow-lists only ever **shrink**.
3. `dashboard` owns **no** repository and **no** entity: it consumes ports. It may keep its own DTOs and controllers.
4. `platform` never depends on a business module (the four seeders + `ContactBackfillRunner` move to `platform.seed`/owning module and call module APIs).
5. Cardinality rules: `purchase` must not read `sales`/`crm`; `crm` must not read `purchase`/`marketing`/`production`; `production` must not read `crm`; writes across modules go through commands, never repositories.
6. Cycles must disappear by direction, not by tolerance: `sales↔crm`, `sales↔production`, `crm↔documents`, `admin↔documents`, `admin↔marketing`, `cpr↔accounts` each need one side to become a port.
7. Shared infrastructure access follows §6 — new shared services are added only when at least two modules genuinely need them.
8. Every exception is an explicit, reviewed allow-list entry with a documented reason, and the ArchUnit suite fails the build on any new violation.

**How this is enforced:** extend `ModuleBoundaryTests` (already in the build, runs on every `./mvnw test`/`verify`) with package-based module rules once each module owns a package; keep the frozen allow-lists as the migration burn-down list.

---

## 11. Phased implementation plan **[PROPOSED]**

| # | Phase | Content | Why this order |
|---|---|---|---|
| 0 | Foundation | **Done**: ArchUnit guard + `SourceHygieneTests` + CAD-worker persistence test; CRM extracted | the guard is what makes the rest safe |
| 1 | **Dashboard** | Give `dashboard` its own package; introduce the ports it needs — `SalesMetricsPort` (document counts/amounts by type), `CrmMetricsPort` (lead stage/status counts, follow-up counts), `ProductionMetricsPort` (the 6 `*StatsDTO` + production entry counts), `CprMetricsPort`, `AdminUserPort`. Thin adapters live **in the owning module** and delegate to the existing repositories/queries, so SQL and transactions are unchanged. Then delete the corresponding entries from the two production allow-lists. | biggest fan-out (45 foreign types), smallest module (10 classes), zero schema risk, and it unblocks the dashboards of four modules |
| 2 | Marketing | Extract `marketing` package; replace `MarketingVisitService`'s direct `Lead`/`FollowUp` writes with a CRM command; narrow `marketing → admin` | second-largest violation set (writes into CRM) |
| 3 | CRM leftovers | Move `Activity`/`Note`/`TimelineEntry`/`HistoryEntry` (+ repositories) into `crm.entity`; keep `CadWorkerConfiguration`'s scan in sync (guarded); replace CRM's `Invoice`/`PaymentReceipt` statement read with a sales-side port or move the statement to `accounts` | finishes the module already started |
| 4 | Sales submodules | `sales.execution`, `sales.reports`, `sales.settings`; introduce `CustomerLookupPort` usage instead of CRM repositories; break `sales↔production` with a `SalesOrderLookupPort`, symmetric with §7.2 | the sales chain is one module in practice (17 repositories in `QuotationService`) |
| 5 | Purchase | Package the 12 controllers by submodule; move the two production audit enums to shared; keep `/api/purchase/**` untouched | self-contained, only 2 foreign edges |
| 6 | Production | Package the 19 controllers; introduce `SalesOrderLookupPort`/attachment port usage; split the 220-edge flat-persistence read behind a read model | largest module, most dangerous (CAD worker + entity graph) |
| 7 | Documents / accounts / admin / platform | Documents as a module with its own visibility API; seeders into `platform.seed` calling module APIs; masters read through ports | cross-cutting, best done once the consuming modules are packaged |
| 8 | Final enforcement | Flip remaining allow-lists to empty where possible; add module rules per package; full `verify` + frontend build + worker check | — |

**Per-module recipe (unchanged from the CRM phase):** measure fan-in → move with `git mv` → fix imports (compiler-driven) → keep Spring/JPA scanning verified (`CadWorkerPersistenceUnitTests` is the canary for entity packages) → extend the guard so no coverage is lost → run focused tests → full `./mvnw verify` → record remaining coupling.

---

## 12. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Dashboard refactor changes a number or a payload shape — `GET /dashboard/stats` feeds a single page that mixes modules; the response DTO must stay byte-compatible | **High** | ports return the *existing* DTOs and delegate to the *existing* queries; assert with existing + new focused tests; no arithmetic touched |
| 2 | `performance/ReadPathQueryCountTests` and `SalesDashboardAggregationTests` pin query counts — a port that adds a round trip or changes fetch semantics fails them | **High** | report reads must delegate to the same repository call; run those tests after every dashboard change |
| 3 | Package moves break the CAD worker's entity scan (proved: `Association 'Activity.lead' targets … which does not belong to the same persistence unit`) | **High** | `CadWorkerPersistenceUnitTests` fails the build; update `@EntityScan` in the same change |
| 4 | Wildcard imports (16 files) hide cross-module edges; a move will not compile cleanly and may look unrelated | Medium | `SourceHygieneTests` freezes the set; the compiler is the arbiter |
| 5 | Bidirectional edges (`sales↔crm`, `sales↔production`, `crm↔documents`, `cpr↔accounts`) cannot be fixed from one side | Medium | sequence the two halves in adjacent phases; ports live in the *consuming* module |
| 6 | Route-prefix inconsistency (`/api/purchase/**` vs module-rooted) invites accidental "normalisation" | Medium | recorded in §1.4 as forbidden; routes are part of the frozen API contract |
| 7 | `MarketingController` (47 endpoints) mixes dashboard, plans, visits and reports — extracting it is a behaviour-sensitive split | Medium | split by URL prefix, not by rewriting handlers; API tests must stay green |
| 8 | Master-data "in use" checks fan into 12–13 repositories (`MasterValueService`, `LocationMasterService`) | Medium | leave in place; introduce a usage port per module later |
| 9 | `ddl-auto=validate` against the live MySQL schema is unverified here (no client) | Medium | do not touch entities in a way that alters columns; verify schema before entity moves in production |
| 10 | Frontend build has pre-existing warnings; new warnings would be hard to attribute | Low | compare `npm run build` output before/after per phase |

---

## 13. Unresolved questions **[OPEN]**

1. **Q Forms ownership** — the route lives under `/marketing/q-forms`, the controller is `QuestionnaireFormController`, the entity is `PlantContact` (`qform_plant_contacts`), and the DTOs reference CRM `Contact`. Marketing or CPR/engineering?
2. **Cost/Profit Workout ownership** — this audit classifies them as `accounts`; the UI groups them under Sales (`/cost-workouts`, `/profit-workouts`). Which is authoritative?
3. **`SalesReportService` / `SalesDashboardService` ownership** — reports of Sales data: `sales.reports` or `dashboard`?
4. **`EditHistory` / `RecordRevision`** — shared revision infrastructure, or part of `sales`?
5. **Dashboard ports vs shared read model** — do we introduce per-consumer ports (more interfaces, clearer ownership) or one shared read model for all dashboards? This audit proposes per-consumer ports because the dashboard already needs module-specific shapes.
6. **Numbering** — there is no shared numbering service; Purchase has `util.PurchaseNumbering`. Should numbering become `platform.numbering`?
7. **Test baseline scope** — the guard's allow-lists were measured on `93a76c3`+working tree; if the tree is committed first, the counts should be re-measured and frozen as the baseline for later phases.

---

## 14. What Phase 1 did not do

- No source file was modified, moved, renamed or reformatted (verified: `git status` shows the same 47 renames / 50 modified / 6 untracked as before this audit; no new source files).
- No test was added or changed.
- Nothing was committed.
- Only two derived artifacts were produced for this audit: this document, and a temporary measurement output under `erp-backend/target/` (git-ignored build output).

**Awaiting review** of §10 (rules) and §11 (order) before any implementation starts — per the task, Phase 2/3 must not begin automatically.
