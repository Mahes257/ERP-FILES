# Dashboard Modular Refactor — Verified Plan

**Status:** planning only. **No source file was modified, moved, renamed, created or deleted** by this task.
The only file this task produces is this document.

**Repository:** `C:\Users\Mahes\Desktop\Sri\erp-react`
**Inputs:** `MODULAR_MONOLITH_COMPLETE_AUDIT.md` (§7 boundary violations, §8 baseline, §9 target structure, §10 rules, §11 order, §12–13 risks/open questions), `MODULAR_MONOLITH_FOUNDATION.md`, `CRM_MODULE_REFACTOR.md`.
**Scope:** the Dashboard aggregation surface (`/dashboard/stats`, `/sales/dashboard`) and its direct backend dependencies. Purchase's own dashboards are inspected only to confirm they are already compliant.

**Method.** Every claim below was re-derived from the working tree today: imports were read per file, every cross-module call site was located by line number, the frozen ArchUnit allow-lists were read from source, and the regression detectors were executed. Where the audit's numbers and my re-measurement disagree, §2.3 states both and explains the difference.

---

## 1. Verified dashboard surface

### 1.1 The two endpoints under refactor

| Endpoint | HTTP layer | Aggregation | Payload type | Authorization |
|---|---|---|---|---|
| `GET /dashboard/stats` | [DashboardController.java](erp-backend/src/main/java/com/vishatech/erp/controller/DashboardController.java) (184 lines) | [DashboardService.java](erp-backend/src/main/java/com/vishatech/erp/service/DashboardService.java) (251) | `LinkedHashMap` seeded from [DashboardStats.java](erp-backend/src/main/java/com/vishatech/erp/dto/DashboardStats.java) (208 lines, 84 components) + **61 `put()` keys** added in the controller | `@PreAuthorize("isAuthenticated()")` (class level) |
| `GET /sales/dashboard` | [SalesDashboardController.java](erp-backend/src/main/java/com/vishatech/erp/controller/SalesDashboardController.java) (42) | [SalesDashboardService.java](erp-backend/src/main/java/com/vishatech/erp/service/SalesDashboardService.java) (657) | `Map<String,Object>` with top-level keys `counts`, `values`, `pipeline`, `trend`, `cposRecent`, `topCustomers`, `activities`, `alerts` | `@PreAuthorize("hasAuthority('SALES_VIEW')")` (class level) |

`/dashboard/stats` renders the global Dashboard page ([Dashboard.jsx](src/pages/Dashboard.jsx#L46), which also calls `/marketing/dashboard`); `/sales/dashboard` renders the Sales Dashboard page through [salesDashboardService.js](src/services/salesDashboardService.js). Both consumers read the payload **by key**, so the key names and value semantics are a frozen contract.

**Aggregation surface size:** 4 code files, 1,134 lines, plus the payload record (208 lines) = **5 files, 1,342 lines**. `DashboardService.getStats()` is the only caller of the payload record; `DashboardController` is its only HTTP consumer.

### 1.2 The rest of the "dashboard family" is already compliant

A name-prefix scan finds 10 dashboard-family files. The other 6 are purchase-owned and were verified to read only purchase-owned repositories or nothing at all — they are **not** part of this refactor:

| File | Lines | Verified foreign dependencies |
|---|---|---|
| [PurchaseDashboardController.java](erp-backend/src/main/java/com/vishatech/erp/controller/PurchaseDashboardController.java) | 31 | none (delegates to `PurchaseDashboardStatsService`) |
| [PurchaseDashboardStatsService.java](erp-backend/src/main/java/com/vishatech/erp/service/PurchaseDashboardStatsService.java) | 132 | 7 purchase-owned repositories only |
| [PurchaseWorkQueueController.java](erp-backend/src/main/java/com/vishatech/erp/controller/PurchaseWorkQueueController.java) | 56 | none |
| [PurchaseWorkQueueService.java](erp-backend/src/main/java/com/vishatech/erp/service/PurchaseWorkQueueService.java) | 358 | purchase-owned only |
| [ApprovalSummaryController.java](erp-backend/src/main/java/com/vishatech/erp/controller/ApprovalSummaryController.java) | 32 | none |
| [ApprovalSummaryService.java](erp-backend/src/main/java/com/vishatech/erp/service/ApprovalSummaryService.java) | 105 | **no project imports at all**; composes same-package services (`CprService`, `CprTechnicalVerificationService`, `CostWorkoutService`, `ProfitWorkoutService`, sales services) |

`/approvals/summary` is an adjacent, platform-wide approval count, not a purchase document. It is the same *pattern* as the dashboard (same-package service composition) and should later consume the same ports; it is out of scope here.

---

## 2. Verified dependency map

### 2.1 `GET /dashboard/stats` — per-file foreign dependencies

**`DashboardController` (19 cross-module types, 19 call sites):**

| Owner | Types | Exact call sites |
|---|---|---|
| Production (16) | `dto.production.{Dispatch,Drawing,Model,Packing,Production,TV}StatsDTO`, `entity.production.{EntryStatus,ProductionType}`, `repository.production.ProductionEntryRepository`, `service.QualityInspectionService`, `service.production.{Dispatch,Drawing,Model,PackingList,ProductionOrder,TechnicalVerification}Service` | L113–119 `productionOrderService.getStatistics()/getAverageProgress()`; L122 `qualityInspectionService.stats(null)`; L131/138/145 `…Service.getStatistics()`; L157 `packingListService.getStatistics()`; L165 `dispatchService.getStatistics()`; L178–182 `productionEntryRepository.countByProductionType(…)` + `countByProductionTypeAndStatus(…, EntryStatus.…)` |
| CRM (2) | `crm.repository.CustomerRepository`, `crm.repository.FollowUpRepository` | L92–94 `countByStatusIgnoreCase("Deleted"/"Active")`, `count()`; L98–102 `countActive()`, `countActiveByStatus("Open"/"Completed"/"Rescheduled")`, `countOpenOverdue(today)` |
| CPR (1) | `service.CprTechnicalVerificationService` | L105 `cprTvService.stats(null)` |

The controller is also on the frozen `controllers → repositories` allow-list because it injects `ProductionEntryRepository`, `CustomerRepository`, `FollowUpRepository`.

**`DashboardService` (13 cross-module imports + 3 same-package cross-module services):**

| Owner | Types | Real use |
|---|---|---|
| Sales (8 services, same package → invisible to import measurement) | `QuotationService`, `SalesContractService`, `SalesOrderService`, `CreditNoteService`, `InvoiceService`, `DeliveryChallanService`, `ProformaInvoiceService`, `PaymentReceiptService` | `stats()` maps at L97, L146, L162, L176, L188, L203, L213, L222 — key extraction for ~60 payload fields |
| Sales (8 imports) | `CreditNoteRepository`, `DeliveryChallanRepository`, `InvoiceRepository`, `PaymentReceiptRepository`, `ProformaInvoiceRepository`, `QuotationRepository`, `SalesContractRepository`, `SalesOrderRepository` | **none — all 8 are dead** (declared, constructor-assigned, never referenced) |
| CRM (4) | `crm.repository.LeadRepository`, `crm.repository.CustomerRepository`, `crm.entity.LeadStage`, `crm.entity.LeadStatus` | L93 `leadRepository.count()`, L94 `countByStatus(ACTIVE)`, L232–234 `countByStage(QUALIFIED/WON/LOST)`, L237 `customerRepository.count()` |
| CPR (1 import + 1 service) | `repository.CprRepository` (dead), `service.CprService` | L98 `cprService.stats()` → `total/pendingapproval/draft/approved/rejected/converted` |
| Cost/Profit Workout (2, same package) | `CostWorkoutService`, `ProfitWorkoutService` | L117/L127 `stats()` → 12 payload fields |

**Behavioural quirks in `DashboardService` that any refactor must preserve exactly** (verified from the `new DashboardStats(...)` argument list, L237–250):
`totalExpenses=0`, `netProfit=0`, `cashBalance=0`, `totalVendors=0`, `purchaseOrders=0`, `pendingReceipts=0`, `pendingPayments=0`, `openFollowups=0`, `overdueFollowups=0`, `totalFollowups=0`, all 6 `CprTv` fields `=0`, and `pendingDeliveries = totalDeliveryChallans` (a delivery-challan count is passed into the delivery slot). These are today's values; "fixing" them would change calculations and is explicitly out of scope.

### 2.2 `GET /sales/dashboard` — foreign dependencies

**`SalesDashboardService` (26 cross-module imports + 4 same-package cross-module services):**

| Owner | Types | Exact call sites |
|---|---|---|
| CRM (7) | `FollowUp`, `Lead`, `LeadStage`, `LeadStatus`, `CustomerRepository`, `FollowUpRepository`, `LeadRepository` | L247–256 lead counts per status/stage; L262–263, L347 `customerRepository.count()/countByStatusIgnoreCase("Active")`; L274–281 `followUpRepository.count(openFollowUps()…)`; L489 `leadRepository.findAll(leadActivityFilter(), …)`; L604 `leadRepository.count(Specification …)` |
| CPR (3 + service) | `Cpr`, `CprRepository`, `CprTechnicalVerificationRepository`, `CprService` | L207/L334 `cprService.stats()`; L349 `cprTechnicalVerificationRepository.count()`; L495 `cprRepository.findAll(newestFirst)` |
| Production (3 + service) | `QualityInspectionRepository`, `repository.production.PackingListRepository`, `ProductionTrackerRepository`, `ProductionTrackerService` | L345 `productionTrackerService.stats()`; L350 `qualityInspectionRepository.count()`; L351 `packingListRepository.count()`; activity feed rows |
| Sales (13, its own module) | orders/quotations/contracts/invoices/receipts/credit notes/challans + 8 repositories | pipeline, values, trend, recent lists, top customers |
| Cost/Profit Workout (2, same package) | `CostWorkoutService`, `ProfitWorkoutService` | L208–209, L335–336 |

The dashboard's own `@Transactional(readOnly = true)` sits on `SalesDashboardService`; `DashboardService` and `DashboardController` have **no** transaction annotation — the JDBC behaviour differs between the two endpoints and must not be unified.

### 2.3 The audit's "47 foreign types" — re-measured

Imports are measured with the owner of each type assigned by feature (not by package, because the codebase is package-by-layer):

| Owner | Distinct imported types | Where |
|---|---|---|
| Production | **19** | controller 16 + `SalesDashboardService` 3 |
| Sales | **13** | `DashboardService` (CRM→no) 0 own + `SalesDashboardService` 13 |
| CRM | **7** | controller 2 + both services 5 |
| CPR | **4** | controller 1 + `SalesDashboardService` 3 |
| **Import-visible total** | **43** | across the 4 aggregation files |

Same-package cross-module services are **invisible** to an import-based measurement (the project is package-by-layer, so `com.vishatech.erp.service.*` neighbours need no import): `CprService`, `CostWorkoutService`, `ProfitWorkoutService` (used by both services) and `ProductionTrackerService` (used by `SalesDashboardService`) = **4 further cross-module types**.

**43 + 4 = 47.** The audit's headline figure of **47 is therefore correct**, but its composition is not reproducible from imports alone: the audit's split (production 19 / sales 14 / CRM 7 / CPR 4 / platform 2 / other 1) counts `SalesDashboardService` itself plus three classifier-bucket types, while the true composition is 43 import-visible (production 19 / sales 13 / CRM 7 / CPR 4) + 4 same-package services. This plan is built on the per-type tables in §2.1–2.2, not on the aggregate number.

**Two audit corrections:**
1. **There is no admin/user dependency in the dashboard.** No dashboard file imports `entity.User`, `UserRepository`, `AuthService` or any admin type. The audit's matrix row `dashboard → admin 5` comes from the classifier sweeping `AuthController` (which imports `entity.User`, `service.AuthService`) and `HealthController` into the "dashboard" bucket. **Consequence: the admin/user-metrics port requested in the task brief has no consumer and is not proposed** (see §12 Q3).
2. **`DashboardService` has 9 dead repository dependencies** (8 sales repositories + `CprRepository`). They inflate the measured coupling and are removable as a behaviour-neutral first step (§9 D1).

### 2.4 Existing boundary guards that touch the dashboard

Read from [ModuleBoundaryTests.java](erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java) — **5 dashboard entries across 3 frozen rules** (3 distinct classes):

| Rule | Entries |
|---|---|
| `outside_does_not_depend_on_crm_internals` | `controller.DashboardController`, `service.DashboardService`, `service.SalesDashboardService` |
| `controllers_do_not_depend_on_repositories` | `controller.DashboardController` |
| `outside_does_not_depend_on_production_persistence` | `controller.DashboardController`, `service.SalesDashboardService` |

Also relevant: `SourceHygieneTests` freezes wildcard imports (none of the 5 dashboard files uses one, and any new file must use explicit imports); `purchase_does_not_depend_on_other_business_modules` and `marketing_…` are already enforced without allow-lists.

**Hazard to remember:** both frozen rules scope their *scanned* classes to `com.vishatech.erp.service..` and `com.vishatech.erp.controller..`. Moving a dashboard class into a new package without widening the rule would silently remove its coverage (§9 D6).

---

## 3. Consumer → required data → existing call site

This is the input to the port design: every key on the left must keep its exact value, and every value on the right must be obtained by the *same* existing call.

### 3.1 `/dashboard/stats` — frozen key set = **145 keys**

84 keys come from `DashboardStats.toMap()` (19 summary + 65 detailed) and **61 more are added by the controller** (46 explicit `map.put("…")` keys + `putEntryStats` × 3 types × 5 keys). Consumers read these by name, so all 145 are a frozen contract.

| Payload group (keys) | Owner | Existing source (must not change) |
|---|---|---|
| `clientsTotal`, `clientsActive` | CRM | `customerRepository.count()`, `countByStatusIgnoreCase("Deleted")` → `max(0, count - deleted)`, `countByStatusIgnoreCase("Active")` |
| `followupTotal/Open/Completed/Rescheduled/Overdue` | CRM | `followUpRepository.countActive()`, `countActiveByStatus(…)`, `countOpenOverdue(today)` |
| `activeLeads`, `activeLeadsCount`, `qualifiedLeads`, `wonLeads`, `lostLeads` | CRM | `leadRepository.count()`, `countByStatus(ACTIVE)`, `countByStage(QUALIFIED/WON/LOST)` |
| `totalCprs`, `draftCprs`, `approvedCprs`, `rejectedCprs`, `convertedCprs`, `pendingCprs` | CPR | `cprService.stats()` keys `total/draft/approved/rejected/converted/pendingapproval` |
| `cprTvTotal/Draft/UnderVerification/Verified/Rejected` | CPR | `cprTvService.stats(null)` keys `total/draft/underVerification/verified/rejected` |
| `totalQuotations`, `draftQuotations`, … `cancelledPaymentReceipts` (~60 keys) | Sales | the 8 sales `stats()` maps already computed in `DashboardService` |
| `totalCostWorkouts`, …, `rejectedProfitWorkouts` (12 keys) | Cost/Profit Workout (**owner open**, §12 Q1) | `costWorkoutService.stats()`, `profitWorkoutService.stats()` |
| `productionTotalOrders`, `productionPendingApproval`, `productionInProgress`, `productionOnHold`, `productionCompleted`, `productionAverageProgress` | Production | `productionOrderService.getStatistics()`, `getAverageProgress()` |
| `qcTotal/Pending/InProgress/Passed/Failed/Hold` | Production | `qualityInspectionService.stats(null)` |
| `productionTvTotal/Pending/Verified/Rejected` | Production | `technicalVerificationService.getStatistics()` |
| `productionDrawingTotal/Pending/Verified/Rejected` | Production | `drawingService.getStatistics()` |
| `productionModelTotal/Pending/Verified/Rejected` | Production | `modelService.getStatistics()` |
| `casting*`, `fabrication*`, `assembly*` (5 keys × 3 types) | Production | `productionEntryRepository.countByProductionType(ProductionType.getDisplayName())` + `countByProductionTypeAndStatus(…, EntryStatus.PENDING/IN_PROGRESS/HOLD/COMPLETED)` |
| `packingTotal/Pending/InProgress/Completed/ReadyForDispatch` | Production | `packingListService.getStatistics()` |
| `dispatchTotal/Ready/Dispatched/InTransit/Delivered` | Production | `dispatchService.getStatistics()` |
| `totalExpenses`, `netProfit`, `cashBalance`, `totalVendors`, `purchaseOrders`, `pendingReceipts`, `pendingPayments`, `pendingDeliveries`, `openFollowups`, `overdueFollowups`, `totalFollowups` | **nobody** | hardcoded literals in `DashboardService` — preserved as-is |

### 3.2 `/sales/dashboard`

| Payload key | Owner | Existing source |
|---|---|---|
| `counts.leads.*` (10 keys) | CRM | `leadRepository.countByStatus/countByStage/countByStatusIn` (L247–256) |
| `counts.clients.total/active` | CRM | `customerRepository.count()`, `countByStatusIgnoreCase("Active")` |
| `counts.followUps.*` (`open`, `overdue`, `dueToday`, `dueThisWeek`) | CRM | `followUpRepository.count(openFollowUps()…)` Specifications (L273–281) |
| `counts.cpr`, `counts.costWorkouts`, `counts.profitWorkouts` | CPR / Cost-Profit | `cprService.stats()`, `costWorkoutService.stats()`, `profitWorkoutService.stats()` |
| `values.*` (`clientsActive`, `tvTotal`, `qcTotal`, `packingTotal`, tracker) | CRM, CPR, Production | `countByStatusIgnoreCase("Active")`, `cprTechnicalVerificationRepository.count()`, `qualityInspectionRepository.count()`, `packingListRepository.count()`, `productionTrackerService.stats()` |
| `pipeline[]`, `trend.months`, `cposRecent[]`, `topCustomers[]`, `values.*` money | Sales | own repositories/services |
| `activities[]` | mixed | 7 per-type lists merged: sales (own), CRM leads (`findAll(leadActivityFilter())`), CPR (`cprRepository.findAll`), production packing/QC/tracker |
| `alerts.*` (`inactiveLeads`, due/overdue follow-ups) | CRM | `leadRepository.count(Specification …)`, `followUpRepository` Specifications |

---

## 4. Proposed ports

### 4.1 Design rules

1. **Consumer-owned interfaces, owner-owned implementations.** The interface is dashboard business (what the dashboard needs); the adapter that implements it lives with the module that owns the data.
2. **No foreign types in a port signature.** Ports exchange dashboard-owned value records and JDK types only — never `Lead`, `Customer`, `FollowUp`, `Cpr`, `ProductionType`, `EntryStatus`, `*StatsDTO` or a repository.
3. **Adapters delegate to the existing call, once.** Each port method body is exactly the call listed in §3; no new query, no new fetch join, no new `Specification` (existing ones move verbatim), no aggregation pushed into SQL or out of SQL.
4. **No transaction changes.** Adapters carry no `@Transactional`; the existing annotations on the delegated methods stay where they are. `SalesDashboardService` keeps its `@Transactional(readOnly = true)`; `DashboardService`/`DashboardController` gain none.
5. **Read-only and side-effect free.** No port writes; no port is used outside the dashboard.

### 4.2 New package for dashboard-owned abstractions

`com.vishatech.erp.dashboard.port` — interfaces only.
`com.vishatech.erp.dashboard.dto` — the dashboard-facing value records (`record`, `final`, immutable).
These two packages contain **no** Spring beans and **no** foreign types, so they introduce no boundary violations and no rule-scope hazard.

### 4.3 CRM port

`com.vishatech.erp.dashboard.port.CrmDashboardPort` → implemented by `com.vishatech.erp.crm.api.CrmDashboardReadAdapter`

| Port method (returns a dashboard record) | Delegates to exactly |
|---|---|
| `ClientCounts clientCounts()` → `(total, active)` | `customerRepository.count()`, `countByStatusIgnoreCase("Deleted")`, `countByStatusIgnoreCase("Active")` (the `max(0, …)` stays in the adapter) |
| `FollowUpCounts followUpCounts(LocalDate today)` → `(total, open, completed, rescheduled, overdue)` | `countActive()`, `countActiveByStatus("Open"/"Completed"/"Rescheduled")`, `countOpenOverdue(today)` |
| `FollowUpWindowCounts followUpActivity(LocalDate today)` → `(open, overdue, dueToday, dueThisWeek)` | the four `count(openFollowUps() …)` Specifications (moved verbatim into the adapter) |
| `LeadCounts leadCounts()` → `(total, active, inPlayableStatuses, new, contacted, qualified, proposal, proposalSent, negotiation, won, lost)` | `count()`, `countByStatus(ACTIVE)`, `countByStatusIn([ACTIVE, INACTIVE])`, `countByStage(…)` |
| `List<LeadActivityRow> recentLeadActivity(int limit)` | `findAll(leadActivityFilter(), newestFirst).getContent()` |
| `long inactiveActiveLeads(LocalDate cutoff)` | `leadRepository.count(Specification …)` |
| `List<FollowUpAlertRow> dueAndOverdueFollowUps(LocalDate today)` | the alert queries |

### 4.4 CPR port

`com.vishatech.erp.dashboard.port.CprDashboardPort` → `com.vishatech.erp.cpr.api.CprDashboardReadAdapter`

| Method | Delegates to |
|---|---|
| `CprCounts cprCounts()` → `(total, pendingApproval, draft, approved, rejected, converted)` | `cprService.stats()` (keys `total/pendingapproval/draft/approved/rejected/converted`) |
| `CprTvCounts technicalVerificationCounts()` → `(total, draft, underVerification, verified, rejected)`; `long technicalVerificationTotal()` | `cprTvService.stats(null)`; `cprTechnicalVerificationRepository.count()` |
| `List<CprActivityRow> recentCprActivity(int limit)` | `cprRepository.findAll(newestFirst)` |

### 4.5 Production port

`com.vishatech.erp.dashboard.port.ProductionDashboardPort` → `com.vishatech.erp.service.production.ProductionDashboardReadAdapter` (this is production's own package convention: `<layer>.production`)

| Method | Delegates to |
|---|---|
| `ProductionOrderCounts orderCounts()` → `(total, pendingProductionApproval, pendingAdminApproval, inProgress, hold, completed, averageProgress)` | `productionOrderService.getStatistics()`, `getAverageProgress()` |
| `QualityCounts qualityCounts()` → `(total, pending, inProgress, passed, failed, hold)`; `long qualityTotal()` | `qualityInspectionService.stats(null)`; `qualityInspectionRepository.count()` |
| `VerificationCounts verificationCounts()`, `DrawingCounts drawingCounts()`, `ModelCounts modelCounts()` | `technicalVerificationService/drawingService/modelService.getStatistics()` |
| `ShopFloorCounts shopFloorCounts(String typeKey)` → `(total, pending, inProgress, hold, completed)` | `countByProductionType(dbType)` + `countByProductionTypeAndStatus(dbType, EntryStatus.…)`; **the `typeKey → ProductionType → getDisplayName()` mapping stays inside the adapter**, so the SQL filter is byte-identical |
| `PackingCounts packingCounts()`; `long packingTotal()` | `packingListService.getStatistics()`; `packingListRepository.count()` |
| `DispatchCounts dispatchCounts()` | `dispatchService.getStatistics()` |
| `TrackerCounts trackerCounts()` | `productionTrackerService.stats()` |
| `List<ActivityRow> recentProductionActivity(int limit)` | the packing / QC / production-tracker lists that feed the merged activity feed |

### 4.6 Sales port

`com.vishatech.erp.dashboard.port.SalesDashboardPort` → `com.vishatech.erp.sales.api.SalesDashboardReadAdapter`

| Method | Delegates to |
|---|---|
| `SalesBreakdown counts()` → the ~60 sales fields of `DashboardStats` | the 8 `stats()` maps (`QuotationService`, `SalesContractService`, `SalesOrderService`, `CreditNoteService`, `InvoiceService`, `DeliveryChallanService`, `ProformaInvoiceService`, `PaymentReceiptService`) with today's key extraction moved verbatim |

`SalesDashboardService` keeps its own sales reads (pipeline, trend, recent lists, top customers, money values) — those are its own module's tables. Only its CRM/CPR/Production/Workout reads are replaced by ports.

### 4.7 Cost/Profit Workout port — blocked on an ownership decision

`com.vishatech.erp.dashboard.port.WorkoutDashboardPort` (`costWorkoutCounts()`, `profitWorkoutCounts()`), implemented either by `SalesDashboardReadAdapter` (if Sales owns the workout) or by `com.vishatech.erp.accounts.api.AccountsDashboardReadAdapter` (if Accounts owns it). See §12 Q1. Not on the critical path: D1–D4 can land with the existing `CostWorkoutService`/`ProfitWorkoutService` injection, and the port added afterwards.

### 4.8 Admin/user metrics port — not proposed

Verified in §2.3: the dashboard reads no user/admin data. Producing one would be an invented abstraction. If the user wants the hardcoded `totalExpenses`, `netProfit`, `cashBalance`, `totalVendors`, `purchaseOrders`, `pendingReceipts`, `pendingPayments` to become real numbers, that is a **calculation change** and a separate task with its own data-ownership analysis.

### 4.9 Aggregation seam

`DashboardAggregationService` (dashboard-owned, no foreign types in its own signature) assembles the payload from the five ports and returns `DashboardStats` plus the 61 controller keys; `DashboardController` becomes a thin HTTP mapping. This is what finally separates "aggregation and presentation" from "module internals" and gives a unit-testable seam.

---

## 5. Target structure and ownership resolution

Recommended end state (matching audit §9, reached incrementally — see §9):

```
com.vishatech.erp.dashboard.controller.DashboardController
com.vishatech.erp.dashboard.service.DashboardAggregationService
com.vishatech.erp.dashboard.dto.{DashboardStats, …Counts}
com.vishatech.erp.dashboard.port.{Sales,Crm,Cpr,Production,Workout}DashboardPort
com.vishatech.erp.crm.api.CrmDashboardReadAdapter
com.vishatech.erp.cpr.api.CprDashboardReadAdapter
com.vishatech.erp.sales.api.SalesDashboardReadAdapter
com.vishatech.erp.service.production.ProductionDashboardReadAdapter
```

Ownership resolutions applied here:
- **Sales Dashboard (`/sales/dashboard`) belongs to Sales** — it is a `SALES_VIEW` page over sales tables; it stops being a "dashboard module" file that reaches outward and becomes "the Sales module's read model that uses three ports". (Audit §13 question 3.)
- **Purchase dashboards stay as they are** — already compliant.
- `/approvals/summary` becomes a future consumer of the same ports.

---

## 6. Compatibility guarantees

| Concern | Guarantee | How it is enforced |
|---|---|---|
| API routes | `/dashboard/stats`, `/sales/dashboard` unchanged | mappings untouched; ports are internal |
| Payload keys & values | byte-identical JSON values; every key kept | the key set is frozen by the new characterization test (§8); quirks in §2.1 asserted |
| Responses/DTOs | `DashboardStats` stays the response record with the same 84 components in the same order | record not edited |
| Calculations | no arithmetic moves: sums (`pendingProductionApproval + pendingAdminApproval`), `max(0, count - deleted)`, `blankToDash`, JVM-side `BigDecimal` sums stay in Java | ports return the same sub-values; aggregation performs the same additions |
| SQL behaviour | each port method calls exactly the query in §3; no new query, no join change | review of adapter bodies; query-count test (§8) |
| Transactions | no new `@Transactional`; existing `readOnly = true` stays only on `SalesDashboardService` | ArchUnit-free code review + integration tests |
| Permissions/auth | `isAuthenticated()` and `hasAuthority('SALES_VIEW')` untouched | existing security tests + new 401 test |
| Database schema | no entity/column/DDL change; no entity moves | `CadWorkerPersistenceUnitTests` stays green |
| Frontend | not touched | `npm run build` |
| Architecture tests | allow-lists only **shrink**; nothing weakened or removed | `ModuleBoundaryTests` |

---

## 7. Regression detectors — verified baseline

Executed today after repairing the build output (§15), command:

```
cd erp-backend && ./mvnw -B -o test -Dtest='AdministrationApiTest,SalesDashboardApiTest,SalesDashboardAggregationTests,ModuleBoundaryTests,SourceHygieneTests,CadWorkerPersistenceUnitTests,PurchaseWorkQueueIntegrationTests,ProductionKpiAggregationIntegrationTests' -DfailIfNoSpecifiedTests=false
```

**Result: `Tests run: 48, Failures: 0, Errors: 0, Skipped: 0` — BUILD SUCCESS.**

Full-suite baseline re-established today on this same tree after the environment repair (§15):

```
cd erp-backend && ./mvnw -B -o verify
→ Tests run: 494, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS (3:40 min)
```

Per-class executed counts confirmed in that run: `ModuleBoundaryTests` 16, `SalesDashboardAggregationTests` 2, `SourceHygieneTests` 1, `CadWorkerPersistenceUnitTests` 1, `ReadPathQueryCountTests` 12.

| Test class | Tests | What it detects for this refactor | Runs in CI? |
|---|---|---|---|
| [SalesDashboardAggregationTests](erp-backend/src/test/java/com/vishatech/erp/performance/SalesDashboardAggregationTests.java) | 2 | **Strongest detector for `/sales/dashboard`**: delta assertions on KPI counters (including rows the dashboard must keep excluding and a differently-cased status) **and** Hibernate-statistics assertions that statements/entity loads do not grow with row count — i.e. it catches an N+1 introduced by a port | yes |
| [SalesDashboardApiTest](erp-backend/src/test/java/com/vishatech/erp/security/SalesDashboardApiTest.java) | 2 | Contract test: auth required; `pipeline[]` stage keys exactly equal `PIPELINE_KEYS`; labels non-blank; counts numeric | yes |
| [ModuleBoundaryTests](erp-backend/src/test/java/com/vishatech/erp/architecture/ModuleBoundaryTests.java) | 16 | The 5 dashboard allow-list entries in §2.4; fails if a **new** class violates CRM-internals, controllers→repositories or production-persistence boundaries (e.g. a port placed in the wrong package) | yes |
| [SourceHygieneTests](erp-backend/src/test/java/com/vishatech/erp/architecture/SourceHygieneTests.java) | 1 | fails on a new `import com.vishatech.erp.*;` in any new file | yes |
| [CadWorkerPersistenceUnitTests](erp-backend/src/test/java/com/vishatech/cadworker/CadWorkerPersistenceUnitTests.java) | 1 | worker `@EntityScan("com.vishatech.erp.entity")` contract incl. associated entities — **only at risk if an entity moves**; this plan moves none | yes |
| [ProductionKpiAggregationIntegrationTests](erp-backend/src/test/java/com/vishatech/erp/production/ProductionKpiAggregationIntegrationTests.java) | 15 | pins the production KPI queries the production port delegates to (status sets, past-due rule, page clamping, independent counts) | yes |
| [PurchaseWorkQueueIntegrationTests](erp-backend/src/test/java/com/vishatech/erp/purchase/PurchaseWorkQueueIntegrationTests.java) | 11 | asserts `/api/purchase/dashboard/stats` content equals the database — the compliance model, and an early warning if a shared helper is disturbed | yes |
| [ReadPathQueryCountTests](erp-backend/src/test/java/com/vishatech/erp/performance/ReadPathQueryCountTests.java) | 12 (not among the 48 subset above; part of the full suite) | **pins no dashboard endpoint.** It pins the JDBC statement counts of `ProductionOrderService` pages, `PurchaseOrderService`/`PurchaseRfqService`/`PurchaseInvoiceService` lists and `SalesOrderService` page/option-feed/export. Value to this refactor: if a port stops delegating to those services and re-implements a query, these counts are the alarm | yes |
| [AdministrationApiTest](erp-backend/src/test/java/com/vishatech/erp/api/administration/AdministrationApiTest.java) | **runs 0 tests** | contains `get("/dashboard/stats") → 200`, but the whole REST-Assured family extends `BaseApiTest`, gated by `@EnabledIfEnvironmentVariable(named = "ERP_API_TEST_ENABLED", matches = "true")`, and [ci.yml](.github/workflows/ci.yml) runs only `./mvnw -B verify` with no such variable | **no** |

**Verified gap that changes the sequence:** `/dashboard/stats` has **no executing assertion anywhere** — only a 200-status check inside a class that is skipped in CI. The Audit's §8 note that this endpoint is "covered" is therefore stronger than reality. Characterization tests for it must be written **before** the refactor (§8, §9 D2), exactly as the sales side already has them.

---

## 8. Tests to add (before each consumer is refactored)

1. `com.vishatech.erp.dashboard.DashboardStatsApiTests` (MockMvc, same `AbstractSecurityTest` pattern as `SalesDashboardApiTest`)
   - 401 without a token; 200 with `SALES_VIEW`/authenticated user (mirrors today's `isAuthenticated()`).
   - **Frozen key set**: the response `keySet()` must equal a constant list of all **145 keys** (84 from `toMap()` + 61 from the controller), asserted with `containsExactlyInAnyOrderElementsOf`, so key *order* is not over-constrained — `DashboardStats.toMap()` uses `Map.ofEntries`, whose iteration order is unspecified today.
   - **Delta assertions** on a deterministic seeded graph for every group in §3.1: clients (incl. a `Deleted` customer), follow-ups (open/completed/rescheduled/overdue), leads by stage, CPR + CPR-TV, production order statistics and average progress, QC, verification/drawing/model, all three shop-floor types × five statuses, packing, dispatch. Handle the MySQL-only `quality_inspections` JSON columns exactly as `SalesDashboardApiTest.ensureQualityInspectionsTable()` does.
   - The `DashboardStats` zero-placeholder quirks (§2.1) asserted explicitly so a later "cleanup" cannot silently change the API.
2. `DashboardStatsQueryCountTests` (Hibernate statistics, `AbstractSecurityTest` style): one request = a bounded statement count, and the count does not grow when seeded rows are added — the `/dashboard/stats` analogue of `SalesDashboardAggregationTests.dashboardReadCostDoesNotGrowWithTheNumberOfRecords`. This is what proves the ports did not add N+1 reads.
3. `DashboardAggregationServiceTests` (plain unit test, mocked ports): key → value mapping, the additions (`pendingApproval`), `max(0, …)`, `pendingDeliveries = totalDeliveryChallans`, `blankToDash`. Fast, DB-free, and the only test that can isolate aggregation from module behaviour.
4. Adapter equivalence tests, one per port (`CrmDashboardReadAdapterTests`, `CprDashboardReadAdapterTests`, `ProductionDashboardReadAdapterTests`, `SalesDashboardReadAdapterTests`): seed → assert the adapter's numbers equal the numbers returned by the direct service/repository call. This is the "approved dependencies" test; it fails if an adapter adds, drops or re-orders a query.
5. Optional hardening in a later change: once the dashboard classes no longer touch foreign internals, convert the three frozen rules into **enforced** rules for the dashboard classes by removing their allow-list entries and (if the relocation happens) widening the rule scope to include `com.vishatech.erp.dashboard..`.

---

## 9. Implementation sequence (smallest verified steps)

Every step is independently committable, testable and revertible. Each ends with the §7 test command plus the full suite before the next step.

**D0 — Baseline and environment hygiene** (no code)
`git status` snapshot; verify `target/classes` contains no IDE-written class files (§15); run the §7 command; run `./mvnw -B -o verify` for the full baseline.
*Artifacts:* none. *Rollback:* n/a.

**D1 — Remove the 9 dead repository dependencies from `DashboardService`** (behaviour-neutral)
Files: `service/DashboardService.java` only (`CprRepository` + the 8 sales repositories: field, constructor parameter, assignment — 27 lines).
Why first: it is provably dead (`grep` shows only declaration/assignment), it shrinks the measured coupling, and it proves the test command detects wiring mistakes before any structural work.
Checks: §7 command; full `verify`; `git diff` review that no call site changed.
*Rollback:* `git checkout -- erp-backend/src/main/java/com/vishatech/erp/service/DashboardService.java`.

**D2 — Characterization tests for `/dashboard/stats`** (§8 items 1–2), written against the current implementation and passing **before** any refactor.
Files: `src/test/java/com/vishatech/erp/dashboard/DashboardStatsApiTests.java`, `DashboardStatsQueryCountTests.java` (new).
*Rollback:* delete the two new test files.

**D3 — Add the port interfaces and value records** (additive only)
Files (new): `dashboard/port/{Sales,Crm,Cpr,Production}DashboardPort.java`, `dashboard/dto/{SalesBreakdown,ClientCounts,FollowUpCounts,LeadCounts,CprCounts,CprTvCounts,ProductionOrderCounts,QualityCounts,VerificationCounts,DrawingCounts,ModelCounts,ShopFloorCounts,PackingCounts,DispatchCounts,TrackerCounts,ActivityRow,LeadActivityRow,CprActivityRow,FollowUpAlertRow}.java`.
No existing file changes; nothing is wired yet, so runtime behaviour is untouched.
Checks: `./mvnw -B -o compile`, §7 command (must stay 48/0 and the new D2 tests green), `ModuleBoundaryTests` (new package must introduce no violation — verified by design rule 2 in §4.1).
*Rollback:* delete the new packages.

**D4 — Add adapters in the owning modules** (additive only)
Files (new): `crm/api/CrmDashboardReadAdapter.java`, `cpr/api/CprDashboardReadAdapter.java`, `sales/api/SalesDashboardReadAdapter.java`, `service/production/ProductionDashboardReadAdapter.java`, plus adapter equivalence tests (§8 item 4).
Expected ArchUnit effect: `ProductionDashboardReadAdapter` is a `service..` class whose simple name starts with `Production`, so `production_services_do_not_depend_on_flat_persistence` requires **one new allow-list entry** (`com.vishatech.erp.service.production.ProductionDashboardReadAdapter`) — justified: it is a production class reading production persistence, including the flat `ProductionEntryRepository`/`QualityInspectionRepository` the audit already classifies as a naming inconsistency outside this scope. Nothing else in the allow-lists changes; nothing is removed yet.
Checks: §7 command; adapter tests; `./mvnw -B -o verify`.
*Rollback:* delete the four new classes/tests and the single allow-list line.

**D5 — Rewire `/dashboard/stats` through the ports and extract the aggregation**
Files changed: `controller/DashboardController.java`, `service/DashboardService.java`; file added: `service/DashboardAggregationService.java` (later `dashboard/service`).
Effect: `DashboardController` drops 8 constructor dependencies and all `put()`/`EntryStatus`/`StatsDTO` code; `DashboardService` drops its CRM/CPR calls and keeps the sales/workout orchestration it delegates to the sales port.
Expected ArchUnit effect: **2 entries removed** (`DashboardController` from `outside_does_not_depend_on_crm_internals` and from `controllers_do_not_depend_on_repositories`); no entry added (the new aggregation service holds ports only).
Checks: the D2 characterization tests must pass **unchanged** (they are the contract); §7 command; `./mvnw -B -o verify`; `npm run build` not needed (no frontend change).
*Rollback:* single commit revert; ports/adapters may stay (unused but harmless) or be reverted with it.

**D6 — Rewire `/sales/dashboard` through the ports**
Files changed: `service/SalesDashboardService.java` only (its CRM/CPR/production repository fields replaced by the three ports; its own sales repositories and all aggregation/merge logic stay).
Expected ArchUnit effect: **3 entries removed** (`SalesDashboardService` from `outside_does_not_depend_on_crm_internals` and `outside_does_not_depend_on_production_persistence`, and `DashboardService`'s CRM entry if not already removed in D5). End state: **0 dashboard allow-list entries remain**, and the three rules become enforced for the dashboard surface.
Checks: `SalesDashboardAggregationTests` + `SalesDashboardApiTest` must pass **unchanged**; §7 command; `./mvnw -B -o verify`.
*Rollback:* single commit revert.

**D7 — (optional, separate change) Relocate the dashboard files to `com.vishatech.erp.dashboard.*`**
Pure move of `DashboardController`, `DashboardAggregationService`, `DashboardService`, `DashboardStats`, `SalesDashboard{Controller,Service}`. **Must, in the same change, widen the two frozen rules' scanned packages** to include `com.vishatech.erp.dashboard..`, otherwise the move silently drops their coverage (§2.4). No entity moves, so `CadWorkerPersistenceUnitTests` is unaffected.
Checks: §7 command (especially `ModuleBoundaryTests`), `./mvnw -B -o verify`.

---

## 10. Rollback strategy

- **Per step:** one commit each; rollback = `git revert <sha>` (or `git checkout -- <files>` before committing). No step touches routes, schema, DDL, data, configuration or the frontend, so a revert restores the previous behaviour exactly.
- **Ports are additive:** leaving D3/D4 in place while reverting D5/D6 leaves unused beans and no behaviour change; if that is undesirable, revert D4/D3 in reverse order.
- **No data migration** exists, so there is no roll-forward requirement.
- **Feature flags were rejected:** a runtime toggle would add configuration surface and change startup behaviour, which this task forbids.
- **Stop conditions** (stop and report rather than continue): any change to a payload value in the characterization tests; any new ArchUnit violation; any change in the statement counts of `SalesDashboardAggregationTests`/`ReadPathQueryCountTests`; any `CadWorkerPersistenceUnitTests` failure.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A port silently changes a number (e.g. `max(0, count - deleted)` moved) | medium | D2 characterization tests + adapter equivalence tests + delta assertions |
| Adapter introduces an extra query → N+1 on the dashboard | medium | `DashboardStatsQueryCountTests` + `SalesDashboardAggregationTests.dashboardReadCostDoesNotGrowWithTheNumberOfRecords` |
| New class placed in a package the frozen rules do not scan → silent loss of coverage | **high** if D7 is done carelessly | §2.4 hazard: widen rule scope in the same change; D4's expected allow-list effect is stated explicitly |
| Adapter adds a `@Transactional` and changes flush/read semantics | low | design rule 4; integration tests run against H2 with real JPA |
| `quality_inspections` JSON columns make a new `/dashboard/stats` test impossible in H2 | medium | follow the existing table-recreation workaround in `SalesDashboardApiTest`/`SalesDashboardAggregationTests` |
| Workout ownership is decided wrongly, putting the port in the wrong module | medium | D1–D6 do not depend on it (§4.7); resolve §12 Q1 before adding that port |
| IDE-written class files in `target/classes` make test results untrustworthy | **observed today** | §15 procedure before every verification run |

---

## 12. Unresolved dependencies, assumptions and decisions needed

**Q1 (blocking only §4.7) — Who owns Cost Workout / Profit Workout?** The UI presents them under Sales; the audit's module matrix says `accounts`; `ApprovalSummaryService` treats them as platform-wide. Decides whether `WorkoutDashboardPort` is implemented by `SalesDashboardReadAdapter` or `AccountsDashboardReadAdapter`. Recommendation: treat them as Sales-owned for now (their screens live under the Sales menu, and `quotationService`-style flat classes already sit beside them), and revisit when the accounts module is cut.

**Q2 (blocking D4) — New owner packages for CPR and Sales adapters?** Recommendation: yes — `com.vishatech.erp.cpr.api` and `com.vishatech.erp.sales.api` (one adapter class each; no entity/repository movement), because the adapter must live with the data it owns. Fallback if the user prefers zero new packages: place both adapters in `com.vishatech.erp.service` beside the flat sales/CPR services — this works today but must be untangled by the later module move, and it slightly weakens the "no cross-module internals" story because the adapter would sit in the same package as the classes it hides.

**Q3 — Admin/user metrics port requested in the brief:** verified unnecessary (§2.3, §4.8). Assumption recorded: no port is created, and the six hardcoded-zero numbers in `DashboardService` stay zero (changing them is a calculation change, out of scope). If the user wants real values, that is a new task needing an owner for expenses/vendors/purchase/cash.

**Q4 — Is `/sales/dashboard` in this scope at all?** This plan includes it (D6) because it shares three of the four ports and has the best test coverage. If it is deferred, D1–D5 still deliver `/dashboard/stats` and the plan's §4.3–4.5 interfaces are unchanged.

**Q5 — Should the payload record and the controller move at all (D7)?** Recommended: not in this refactor. The move is cosmetic once the ports exist, it can be done safely later, and doing it now would require widening the boundary rules — an architecture decision that belongs in its own change.

**Assumptions:** (a) the dashboard payload keys are a frozen contract because the React pages read them by name; (b) `SalesDashboardService`'s Java-side arithmetic (monthly trend, top-customer ranking, activity merge) must stay in Java — the service's own javadoc says moving it into SQL would change a displayed number; (c) the running backend (`mvn spring-boot:run`, PID observed) is not restarted by these changes because no route or bean name changes.

---

## 13. Non-goals

- No microservice, no second backend process/port, no Nginx, no gateway.
- No API route, payload key, DTO field, calculation, permission, transaction or schema change.
- No React change.
- No entity, repository or DTO relocation.
- No weakening, disabling or removal of any existing architecture test; allow-list entries are only ever **removed**.
- No work on the purchase dashboards, `ApprovalSummaryService`, or the marketing dashboard.

---

## 14. Acceptance criteria

A step is accepted only when all of the following hold:

1. `cd erp-backend && ./mvnw -B -o test -Dtest='AdministrationApiTest,SalesDashboardApiTest,SalesDashboardAggregationTests,ModuleBoundaryTests,SourceHygieneTests,CadWorkerPersistenceUnitTests,PurchaseWorkQueueIntegrationTests,ProductionKpiAggregationIntegrationTests' -DfailIfNoSpecifiedTests=false` → **48 tests, 0 failures** and the new dashboard tests green.
2. `cd erp-backend && ./mvnw -B -o verify` → build success, no new failures versus the §7 baseline of 494 tests, 0 failures.
3. `ModuleBoundaryTests` passes with the expected allow-list delta stated for the step (D4: +1 entry; D5: −2; D6: −3; final: 0 dashboard entries).
4. `git diff` for the step contains no change outside the files listed for it.
5. The `/dashboard/stats` key set and every value asserted in the D2 tests are unchanged.
6. `git status` shows no change to `src/` (frontend), `pom.xml`, `application*.properties`, or any entity/schema file.

---

## 15. Environment note (verified today, affects how tests are run)

`erp-backend/target/classes` had been rewritten by the VS Code Java language server (a JDK-25 JDT process started 10:04; output timestamped 10:05) and **102 class files were unloadable by the project's JDK 21** with `java.lang.ClassFormatError: Invalid method Code length 0 in class file …` — all of them Lombok-`@Builder` types under `dto.production.*` and `entity.production.*`. The first thing that failed was the dashboard test subset itself; the corruption was in build output, not in source.

Resolution applied: the 102 corrupt class files were identified by loading each class file with a JDK-21 class loader and deleted, then `./mvnw -B -o compile` regenerated them. A re-scan now reports **0 ClassFormatErrors across 953 class files**, and the §7 command passes 48/0. The running backend (Maven `spring-boot:run` and its child Spring Boot JVM) and its class files were not deleted, and `pom.xml` has no `spring-boot-devtools`, so nothing restarts.

Before every verification run in this workspace, confirm Maven is the only compiler writing into `target/classes` (an IDE auto-build can reintroduce this). This is an environment hazard, not a code defect.

---

## 16. Summary of verified facts this plan rests on

- Dashboard aggregation surface: 2 endpoints, 4 code files (1,134 lines) + 1 payload record (208 lines); the 6 other dashboard-family files are purchase-owned and already compliant.
- **47 distinct cross-module types = 43 import-visible (production 19, sales 13, CRM 7, CPR 4) + 4 same-package services invisible to imports** (`CprService`, `CostWorkoutService`, `ProfitWorkoutService`, `ProductionTrackerService`). The audit's headline total is confirmed; its composition is not reproducible from imports.
- `DashboardService` carries **9 dead repository dependencies**; `DashboardService.getStats()` hardcodes 16 zero/placeholder values and passes a delivery-challan count into `pendingDeliveries`.
- **5 dashboard allow-list entries across 3 frozen ArchUnit rules**; both frozen rules scan only `service..`/`controller..`, so relocating dashboard classes without widening the scope would silently drop coverage.
- **`/dashboard/stats` has no executing assertion in CI** (`AdministrationApiTest` is gated by `ERP_API_TEST_ENABLED`, unset in `ci.yml`); `/sales/dashboard` is well covered.
- Verified baselines after the environment repair: **full suite 494 tests, 0 failures**; **dashboard-relevant subset 48 tests, 0 failures**.
