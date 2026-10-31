# ERP Calendar Backend Readiness Audit

**Mode:** READ-ONLY AUDIT — report only. No application code, CSS, schema, data, reports or documentation were modified.
**Date of inspection:** 2026-10-17
**Repository:** `C:\Users\Mahes\Desktop\Sri\erp-react`
**Artifact created:** this file only (`ERP_CALENDAR_BACKEND_READINESS_AUDIT.md`)

All names, fields, statuses and endpoints below were read from the repository source. Anything not confirmed from code is
explicitly marked **UNVERIFIED**. No endpoint was called, no SQL was executed, no seeder or test was run.

---

## 1. Executive Summary

The ERP already holds **the raw material a Calendar needs, for nearly every module**, and it already contains one working
precedent of exactly the aggregation pattern required.

**The decisive finding:** the Marketing module already ships a read-only calendar aggregation —
`MarketingCalendarService` (`erp-backend/src/main/java/com/vishatech/erp/service/MarketingCalendarService.java`) exposed by
`MarketingCalendarController` at `/marketing/calendar/activities`, `/marketing/calendar/today` and `/marketing/calendar/summary`.
It merges **six existing tables** (`marketing_visits`, `marketing_follow_ups`, `questionnaire_forms`, `marketing_expense_trips`,
`marketing_travel_plans`, `marketing_visit_activities`) into one DTO:

```
CalendarEvent(String id, String type, LocalDate date, String title, String assignedTo,
              String status, String contactPerson, String location, String time,
              String linkPath, Long entityId)
```

It creates **no new tables**, reads existing repositories, sorts by date then time, and applies a per-record visibility rule
(travel plans: ADMIN/MANAGER see every registry, everyone else only their own). That DTO is a ready-made, proven contract for a
future ERP-wide Calendar feed.

**Readiness by area (confirmed from code):**

| Area | Readiness | Why |
|---|---|---|
| Marketing | **High** | Working calendar aggregation + tab predicates (today/upcoming/pending-followups/overdue/completed) + date-range finders already in repositories |
| Purchase | **High for "pending work", medium for dates** | `PurchaseWorkQueueService` already computes 10 pending categories with exact status predicates and exposes due/expected dates — but several purchase dates are `String`, not typed |
| CRM / Follow-ups | **High** | `FollowUp.followupDate` / `nextFollowupDate` + `FollowUpRepository.countOpenOverdue(today)` and queryable open/overdue/due-today/due-this-week rules |
| Sales Execution | **High for dates, medium for times** | Full date vocabularies per document (validUntil, deliveryDate, actionDeadline, dueDate, paymentDate…) and per-document status vocabularies set by `stats()` |
| CPR | **High** | `requiredDate`, `quotationDeadline`, `extendedDeadline`, `approvalDate` + `CprStatus`/`CprApprovalStatus` enums |
| Production | **High** | `ProductionOrder.startDate/dueDate/status/priority`, `ProductionTracker` six-stage date pairs + **already-derived** `currentStatus` (NOT_STARTED / IN_PROGRESS / DELAYED / COMPLETED) |
| Engineering Design | **Medium** | Drawings/models carry verification status + timestamps, but no design deadline field was found |
| Accounts/Finance | **Medium** | Sales-side dues exist (`Invoice.dueDate`, `paymentStatus`); no dedicated Accounts/Finance module exists in the backend |
| Dashboard | **Not usable as a feed as-is** | `/dashboard/stats` publishes several KPI keys as **literal zero placeholders** (see §8) |

**Bottom line:** a future Calendar backend is feasible **without any schema change**, by reusing existing records and existing
service logic, provided (a) date-range read queries are added for the modules that lack them, and (b) every entry keeps a stable
`module + recordId + source-date-field` identity so refresh cannot duplicate entries. The main risks are **string-typed purchase
dates**, **free-text status vocabularies**, and **authorization/ownership scoping** that must be preserved per module.

---

## 2. Full Module Inspection Matrix

Legend: `—` = not present/unverified. "API" = an existing read endpoint that already returns the field. Dates/statuses listed are
the real Java field names found in the entities.

| Module | Submodule | Relevant entity/model | Existing date fields | Existing status fields | API available | Calendar suitability |
|---|---|---|---|---|---|---|
| Dashboard | KPI / workflow aggregation | `dashboard/dto/DashboardStats`, `DashboardAggregationService` | `SalesOrder`/`Invoice`/`Quotation` date+total aggregates via `findCurrentDatesAndTotalsByStatusIn` | many count keys (`draftQuotations`, `pendingSalesOrders`, `overdueInvoices`, …) | `GET /dashboard/stats` | **Reduced** — counts only, and several keys are hard-coded zero (§8) |
| Dashboard | Pending approvals | `ApprovalSummaryService` | — (counts only) | per-module pending counts | `GET /approvals/summary` | Good as a badge, **not** per-record entries |
| CRM | Leads | `Lead` | `createdAt`, `updatedAt`, `archivedAt` | `stage` (`LeadStage`: HOT…LOST), `status` (`LeadStatus`: ACTIVE/INACTIVE/ARCHIVED/DELETED) | `/leads`, `/crm` dashboard ports | Medium — stage/status yes, **no follow-up date on the lead itself** |
| CRM | Clients | `Customer` | `createdAt`, `geocodedAt`, `updatedAt` | `status` (String, incl. `Deleted`) | `/customers` | Low — no scheduling dates |
| CRM | Contacts | `crm/entity/Contact` | `createdAt`, `updatedAt` | `STATUS_ACTIVE/INACTIVE/ARCHIVED/DELETED` | `/contacts` | Low |
| CRM | Follow-ups | `FollowUp` | **`followupDate` (LocalDate)**, **`nextFollowupDate` (LocalDate)**, `archivedAt` | `status` (OPEN/COMPLETED/RESCHEDULED …) | `/followups`, `FollowUpRepository.countOpenOverdue` | **High** — the single best CRM calendar source |
| CPR | CPR documents | `Cpr` | **`prDate`, `requiredDate`, `floatedAt`, `submittedAt`, `approvalDate`, `quotationDeadline`, `extendedDeadline`**, `archivedAt` | `status` (`CprStatus`: DRAFT/COST_WORKOUT/PENDING_APPROVAL/APPROVED/REJECTED/CONVERTED/ARCHIVED/DELETED), `approvalStatus` (`PENDING/APPROVED/REJECTED`) | `/cprs`, `/cprs/stats` | **High** |
| CPR | Technical verification | `CprTechnicalVerification` | **`verificationDate`, `nextReviewDate`**, `forwardedAt`, `forwardedToPrAt` | `status` (`TechnicalVerificationStatus`: PENDING_FILE/DRAFT/UNDER_VERIFICATION/VERIFICATION_COMPLETED/FORWARDED_TO_COST_WORKOUT/FORWARDED_TO_PURCHASE_REQUISITION/APPROVED/REJECTED) | `/cpr-technical-verifications` | **High** |
| CPR | Cost workout | `CostWorkout` | `cwDate`, `revisionDate`, `archivedAt` | `status` (`CostWorkoutStatus`) | `/cost-workouts` | Medium — no deadline field |
| CPR | Profit workout | `ProfitWorkout` | `pwDate`, `revisionDate`, `archivedAt` | `status` (`ProfitWorkoutStatus`) | `/profit-workouts` | Medium |
| Sales | Quotations | `Quotation` | **`quotationDate`, `validUntil`**, `revisionDate`, `archivedAt` | `status` (draft/submitted/pending approval/approved/sent/viewed/accepted/rejected/negotiation/expired/cancelled) | `/quotations`, `/quotations/stats` | **High** — `validUntil` is a natural deadline |
| Sales | Sales contracts | `SalesContract` | **`contractDate`, `validity`** | `status` (draft/submitted/approved/active/completed/cancelled) | `/sales-contracts` | **High** |
| Sales | Sales orders (CPO) | `SalesOrder` | **`orderDate`, `deliveryDate`, `releaseDate`, `actionDeadline`**, `revisionDate`, `archivedAt` | `status` (draft/pending review/approved/in progress/completed/cancelled) | `/sales-orders` | **High** — `actionDeadline` is an explicit due date |
| Sales | E-Actions | `SalesOrderEAction` | **`requestedOn`, `startedOn`, `completedOn`** | `status` (String), `assignedAction`, `assignedTo`, `participantTeam` | `/sales-orders/e-actions` (frontend route) | **High** — has owner + request/complete timestamps |
| Sales | Proforma invoices | `ProformaInvoice` | **`piDate`, `validTill`, `invoiceDate`, `authorizationDate`, `buyersOrderDate`, `appendixDate`** | `status` (draft/sent/paid/overdue/accepted/expired/converted/cancelled) | `/proforma-invoices` | **High** |
| Sales | Delivery challans | `DeliveryChallan` | **`dcDate`, `dispatchDate`, `deliveryDate`** | `status` (draft/packed/dispatched/in transit/delivered/cancelled) | `/delivery-challans` | **High** |
| Sales | Invoices | `Invoice` | **`invoiceDate`, `dueDate`**, `poDate`, `contractDate`, `authorizationDate`, `appendixDate` | `status` (draft/issued/sent/partial/paid/overdue/cancelled) **and** `paymentStatus` (unpaid/partial/paid/overdue) | `/invoices` | **High** |
| Sales | Credit notes | `CreditNote` | **`cnDate`, `sourceDate`, `destinationReachedDate`, `dueDateOverride`, `dispatchDateOverride`** | `status` (draft/pending approval/approved/issued/adjusted/refunded/cancelled) | `/credit-notes` | **High** |
| Sales | Payment receipts | `PaymentReceipt` | **`paymentDate`** | `status` (draft/received/partial/completed/cancelled) | `/payment-receipts` | Medium — a record of a past fact |
| Sales | Documents / Reports / Settings | `SalesAttachment`, `SalesReportController`, `SalesSettingsController` | `uploadedAt` | — | `/sales/reports`, `/settings/sales` | Low for calendar |
| Purchase | Requisitions | `PurchaseRequisition` | `date` (**String**), `expectedDate` (**String**), `approvalDate` (LocalDateTime) | `status` (Draft…), `approvalStatus` (default `"Pending"`), `recordState` (`RECORD_ACTIVE`) | `/api/purchase/requisitions`, `/api/purchase/work-queue` | **High for pending**, date typing is a risk |
| Purchase | RFQs | `PurchaseRfq` | `dueDate` (**String**), `awardedAt` | `status`, `approvalStatus` (default `"Pending"`) | `/api/purchase` (RFQ), work queue | High |
| Purchase | RFQ follow-ups | `PurchaseRfqFollowUp` | **`followUpDate`, `lastContact`** (LocalDate) | `workflowStatus` (default `"Pending"`), `recordState` (`"active"`) | `/api/purchase/rfq-follow-ups` (+ `/stats`) | **High** — explicit follow-up date |
| Purchase | Purchase orders | `PurchaseOrder` | `orderDate`, `expectedDate`, `deliveryDate` (**String**), `approvalDate`, `releasedAt`, `acknowledgedAt` | `status` (default `"Draft"`), `approvalStatus` (`"Pending"`), `deliveryStatus`, `advanceStatus` | `/api/purchase/orders`, work queue | **High** |
| Purchase | Vendors | `PurchaseVendor` | `registrationDate` | `recordState` (`"active"`) | `/api/purchase/vendors` | Low |
| Purchase | GRN | `PurchaseGrn` | **`receiptDate`** (LocalDate), `createdAt` | `status` (default `"Expected"`) | work queue `pending-grns`, logistics routes | **High** |
| Purchase | Quality inspection | `PurchaseInspection` | **`inspectionDate`** (LocalDate), `createdAt` | `status` (default `"Pending"`) | work queue `pending-inspections` | **High** |
| Purchase | Shipments | `PurchaseShipment` | **`dispatchDate`, `eta`, `receivedOn`** (LocalDate) | — (status UNVERIFIED) | logistics shipment routes | **High** (`eta` is an expected date) |
| Purchase | Manufacturing jobs | `PurchaseManufacturingJob` | **`startDate`, `expectedDate`** (LocalDate) | — (status UNVERIFIED) | logistics manufacturing routes | **High** |
| Purchase | Purchase invoices | `PurchaseInvoice` | `invoiceDate`, `dueDate` (**String**) | `matchStatus` (default `"Pending Match"`), `status` (default `"Draft"`), `paymentStatus` | `/api/purchase/invoices`, work queue | **High** — overdue flag already computed |
| Purchase | Work queue | `PurchaseWorkQueueService` | item `date`/`dueDate`/`expectedDate` per category | 10 pending categories (see §4) | `GET /api/purchase/work-queue`, `/counts`, `/{category}` | **High — ready-made pending-work feed** |
| Marketing | Visits | `MarketingVisit` | **`scheduleDate`, `appointmentDate`, `appointmentTime`, `followupDate`**, `entryDateTime`, `exitDateTime`, `handoverAt` | `visitStatus` (`"Planned"`…), `followupStatus`, `qFormStatus`, `handoverStatus` | `/marketing/visits` (view tabs + `dateFrom`/`dateTo`), `/marketing/calendar/*` | **High** |
| Marketing | Follow-ups | `MarketingFollowUp` | **`followupDate`, `nextFollowupDate`** | `status` | `/marketing/calendar/activities` (`type=followup`) | **High** |
| Marketing | Q Forms | `QuestionnaireForm` | **`dateOfVisit`**, `submittedAt`, `geocodedAt` | `status` | `/marketing/q-forms`, calendar (`type=qform`) | **High** |
| Marketing | Marketing expenses / trips | `MarketingExpenseTrip`, `MarketingExpense` | **`startDate`, `expectedEndDate`, `tripOnDateTime`, `tripOffDateTime`, `approvedAt`**; expense `expenseDate`, `checkInDate`, `checkOutDate` | `approvalStatus` (String, `"Draft"`), `billStatus` (`"WITHOUT BILL"`) | `/marketing/expenses`, calendar (`type=expense`) | **High** |
| Marketing | Travel registry / plans / schedules | `MarketingTravelPlan`, `MarketingTravelPlanStop`, `MarketingTravelSchedule` | **`startDate`, `endDate`, `plannedDate`, `rescheduledDate`, `tripActualStart/End`, `cancelledAt`** | `status`, `approvedAt`, `archivedAt` | `/marketing/travel-plans`, `/marketing/travel-schedules`, calendar (`type=travel_plan`) | **High** — note per-record privacy filter already implemented |
| Marketing | Visit activities (follow-ups & visit extensions) | `MarketingVisitActivity` | **`activityDate`, `activityTime`, `nextFollowupDate`** | `activityType`, `status` | `/marketing/activities`, calendar (`type=followup`/`visit_extension`) | **High** |
| Marketing | Leads | `MarketingLead` | **`leadDate`** | `status` (UNVERIFIED) | `/marketing/leads` | Medium |
| Production | Production orders | `production/ProductionOrder` | **`startDate`, `dueDate`** (LocalDate), `productionApprovedAt`, `adminApprovedAt` (Instant) | `status` (`OrderStatus`: DRAFT/PENDING_PRODUCTION_APPROVAL/PRODUCTION_APPROVED/PENDING_ADMIN_APPROVAL/ADMIN_APPROVED/APPROVED/PENDING/IN_PROGRESS/HOLD/PENDING_QC/COMPLETED/PACKED/READY_FOR_DISPATCH/DISPATCHED/FAILED/CANCELLED), `priority` (`Priority`: LOW/MEDIUM/HIGH/URGENT), `currentStage`, `progress`, `department` | `GET /production-orders`, `/production-orders/stats`, `/{id}/timeline` | **High** |
| Production | Tracker (customer CPO) | `ProductionTracker` | **`orderDate`, `dueDate`**, six stage pairs: `castingStart/End`, `fabricationStart/End`, `assemblyStart/End`, `qcStart/End`, `packingStart/End`, `dispatchStart/End` | **`currentStatus` derived**: `COMPLETED` (dispatch 100%) / `NOT_STARTED` (all 0) / **`DELAYED`** (`dueDate` before today and dispatch < 100) / `IN_PROGRESS`; plus six `*Pct` fields | `GET /production-trackers`, `/stats`, `/by-cpo/{cpoNo}` | **High** — only entity found with genuine stage deadlines |
| Production | Entries / shop floor | `ProductionEntry` | `entryDate` | `status` (`EntryStatus`: PENDING/IN_PROGRESS/HOLD/COMPLETED/SKIPPED) | `/production-entries` | Medium |
| Production | Casting / Fabrication / Assembly / Machine shop | `CastingController`, `FabricationController`, `AssemblyController`, `MachineShopController` routes + `ProductionMachine`, `ProductionWorkCenter` | timestamps only (UNVERIFIED per-record dates) | per-stage statuses (not inspected in detail) | `/castings`, `/fabrications`, `/assemblies`, `/machine-shop` | Low/Medium — **stage dates live on `ProductionTracker`** |
| Production | Quality | `QualityInspection` | **`inspectionDate`** (LocalDate), `qcUpdatedAt` | status values (String, UNVERIFIED list) | `/quality-inspections`, `/quality-inspections/stats` | **High** |
| Production | Packing | `PackingList` | timestamps | `status` (`PackingStatus`: PENDING/IN_PROGRESS/COMPLETED/READY_FOR_DISPATCH) | `/packing`, `/packing/stats` | Medium |
| Production | Dispatch | `production/Dispatch` | **`dispatchDate`, `expectedDeliveryDate`** (LocalDate) | `status` (`DispatchStatus`: DRAFT/READY/DISPATCHED/IN_TRANSIT/DELIVERED), `packingStatus` | `/dispatch`, `/dispatch/stats` | **High** |
| Production | Drawings / Models | `Drawing`, `DrawingRevision`, `Model` | `uploadedDate`, `verificationDateTime`, `approvedAt`, `releasedAt` (all `Instant`) | `verificationStatus` (`DrawingStatus`/`ModelStatus`: PENDING/VERIFIED/REJECTED), `DrawingRevisionStatus` (DRAFT/PENDING_REVIEW/APPROVED/REJECTED/RELEASED/OBSOLETE) | `/drawings`, `/models`, `/stats` | **High for pending verification**, no deadline field |
| Production | Technical verification | `TechnicalVerification`, `TVHistory` | `verificationDateTime`, history `performedAt` | `verificationStatus` (`TVStatus`: PENDING/VERIFIED/REJECTED) | `/technical-verifications`, `/stats` | **High** |
| Production | KPI / Reports | `ProductionKpiController`, `ProductionReportController` | report ranges (delay analysis) | counts per module | `/production-kpi/{module}/counts`, `/production/reports/delay-analysis` | Medium — aggregates, useful for badges |
| Engineering Design | Drawings/models/revisions/verification | `Drawing`, `Model`, `DrawingRevision`, `CprTechnicalVerification` | `verificationDateTime`, `approvedAt`, `releasedAt`, `nextReviewDate` | statuses above | `/drawings`, `/models`, `/cpr-technical-verifications` | Medium — **no design deadline field found** |
| Accounts / Finance | Sales-side receivables | `Invoice`, `PaymentReceipt`, `CreditNote` | `dueDate`, `paymentDate`, `dueDateOverride` | `paymentStatus`, statuses above | `/invoices`, `/payment-receipts`, `/credit-notes` | **High** — this is where "due/overdue money" lives; **no separate Accounts module exists** |
| Other | Documents | `DocumentRepositoryEntry`, `DocumentVersion` | `createdAt`, `uploadedAt` | `visibility` (`DocumentVisibility`) | `/documents` | Low for calendar |
| Other | Notifications | `Notification` | **`nextReminderAt`**, `readAt`, `resolvedAt`, `createdAt` | `priority` (LOW/NORMAL/HIGH/URGENT), `status` (UNREAD/READ/RESOLVED) | `/notifications`, `/notifications/unread-count` | **High as a reminder source** |
| Other | Audit | `production/AuditLog`, `AuditController` | **`eventTime`** (Instant) | `AuditAction`, `AuditModule` | `/audit` | Low/Medium — activity log, not planned work |
| Other | Admin / Users / Settings / Masters | `User`, `AppSetting`, `GridConfig`, `City`/`District`/`StateRegion` | timestamps | `UserRole` (ADMIN/MANAGER/USER) | `/users`, `/settings/*`, `/masters` | Low |

---

## 3. Calendar-Relevant Data Inventory

One row per record type that can produce a Calendar entry. **Stored vs derived** says whether the date/status is a column or
computed by a service.

| # | Entity | Primary identifier | Display title/reference | Scheduled / due date | Time of day | Status (actual values) | Responsible person | API + DTO | Stored / derived | Linked records required |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `FollowUp` | `id` | lead/client name + subject (UNVERIFIED field list beyond dates) | `followupDate`, `nextFollowupDate` | — | `status` (OPEN/COMPLETED/RESCHEDULED; compared case-insensitively) | — (UNVERIFIED) | `/followups` | stored | Lead/Client link |
| 2 | `Quotation` | `id` | `quotationNo` | `validUntil` | — | status vocabulary above | `leadNo` reference | `/quotations` | stored | CPR/PR reference |
| 3 | `SalesContract` | `id` | `scNo` | `validity`, `contractDate` | — | draft/submitted/approved/active/completed/cancelled | — | `/sales-contracts` | stored | PO ref |
| 4 | `SalesOrder` | `id` | `soNo` | `deliveryDate`, `actionDeadline` | — | draft/pending review/approved/in progress/completed/cancelled | — | `/sales-orders` | stored | contract/quotation refs |
| 5 | `SalesOrderEAction` | `id` | `assignedAction` + `cpoReference` | `requestedOn` (deadline-ish), `startedOn`, `completedOn` | datetime | `status` (String) | **`assignedTo`, `participantTeam`** | `/sales-orders/e-actions` (FE route) | stored | Sales order |
| 6 | `ProformaInvoice` | `id` | `piNo` | `validTill`, `invoiceDate` | — | draft/sent/paid/overdue/accepted/expired/converted/cancelled | — | `/proforma-invoices` | stored | contract/appendix POs |
| 7 | `DeliveryChallan` | `id` | `dcNo` | `dispatchDate`, `deliveryDate` | — | draft/packed/dispatched/in transit/delivered/cancelled | — | `/delivery-challans` | stored | SO ref |
| 8 | `Invoice` | `id` | `invoiceNo` | **`dueDate`** | — | status + `paymentStatus` | — | `/invoices` | stored (status also written by service) | contract/PO refs |
| 9 | `CreditNote` | `id` | `cnNo` | `dueDateOverride`, `destinationReachedDate` | — | draft/pending approval/approved/issued/adjusted/refunded/cancelled | — | `/credit-notes` | stored | invoice ref |
| 10 | `PaymentReceipt` | `id` | `receiptNo` | `paymentDate` | — | draft/received/partial/completed/cancelled | — | `/payment-receipts` | stored | invoice ref |
| 11 | `Cpr` | `id` | `prNo` | `requiredDate`, `quotationDeadline`, `extendedDeadline` | — | `status`, `approvalStatus` enums | — | `/cprs` | stored | lead ref |
| 12 | `CprTechnicalVerification` | `id` | (ref no UNVERIFIED) | `verificationDate`, `nextReviewDate` | — | `TechnicalVerificationStatus` | — | `/cpr-technical-verifications` | stored | CPR |
| 13 | `PurchaseRequisition` | `id` | `prNo` | `date` (String), `expectedDate` (String), `approvalDate` | — | `status`, `approvalStatus`, `recordState` | `requester` | `/api/purchase/requisitions`, work queue | stored | RFQ/PO links |
| 14 | `PurchaseRfq` | `id` | `rfqNo` | `dueDate` (String) | — | `status`, `approvalStatus` | `requester` | work queue `rfq-actions` | stored | PR |
| 15 | `PurchaseRfqFollowUp` | `id` | RFQ no (UNVERIFIED) | `followUpDate`, `lastContact` | — | `workflowStatus`, `recordState` | — | `/api/purchase/rfq-follow-ups` | stored | RFQ/vendor |
| 16 | `PurchaseOrder` | `id` | `poNo` | `expectedDate`, `deliveryDate` (String) | — | `status`, `approvalStatus`, `deliveryStatus` | `vendor` | `/api/purchase/orders`, work queue | stored | RFQ/PR |
| 17 | `PurchaseGrn` | `id` | `grnNo` | `receiptDate` | — | `status` (default `Expected`) | `supplier` | work queue `pending-grns` | stored | PO |
| 18 | `PurchaseInspection` | `id` | `inspectionNo` | `inspectionDate` | — | `status` (default `Pending`) | — | work queue `pending-inspections` | stored | GRN |
| 19 | `PurchaseShipment` | `id` | `shipmentNo` | **`eta`**, `dispatchDate`, `receivedOn` | — | UNVERIFIED | — | logistics shipment route | stored | PO/GRN |
| 20 | `PurchaseInvoice` | `id` | `invoiceNo` | `dueDate`, `invoiceDate` (String) | — | `matchStatus`, `status`, `paymentStatus` | `vendor` | `/api/purchase/invoices`, work queue | **`overdue` derived** (`dueDate < today`, string compare) | PO/GRN |
| 21 | `MarketingVisit` | `id` | `companyName` | `scheduleDate`, `appointmentDate`, `followupDate` | **`appointmentTime`** | `visitStatus`, `followupStatus`, `qFormStatus`, `handoverStatus` | `marketer` | `/marketing/visits`, `/marketing/calendar/activities` | stored | location, lead |
| 22 | `MarketingFollowUp` | `id` | company from parent visit | `followupDate` | `time` (used by calendar service) | `status` (default `Pending`) | `createdBy` | `/marketing/calendar/activities` | stored | visit |
| 23 | `QuestionnaireForm` | `id` | `plantName` | `dateOfVisit` | — | `status` (default `Draft` in the mapper) | `marketer` | `/marketing/q-forms` | stored | visit |
| 24 | `MarketingExpenseTrip` | `id` | `destination` | `startDate`, `expectedEndDate`, `tripOnDateTime`, `tripOffDateTime` | `startTime` | `approvalStatus` (default `Draft`) | `marketer` | `/marketing/expenses` | stored | expenses |
| 25 | `MarketingTravelPlan` / `MarketingVisitActivity` | `id` | `marketer` / `companyName` | `startDate`, `endDate` / `activityDate` | — / `activityTime` | `status` | `marketerUserId` (ownership) | `/marketing/calendar/*` | stored | stops, visits |
| 26 | `ProductionOrder` | `id` | `workOrder`, `salesOrderNumber` | **`startDate`, `dueDate`** | — | `OrderStatus` enum, `priority`, `progress` | `department`, `createdBy` | `/production-orders` | stored | items, approval history |
| 27 | `ProductionTracker` | `id` | `cpoNo`, `customer` | `orderDate`, `dueDate` + 6 stage pairs | — | **`currentStatus` derived** (see §4) | `customer` owner only | `/production-trackers` | **derived** | sales order |
| 28 | `QualityInspection` | `id` | (inspection no UNVERIFIED) | `inspectionDate` | — | status (String) | — | `/quality-inspections` | stored | production order |
| 29 | `Dispatch` | `id` | `dispatchNumber`, `salesOrderNumber` | `dispatchDate`, `expectedDeliveryDate` | — | `DispatchStatus` | `customer` | `/dispatch` | stored | packing list, work order |
| 30 | `Notification` | `id` | `title`, `message` | **`nextReminderAt`** | datetime | `priority`, `status` | `recipientUserId` | `/notifications` | stored | `referenceType`/`referenceId` |

**Note on time-of-day:** only Marketing carries real times of day in a usable string form (`appointmentTime`, follow-up `time`,
activity `activityTime`, expense `startTime`). Every other module stores dates (or datetimes that the code treats as dates), so a
Calendar timeline in Week/Day view would place those entries as all-day items unless a default hour is applied by the Calendar.

---

## 4. Pending, Upcoming, and Overdue Work Matrix

Rules below are **as implemented in code** (file cited). Where a rule is an assumption for future use, it is marked as such.

| Actionable category | Source records | Exact eligibility rule (from code) | Exclusions | Confirmed? |
|---|---|---|---|---|
| Today's scheduled marketing activity | `MarketingVisit` | `appointmentDate == today` **OR** `scheduleDate == today` (`viewSpecification("today")`, `MarketingVisitService`) | none in the predicate | ✅ |
| Upcoming marketing visits | `MarketingVisit` | (`appointmentDate >= today`) or (`appointmentDate is null` and `scheduleDate >= today`), **AND** `visitStatus not in {Completed, Cancelled, No Visit}` | Completed/Cancelled/No Visit | ✅ |
| Pending marketing follow-ups | `MarketingVisit` | `followupStatus == "Pending"` | — | ✅ |
| Overdue marketing follow-ups | `MarketingVisit` | `followupDate < today` **AND** `followupStatus in {Pending, Overdue}` | — | ✅ |
| Sales handover pending | `MarketingVisit` | `handoverStatus == "Ready for Sales"` | — | ✅ |
| Month calendar entries (Marketing) | 6 tables | date field within `[month start, month end]` per repository finders | travel plans filtered by owner unless ADMIN/MANAGER | ✅ |
| Open / overdue / due-today / due-this-week follow-ups (CRM) | `FollowUp` | open = `lower(status) == 'open'`; **overdue** = open **and** `nextFollowupDate < today`; due today = open **and** `followupDate == today`; due this week = open **and** `nextFollowupDate ∈ [today, today+7)` | non-open statuses; `archivedAt` via `countActive*` variants | ✅ |
| PR awaiting approval | `PurchaseRequisition` | `status == "Pending Approval"` **AND** `recordState == RECORD_ACTIVE` | converted/inactive records | ✅ |
| RFQ actions | `PurchaseRfq` | `status ∈ {Pending Approval, Quotation Received, Evaluation, 1st Approval, 2nd Approval, Final Approval}` | — | ✅ |
| PO approvals / releases | `PurchaseOrder` | approvals `status == "Pending Approval"` (`countByStatus`); releases `status == "Approved"` (`countByStatus`, category hint "Approved orders not yet released to suppliers") — the count method itself does **not** test `releasedAt` | — | ✅ for the status predicate; ⚠️ the "not yet released" part is the category's documented meaning, not a separate null check in code |
| Supplier acknowledgements | `PurchaseOrder` | `status ∈ {Released, Supplier Acknowledged, In Progress, Partially Delivered}` via the dedicated `findPendingAcknowledgements` / `countPendingAcknowledgements` queries | — | ✅ for the status list; ⚠️ the `acknowledgedAt is null` part is implied by the method name, not read line-by-line in this audit |
| Pending GRNs | `PurchaseGrn` | `status == "Expected"` | — | ✅ |
| Pending inspections | `PurchaseInspection` | `status == "Pending"` | — | ✅ |
| Invoice matching | `PurchaseInvoice` | `matchStatus ∈ {Pending Match, Mismatch}` | — | ✅ |
| Invoice approvals | `PurchaseInvoice` | `status == "Submitted"` | — | ✅ |
| **Payments due / overdue** | `PurchaseInvoice` | due set = "matched + nothing paid" (`findPaymentsDue`); **overdue** = `dueDate` non-blank **and** `dueDate.compareTo(today) < 0` (string comparison — both are `yyyy-MM-dd`) | paid invoices; blank due dates | ✅ (string compare, not a parsed date) |
| Payment reminders (notifications) | `PurchaseInvoice` | daily 08:00 job publishes `PAYMENT_DUE` once, then `PAYMENT_OVERDUE` once when past due; publisher dedupes per module/reference/type/recipient | — | ✅ |
| Pending approvals (all modules) | 8 module stats | `cpr.pendingApproval`, `cprTv.underVerification`, `quotation.pendingapproval`, `salesContract.underreview`, `salesOrder.pendingreview`, `creditNote.pendingApproval`; Cost/Profit Workout deliberately **0** | drafts/approved/rejected/archived/deleted; "Submitted" is not counted as pending | ✅ (`ApprovalSummaryService`) |
| Production overdue ("DELAYED") | `ProductionTracker` | `dueDate != null` **and** `LocalDate.now().isAfter(dueDate)` **and** `dispatchPct < 100` | completed trackers | ✅ |
| Completed / not started (production) | `ProductionTracker` | `COMPLETED` when `dispatchPct == 100`; `NOT_STARTED` when all six percentages are 0; otherwise `IN_PROGRESS` | — | ✅ |
| Pending drawing/model verification | `Drawing`, `Model` | `verificationStatus == PENDING` | VERIFIED/REJECTED | ✅ (status default is `PENDING`) |
| Sales-side pending queues | dashboards | `draft/pending` counts per document via `countCurrentByStatus` (current revisions only) | non-current revisions | ✅ (`stats()` lists) |

**Pending work with NO reliable date** (must be reported separately, never given an invented Calendar date):

- Purchase **PO approvals**, **PO releases**, **supplier acknowledgements**, **invoice matching** and **invoice approvals** — the
  queue exposes `date` (order/invoice date) but no per-action deadline; `PurchaseOrder.expectedDate` is the closest thing and is a
  `String`.
- Sales **pending approvals** for quotations/contracts/orders/credit notes — count-level only; no approval deadline field.
- CPR **TV under verification**, **pending drawing/model verification** — no target date.
- Dashboard-level **pendingCustomersCprs / pendingPayments** style counters — counts only.

**Ambiguity flagged (not resolved by code):** whether a *past-dated* purchase `expectedDate`/`deliveryDate` should be presented as
"overdue delivery" — no such rule exists in code (only the payment-due rule does it). This must be an explicit product decision.

---

## 5. API Readiness Matrix

**Reusable as-is (read-only, already structured for a Calendar-style feed):**

| Endpoint | Controller | Response | What it already gives the Calendar |
|---|---|---|---|
| `GET /marketing/calendar/activities?year&month` | `MarketingCalendarController` | `List<CalendarEvent>` | id, type, date, title, assignedTo, status, contactPerson, location, time, linkPath, entityId |
| `GET /marketing/calendar/today` | " | `List<CalendarEvent>` | today's marketing entries |
| `GET /marketing/calendar/summary?year&month` | " | `Map<type,count>` | KPI counts by activity type |
| `GET /api/purchase/work-queue` | `PurchaseWorkQueueController` | `Map` (categories + items + total) | 10 pending categories, each item with `number`, `title`, `vendor`, `status`, `date`, `dueDate`/`expectedDate`, `route`, `actionLabel`, and `overdue` for payments |
| `GET /api/purchase/work-queue/counts`, `/{category}` | " | `Map` | exact counts; single-category drill-down |
| `GET /approvals/summary` | `ApprovalSummaryController` | `Map<String,Long>` | per-module pending-approval counts (badge source) |
| `GET /marketing/visits?...&view=today\|upcoming\|overdue\|pending-followups&dateFrom&dateTo` | `MarketingController` | `Page<MarketingVisitResponse>` | server-side tab + date-range filtering already implemented |
| `GET /api/purchase/rfq-follow-ups` | `PurchaseRfqFollowUpController` | `Page<Map>` | follow-up dates + workflow status |
| `GET /notifications` | `NotificationController` | `List<NotificationResponse>` | reminders with `nextReminderAt`, priority, module, reference |

**Existing endpoints whose response already contains date + status + reference (usable with per-module mapping):**
`/quotations`, `/sales-contracts`, `/sales-orders`, `/proforma-invoices`, `/delivery-challans`, `/invoices`, `/credit-notes`,
`/payment-receipts`, `/cprs`, `/cpr-technical-verifications`, `/cost-workouts`, `/profit-workouts`,
`/api/purchase/requisitions`, `/api/purchase/orders`, `/api/purchase/invoices`, `/production-orders`, `/production-trackers`,
`/quality-inspections`, `/dispatch`, `/packing`, `/drawings`, `/models`, `/technical-verifications`, `/followups`, `/customers`,
`/leads`, `/documents`, plus the per-module `/stats` endpoints used by `ApprovalSummaryService`.

**Gaps (verified):**

- **No ERP-wide calendar/aggregation endpoint exists** outside Marketing, and no module other than Marketing exposes an
  entity→calendar mapper. A Purchase/Sales/Production/CPR entry today would have to be assembled by the Calendar itself.
- **No date-range query support in the sales/purchase repositories inspected:** `SalesOrderRepository`, `InvoiceRepository`,
  `QuotationRepository`, `PurchaseOrderRepository`, `PurchaseRequisitionRepository`, `PurchaseInvoiceRepository` expose
  status/count queries and `findCurrentDatesAndTotalsByStatusIn(...)` aggregates, but no `findBy<something>DateBetween(...)`.
  Marketing repositories **do** (`findByScheduleDateBetweenAndDeletedFalse`, `findByFollowupDateBetween`,
  `findByDateOfVisitBetween`, `findByStartDateBetween`, `findByActivityDateBetweenOrderByActivityDateAscIdAsc`).
- **Time-of-day is not exposed for non-Marketing records** (no times exist on those entities anyway).
- **No explicit "calendar entry" projection** for purchase/sales records — no DTO combining reference + date + status + route.
- **Dashboard is not a feed:** `/dashboard/stats` is a flat `Map` of counts, and `DashboardAggregationService.ZERO_PLACEHOLDER_KEYS`
  publishes `totalExpenses`, `netProfit`, `cashBalance`, `totalVendors`, `purchaseOrders`, **`pendingReceipts`**,
  **`pendingPayments`**, **`openFollowups`**, **`overdueFollowups`**, `totalFollowups` and five CPR-TV keys as literal `0`.
  Calendar entries must come from the module APIs, not from these keys.

**Data present in the DB but not exposed for scheduling:** `PurchaseOrder.deliveryStatus`/`advanceStatus`; `ProductionOrder.currentStage`
(engine-level detail); `MarketingExpense.billStatus`; the six `ProductionTracker` stage date pairs are exposed on the tracker list but
never rendered as a schedule anywhere.

**Authorization that must be preserved (confirmed):** `DashboardController` is `@PreAuthorize("isAuthenticated()")`;
`ApprovalSummaryService` reuses module `stats()` which are permission-gated; Purchase endpoints sit behind the purchase permission
set; Marketing write endpoints require `MARKETING_CREATE`/`MARKETING_EDIT`; `MarketingCalendarService` filters travel plans by owner
(ADMIN/MANAGER see all); `Permission` → `RolePermissions` maps ADMIN/MANAGER/USER to module permissions (`MARKETING_VIEW`,
`PURCHASE_VIEW`, `SALES_VIEW`, `CPR_VIEW`, `PRODUCTION_VIEW`, `CRM_VIEW`, `DOCUMENT_VIEW`, `NOTIFICATION_VIEW`).

---

## 6. Existing Calendar Gap Analysis

**What the Calendar can do today** (`src/pages/calendar/*`):

- Month / Week / Day views, category chips, Today, Today Allocated (pending-only filter), a time-only live clock, Add/Edit/Delete
  event dialog, and scoped wheel zoom.
- Data model: `calendarEvents.js` keeps events **only in browser `localStorage`** under the key `erp-calendar-events`, with fields
  `id`, `title`, `date` (YYYY-MM-DD), `start` (HH:MM), `end` (HH:MM), `category`, `description`, `source: "local"`, `createdAt`,
  `updatedAt`. Seven categories exist (`sales`, `crm`, `marketing`, `purchase`, `production`, `engineering`, `general`); the
  visible chip row currently shows five (Marketing, Sales, Purchase, Production, General).
- `listEvents()` treats storage as untrusted input; `saveEvents()` writes the whole list back; `buildEvent()` stamps
  `source: 'local'`.

**What is missing to show real ERP data:**

1. **No source linkage.** Local events have no `module`, `recordId`, `referenceNo` or `route`, so nothing can be tied back to a
   business record.
2. **No distinction between manual and derived entries.** `source` exists but only ever holds `'local'`; a derived feed needs
   `source: 'erp'` (plus `module`, `recordId`, `dateField`).
3. **No de-duplication key.** Merging module feeds would need a deterministic id such as `purchase:PurchaseOrder:123:expectedDate`;
   otherwise the same PO returned from two endpoints appears twice.
4. **No all-day concept.** `start`/`end` are required by `buildEvent`, so a due date without a time cannot be represented; the
   Week/Day grids need an all-day lane or a default hour.
5. **No "task vs event" distinction.** A deadline ("Invoice due") and a scheduled activity ("Site visit 09:00") look identical
   today; the grid needs a marker for deadline-only entries.
6. **No read API client for ERP dates.** The Calendar page calls no module API today (its only network calls come from shared
   providers), and the module services live in `src/services`, `src/purchase/services`, `src/production/*` etc.
7. **Permissions decide what may be shown.** Any feed must respect the caller's module permissions (and record ownership where the
   backend enforces it, e.g. travel plans), and must not leak records the user cannot open.

---

## 7. Recommended Backend Integration Architecture

Recommended: **one new read-only aggregation module + one endpoint**, mirroring the proven Marketing design, with **no schema change**.

1. **New module (Modular Monolith shape):** `com.vishatech.erp.calendar` with:
   - `api/CalendarSourcePort` — `List<CalendarEntry> entriesFor(LocalDate from, LocalDate to)`.
   - `dto/CalendarEntry` — mirror the existing marketing record, extended:
     `id`, `module`, `type`, `recordId`, `referenceNo`, `title`, `date`, `time?`, `allDay`, `status`, `statusGroup`,
     `assignedTo?`, `route`, `dateField`, `sourceDateKind` (`DUE` | `SCHEDULED` | `EXPECTED` | `FOLLOW_UP` | `APPROVAL` | `OVERDUE_ELIGIBLE`).
   - `service/CalendarAggregationService` — calls one port per module, merges, sorts by date/time, tags `overdue` **only** where a
     module already defines it.
   - `controller/CalendarController` — `GET /calendar/entries?from&to&modules&statuses&entityId` (+ optional
     `/calendar/summary`) behind `@PreAuthorize("isAuthenticated()")`, returning a compact payload.
2. **Per-module adapters (ports implemented inside each module's own package, not by reaching into other modules' internals):**
   `CalendarSourcePort` implementations for Marketing (wrap the existing `MarketingCalendarService` — do not duplicate it),
   Purchase (wrap `PurchaseWorkQueueService` for pending + `PurchaseOrder`/`PurchaseShipment`/`PurchaseInvoice` expected/due dates),
   Sales (`Quotation.validUntil`, `SalesOrder.deliveryDate`/`actionDeadline`, `Invoice.dueDate`, `ProformaInvoice.validTill`,
   `DeliveryChallan.dispatchDate`, `SalesOrderEAction.requestedOn`), CRM (`FollowUp.followupDate`/`nextFollowupDate`), CPR
   (`requiredDate`, `quotationDeadline`, `extendedDeadline`, `verificationDate`, `nextReviewDate`), Production
   (`ProductionOrder.startDate/dueDate`, `ProductionTracker` stage pairs + `DELAYED`, `Dispatch.expectedDeliveryDate`,
   `QualityInspection.inspectionDate`).
3. **Queries:** add **date-range read methods** to the repositories of the modules that lack them (sales/purchase are missing them —
   §5). One bounded query per module per range with `PageRequest`/`limit`, plus a batch lookup of referenced parents (e.g. RFQ → PR,
   invoice → PO) to avoid N+1. Prefer one range query per entity type over per-record fetches.
4. **Identity & dedupe:** `id = "<module>:<EntityName>:<recordId>:<dateField>:<yyyy-MM-dd>"`; refresh replaces the whole derived
   set, and the Calendar keeps local events untouched in a separate list. Render `source: 'erp'` entries as read-only
   (navigation only, no edit/delete of the business record).
5. **Merging with the existing Calendar:** keep `listEvents()`/`saveEvents()` for manual events; add a *separate* fetch hook for
   derived entries, merged in memory under a stable key. Local events are never overwritten, and a derived entry never creates a
   local event.
6. **Missing dates / inactive records:** skip records with a null date; exclude statuses that mean inactive (`CANCELLED`, `DELETED`,
   `ARCHIVED`, `REJECTED`, `OBSOLETE`) from actionable feeds but allow them in a "history" toggle; never classify a past date as
   overdue unless the module defines it (only purchase payments, CRM follow-ups and production trackers do today).
7. **Filtering:** server-side `from`/`to` (mandatory, capped range), `modules`, `statuses`/`statusGroup`
   (`PENDING_APPROVAL`, `IN_PROGRESS`, `OVERDUE`, `COMPLETED`), and optional `entityId` drill-down; re-use existing predicates
   (`PurchaseWorkQueueService`, `viewSpecification`, follow-up open/overdue rules) rather than re-deriving them.
8. **Permissions:** the endpoint is authenticated; each port filters by the caller's module permission (reuse `Permission` /
   `RolePermissions` + existing record-ownership rules, e.g. marketing travel plans) and returns only records the caller may open.
9. **Schema:** **not necessary.** Every field needed already exists. The only "schema-adjacent" recommendation is normalising the
   string-typed purchase dates (`PurchaseRequisition.date/expectedDate`, `PurchaseOrder.orderDate/expectedDate/deliveryDate`,
   `PurchaseRfq.dueDate`, `PurchaseInvoice.invoiceDate/dueDate`) to typed columns in a *later* phase, optionally with a
   compatibility read (parse `yyyy-MM-dd`, tolerate blanks).

---

## 8. Missing Information and Risks

| # | Risk | Evidence | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Purchase dates are `String`, not dates** | `PurchaseRequisition.date/expectedDate`, `PurchaseOrder.orderDate/expectedDate/deliveryDate`, `PurchaseRfq.dueDate`, `PurchaseInvoice.invoiceDate/dueDate` are all `private String` | Range queries, sorting and overdue tests are string compares; malformed values would silently misorder | Parse defensively (`yyyy-MM-dd`), treat unparsable as "no date"; normalise columns later without breaking the API |
| 2 | **Dashboard publishes zero placeholders** | `DashboardAggregationService.ZERO_PLACEHOLDER_KEYS` includes `overdueFollowups`, `openFollowups`, `pendingReceipts`, `pendingPayments` | A Calendar built on `/dashboard/stats` would show **0** for real pending work | Use module APIs / CRM ports, never those keys |
| 3 | **Status vocabularies are free-text Strings with several spellings** | Purchase uses `"Pending Approval"`, `"Approved"`, `"Released"`, …; sales uses lowercase (`"pending review"`, `"in progress"`); `Invoice` has both `status` and `paymentStatus` | Case/spelling mismatches produce wrong counts and wrong "pending" badges | Reuse existing predicates/case-insensitive helpers; never re-implement status matching client-side |
| 4 | **No date-range read APIs in sales/purchase** | §5 repository scan | A wide Calendar range could require full-table reads or N+1 | Add bounded `findBy<dateField>Between` methods in the owning module |
| 5 | **Time-of-day missing outside Marketing** | Entity sweep — only marketing carries `appointmentTime`/`time`/`activityTime`/`startTime` | Week/Day view cannot place ERP entries at an hour | Model as all-day entries (`allDay: true`) with a "due" marker |
| 6 | **Overdue semantics exist for only three areas** | Payment due (`PurchaseWorkQueueService`, `PurchasePaymentReminderScheduler`), CRM follow-ups (`countOpenOverdue`), production trackers (`DELAYED`) | A past `expectedDate`/`deliveryDate` on a PO has no code-defined "overdue" meaning | Product decision required; if adopted, document the rule and implement it once, server-side |
| 7 | **Soft-delete / archive is inconsistent** | CRM uses `status = DELETED`/`ARCHIVED` (`LeadStatus`, `Contact.STATUS_*`); sales/purchase/CPR use `archivedAt`; purchase uses `recordState` (`"active"`, `RECORD_ACTIVE`); Marketing visits use `deletedFalse` | Different exclusion rules per module; a generic "skip deleted" would be wrong | Per-module exclusion predicates in the adapters |
| 8 | **Ownership/authorization varies** | Marketing travel plans owner-only unless ADMIN/MANAGER; CRM/marketing scoping in services; module permission sets in `RolePermissions` | Leaking another user's activities, or hiding legitimate work | Enforce per-port scoping; reuse existing service methods instead of raw repositories |
| 9 | **Large volume / unbounded ranges** | 162 entity classes; multi-year documents; no calendar index exists yet | A 5-year Calendar range could be heavy | Mandatory capped range (e.g. ≤ 92 days), `limit` per module, optional short-TTL cache |
| 10 | **Timezone/format drift** | Entities mix `LocalDate`, `LocalDateTime` (often date-at-midnight) and `Instant`; frontend uses browser-local time (`formatClockTime`) and `YYYY-MM-DD` keys | Off-by-one-day entries around midnight/timezones | Normalise server-side to a local `LocalDate` and send `yyyy-MM-dd` |
| 11 | **Frontend Calendar currently has no ERP link** | `calendarEvents.js` — no `module`/`recordId`/`route` fields; `source` is always `'local'` | Derived entries cannot navigate to their source record | Extend the derived-entry shape only (do not migrate local events) |
| 12 | **Two CRM/marketing lead concepts coexist** | `MarketingLead` (marketing) vs CRM `Lead` | Duplicate-looking entries | Keep module namespaces distinct in the entry id and label them by module |
| 13 | **Not verified: actual data quality** | No DB access was used (read-only, no SQL) | How many string dates are blank/malformed, and real volumes, are unknown | Verify in the implementation phase with aggregate SQL (counts of blank/unparsable dates) before relying on them |
| 14 | **Not verified: schema baseline completeness** | `erp-backend/docs/schema_baseline.sql` is 102 KB but matched only 3 `CREATE TABLE` statements | It is not a full 162-entity schema snapshot | Do not treat it as the schema source of truth; verify against the live schema (`spring.jpa.hibernate.ddl-auto=validate`) |
| 15 | **Stage-level production dates are not surfaced anywhere** | `ProductionTracker` six start/end pairs exist but no UI/API projection renders them | High value (Gantt-like calendar) but currently invisible | Expose via the tracker list/adapter rather than new tables |

---

## 9. Implementation Priority

**Phase 1 — highest value, lowest risk (reads only, predicates already exist)**
1. Marketings already done — expose it through the new aggregation endpoint as the reference implementation.
2. Purchase pending work (`PurchaseWorkQueueService` categories + payment due/overdue) and purchase expected/ETA dates
   (`PurchaseOrder.expectedDate`, `PurchaseShipment.eta`, `PurchaseManufacturingJob.expectedDate`).
3. CRM/CPR follow-ups and deadlines (`FollowUp.followupDate`/`nextFollowupDate`, `Cpr.requiredDate`/`quotationDeadline`,
   `CprTechnicalVerification.nextReviewDate`).
4. Sales due dates (`Quotation.validUntil`, `SalesOrder.deliveryDate`/`actionDeadline`, `Invoice.dueDate`,
   `ProformaInvoice.validTill`, `DeliveryChallan.dispatchDate`).

**Phase 2 — production & quality schedules**
5. `ProductionOrder.startDate/dueDate` (with `priority`), `ProductionTracker` stage dates + `DELAYED`, `QualityInspection.inspectionDate`,
   `Dispatch.expectedDeliveryDate`, pending drawing/model verification.

**Phase 3 — supporting signals**
6. `Notification.nextReminderAt` as a reminder lane; `SalesOrderEAction` request/complete timestamps (already has an owner).
7. Documents/audit history (low value for forward planning).

**Phase 4 — data quality**
8. Normalise string-typed purchase dates to typed columns (with a compatibility parse), add missing date-range repository methods,
   and add DB indexes on the date columns actually used by range queries.

**Phase 5 — out of scope of this audit:** any Calendar write-back (creating ERP records from Calendar events) — requires business
rules and approvals per module, and is explicitly not recommended yet.

---

## 10. Verification and Database Impact

**Inspection methods actually used (all read-only):**

- Directory/package enumeration: `find` over `erp-backend/src/main/java` (779 Java files; 162 entity classes) and `src/`
  frontend modules.
- Field sweeps: per-entity extraction of `LocalDate`/`LocalDateTime`/`Instant` fields and of `*Status`/`*State`/`*Stage`/`*Priority`
  fields across all entity packages.
- Enum extraction with values (`OrderStatus`, `TVStatus`, `DrawingStatus`, `DrawingRevisionStatus`, `ModelStatus`, `EntryStatus`,
  `Priority`, `ProductionType`, `DispatchStatus`, `PackingStatus`, `CprStatus`, `CprApprovalStatus`, `TechnicalVerificationStatus`,
  `CostWorkoutStatus`, `ProfitWorkoutStatus`, `LeadStage`, `LeadStatus`, `UserRole`, `Permission`, `AuditAction`, `AuditModule`,
  `DocumentVisibility`).
- Controller/route inventory (all `*Controller` base paths) and `@GetMapping` enumeration for the modules relevant to scheduling.
- Targeted source reads: `MarketingCalendarService`, `MarketingCalendarController`, `PurchaseWorkQueueService`,
  `PurchaseWorkQueueController`, `ApprovalSummaryService`, `NotificationScheduler`, `PurchasePaymentReminderScheduler`,
  `DashboardController`, `DashboardStats`, `DashboardAggregationService` (head), `CrmDashboardReadAdapter`,
  `MarketingController` (visit list), `MarketingVisitService.viewSpecification`, production tracker status derivation.
- Repository scan for date-range finders (`Between`/`findBy*Date`) and status-count queries.
- Configuration read: `erp-backend/src/main/resources/application.properties` (MySQL `erp_db`, `ddl-auto=validate`,
  `open-in-view=false`).

**Checks NOT performed (stated plainly, not claimed as verified):**

- No backend was started, no endpoint was called, no HTTP request was issued to the application.
- No SQL was executed; the database (`erp_db`) was neither read nor written; row counts, data quality and live schema were not
  inspected. The `schema_baseline.sql` file was noted but is not a complete schema snapshot (see §8.14).
- No write-capable test, seeder, migration or business workflow was run.
- Status vocabularies were taken from entity defaults, service `stats()` lists and work-queue constants; **string statuses set only
  in frontend forms or seed data were not exhaustively enumerated** (marked UNVERIFIED where relevant).
- Purchase `PurchaseShipment`/`PurchaseManufacturingJob`/`Castings`-level status values were not enumerated in detail.

**Impact statement:** **No application code, CSS, configuration, API, entity, repository, business logic, database schema or
database data was modified. No existing report or documentation file was changed. No packages were installed. No files were
staged, committed, reset or cleaned. The only new artifact is this report:
`ERP_CALENDAR_BACKEND_READINESS_AUDIT.md`.**

**Recommended next step:** review this report, then approve a *separate* implementation task for Phases 1–2 only
(read-only aggregation endpoint + adapters for Marketing, Purchase, CRM/CPR, Sales, Production).
