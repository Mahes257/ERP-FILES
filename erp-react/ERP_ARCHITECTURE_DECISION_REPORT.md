# ERP Architecture Decision Report — Modular Monolith vs Microservices

> **Type:** READ-ONLY architecture decision audit. No source, schema, configuration, dependency or
> Git change was made. The only artifact created is this report.
>
> **Date:** 2026-10-13 (UTC+05:30)
> **Repository:** `C:\Users\Mahes\Desktop\Sri\erp-react`
> **Inputs reviewed:** the live repository, `ERP_TECHNICAL_AUDIT.md`, `ERP_BASELINE_VERIFICATION.md`.
>
> **Evidence marking:** **[VERIFIED]** = confirmed by a command/file in this session;
> **[INFERRED]** = reasoned from evidence; **[NOT VERIFIED]** = could not be confirmed safely.

---

## 1. Executive Summary

**Recommendation: Option B — keep ONE deployable Spring Boot backend and invest in stronger internal
module boundaries.** Microservices are **not necessary now**; the proposed three-way
Sales/Purchase/Production split is a *possible future goal*, not a justified move today.

Evidence that drove this:

1. **The modules are already fairly cleanly separated in code.** This session's fresh checks found
   **no Sales → Production code dependency at all**, and **Production → Sales is confined to a single
   service** (`ProductionOrderService`) plus an HTTP read-model the frontend already uses
   (`GET /sales-orders/options`, `GET /sales-orders/{id}`). Purchase depends on shared
   infrastructure (users, notifications, numbering, totals), not on Sales or Production data.
   **[VERIFIED]** A "big ball of mud" this is not — the coupling that remains is mostly *shared
   infrastructure*, not tangled business logic.
2. **The project is a modular monolith, not a microservices system.** One Spring Boot 3.4.13 app
   (75 controllers, 93 services, 163 entities, 110 repositories, 656 `@PreAuthorize`,
   130 tables), context path `/v1`, port 8080, one shared MySQL `erp_db`. **[VERIFIED]**
3. **The real migration blockers are data ownership and shared cross-cutting services — not Java
   packages.** One database with cross-module foreign keys, one JWT/auth model, one file-storage
   root, shared master data and shared `auto_number_sequences` numbering are used by every module.
   Splitting the runtime without first fixing data ownership would convert in-process calls into
   distributed transactions and partial-failure bugs.
4. **The baseline is not yet safe to build on.** The tree is dirty (133 modified / 1 deleted / 65
   untracked), the new Contacts code depends on a `contacts` table absent from the checked-in schema
   under `ddl-auto=validate`, lint fails (863 problems), 2 frontend contract tests fail, and no
   critical workflow has end-to-end verification. **[VERIFIED]**
5. **The target hardware is a single physical server.** Multiple Spring Boot JVMs on one box add
   memory/CPU overhead and operational surface without providing the isolation or independent
   scaling that justify microservices — the main reasons to adopt them.

**Microservices:** ❌ **NO-GO now.** Revisit only after the stabilisation and boundary work (Phases
1–4) is complete and measurable pain appears (see §8 conditions).

---

## 2. Verified Current Architecture

Re-verified this session against the live repository (not copied from prior reports):

| Aspect | Verified fact |
|---|---|
| Git | branch `main`, HEAD `61859bf`, working tree **132→133 modified / 1 deleted / 65 untracked** (unchanged from the baseline report) |
| Backend | **one** Spring Boot 3.4.13 app, Java 21 target, Maven `./mvnw` |
| Backend shape | **75 controllers, 93 services, 163 entities, 110 repositories**, 656 `@PreAuthorize` |
| Backend boundary | context path `/v1`, port `${ERP_PORT:8080}`, `ddl-auto=${ERP_DDL_AUTO:validate}` |
| Frontend | React 19.2 + Vite 8.2 + Tailwind 4.3, `react-router-dom` 7, one Axios instance base `/v1`, dev proxy `/v1 → :8080` |
| Database | **one** shared MySQL, schema `erp_db`, **130 tables** (`erp_db_schema_latest.sql`) |
| Auth | one stateless JWT (Bearer) + rotating refresh tokens; roles `ADMIN/MANAGER/USER`; 656 method guards |
| Cross-cutting | one file-storage root (`ERP_UPLOAD_DIR`), document repository, notifications (STOMP `/ws`), master data, numbering (`auto_number_sequences`) |
| Background work | `NotificationScheduler`, `PurchasePaymentReminderScheduler`, `ProcessingJobRecoveryJob`, `AttachmentStorageReconciliationJob`, `ProcessingJobAsyncConfig`, `ContactBackfillRunner` |
| Extras | isolated CAD **worker** = same jar in worker mode, **no port** (not a service) |

**Code-level coupling measured this session [VERIFIED]:**

| Direction | Finding |
|---|---|
| Sales → Production | **None** (no entity/service/repository references) |
| Production → Sales | **Narrow**: `service/production/ProductionOrderService.java` uses `SalesOrder`, `SalesOrderRepository`, `SalesAttachmentRepository`, `dto.SalesAttachmentResponse`; plus `IntegrationService` uses raw `EntityManager` |
| Production → Sales (UI) | Uses the HTTP read-model `GET /sales-orders/options` + `GET /sales-orders/{id}` |
| Purchase → other modules | `entity.User`/`UserRepository`, `Notification`/`NotificationRepository`, `util.PurchaseNumbering`, `util.PurchaseTotals`, `util.AuditContext`, and production `AuditModule`/`AuditAction` **enums only** — no Sales/Production data |
| Shared infra reach | **28** service classes reference master data / notifications / attachments / document repository; **23** entities reference `Customer`; **5** services use shared numbering utilities |

**Interpretation:** separation of *code concerns* is already reasonably good; separation of *runtime
and data* is essentially absent. That asymmetry is the crux of this decision.

---

## 3. Verified Findings from Both Previous Audit Reports

Each prior finding was re-checked in this session. **Only one has changed materially.**

| # | Prior finding | Re-check result this session |
|---|---|---|
| 1 | Contacts implementation depends on a `contacts` table not in the schema; live DB unverified | **Still true.** `erp_db_schema_latest.sql` contains **0** `CREATE TABLE ... contacts`; only the untracked `contacts_migration.sql` defines it. Live DB check **still [NOT VERIFIED]** — no `mysql` client and no Python MySQL driver (`pymysql`/`mysql.connector` both absent). **[VERIFIED]** |
| 2 | Deleted tracked `CrmController.java` vs untracked Contacts | **Unchanged.** `git status` still shows ` D .../CrmController.java`; the legacy `CrmController` exposed only `GET /contacts` over `LeadService`, and the untracked `ContactController` now owns `/contacts` covering every path `contactService.js` calls. **[VERIFIED]** |
| 3 | Frontend lint fails; 2 source tests fail | **Reproduced exactly.** `npm run lint` → **exit 1, 863 problems (779 errors, 84 warnings)**. `production-integration.test.js` → 0 pass/1 fail; `production-kpi-pagination.test.js` → 26 pass/3 fail (stale source-pattern assertions). **[VERIFIED]** |
| 4 | Backend `./mvnw verify` passes | **Re-run and still passes:** `BUILD SUCCESS`, **476 tests, 0 failures, 0 errors**, 3:32 min, exit 0. **[VERIFIED]** (same non-fatal H2 warning: index `idx_ptl_created` on `purchase_timeline.created_at`) |
| 5 | Runtime health & ports | **Reproduced.** MySQL `:3306` (PID 6216), backend `:8080` health `{"status":"UP"}` (PID 28104 `ErpApplication`), frontend `:5173` HTTP 200 (PID 15980) — **not** the 5174 the start script advertises. **[VERIFIED]** |
| 6 | Missing end-to-end verification of critical workflows | **Still unverified.** No authenticated E2E run performed. **[NOT VERIFIED]** |
| 7 | Git modifications/deletions/untracked | **Unchanged:** 133 M / 1 D / 65 ?? (65 = 64 pre-existing + `ERP_TECHNICAL_AUDIT.md`; this decision report will add one more). **[VERIFIED]** |

**Change since the prior reports:** none substantively — the baseline is byte-stable, which is why the
prior build/test conclusions still hold and were re-confirmed rather than assumed.

---

## 4. Monolith vs Microservices — Comparison for THIS Project

Scores are out of 10 for **this ERP's current situation** (single physical server, one codebase/team,
shared MySQL, unreleased baseline). "Micro" = the *proposed* Sales + Purchase + Production + main split.

| Dimension | Monolith (current) | Proposed microservices | Evidence / trade-off |
|---|---|---|---|
| Development complexity | **8** | 4 | Monolith: one build, one IDE, shared types. Micro: duplicated infra/config, contract versioning, 4+ repositories. |
| Deployment & rollback | **8** | 4 | One jar + one `dist` today. Micro: 4 deploy units, coordinated schema, partial-deploy skew, harder atomic rollback. |
| Debugging & monitoring | **8** | 4 | One log stream today. Micro: cross-service tracing needed (not present). |
| Performance & network latency | **8** | 5 | Today: in-process calls, one JVM, one DB connection pool. Micro: HTTP hops for what are now local reads (e.g. every Production→Sales lookup). |
| DB consistency & transactions | **8** | 3 | **Single MySQL with cross-module FKs and one transaction manager.** Splitting DB ownership introduces distributed transactions / sagas; splitting the DB without 2PC risks inconsistency. This is the single strongest argument against microservices here. |
| Auth & authorization | **7** | 4 | One JWT + one `SecurityConfig` + 656 `@PreAuthorize`. Micro requires a shared token strategy and per-service enforcement duplication. |
| Module independence | **6** | 7 | Code is already fairly decoupled (Sales→Production = none), so the microservices upside is real but modest; the gain is limited by shared infra + data. |
| Scalability | **5** | 6 | Microservices win *if* one module needs independent scaling. Today there is one server and no evidence of per-module load skew. |
| Physical-server resources | **8** | 4 | 4 JVMs (each with its own heap, Hikari pool, Spring context) on one box wastes RAM/CPU vs one JVM. |
| Operational maintenance | **8** | 3 | One process to start/stop/log today (`start-all`). Micro multiplies startup, health, backup and version-drift surface — with **no** Nginx/orchestrator in scope. |
| Testing requirements | **7** | 3 | Existing 476 backend tests target one app. Micro needs contract + integration + failure-mode tests per edge before it is safe. |
| Long-term expansion | **6** | 7 | Microservices help serious team/scale growth; but the current ceiling is process, not architecture. |
| Migration risk for this ERP | **9** | 2 | The ERP is **existing, dirty, and unreleased**, with shared DB/FKs and unverified E2E. Extraction risk today is very high; monolith risk is minimal. |
| **Overall (weighted for this project)** | **~7.5 / 10** | **~3.5 / 10** | The dimensions that matter most *now* (data consistency, operational simplicity, migration risk, server constraints) all favour the monolith; the dimensions that favour microservices (independence, scaling) are not yet a demonstrated need. |

**Why not simply "microservices are more modern":** the deciding factors are project-specific — one
server, one team, one shared database, an unreleased baseline, and (critically) code that is *already
reasonably modular*. Modernity is not an outcome; independent deployability, fault isolation and
per-module scaling are — and none is currently constrained by the architecture.

---

## 5. Evaluating the Proposed Boundaries

Proposed: main backend (Dashboard, Marketing, Settings, shared) on 8080; separate **Sales**,
**Purchase**, **Production** backends on TBD ports; one shared React frontend; keep MySQL with a safe
data-ownership design; physical-server deployment; **no Nginx**.

| Proposed service | Runtime/deployment w/ data ownership | Verdict now | Key dependencies / blockers |
|---|---|---|---|
| **Sales** | Would own CPR, Quotations, Contracts, CPO/E-Actions, Delivery, Proforma, Invoices, Receipts, Credit Notes | **Do not extract yet** | Sales is the hub: it is the *supplier* of the Production→Sales read-model and shares `customers`, masters, numbering, documents. But Sales→Production code coupling is **none**, so the seam is cleaner than assumed. Blocked mainly by shared data + unchanged baseline. |
| **Purchase** | Would own PR→RFQ→PO→GRN→Invoice→Payment | **Best first candidate (if any)** | Depends on shared infra (`User`, `Notification`, numbering/totals, audit) and `Users/Notifications` tables — no Sales/Production **data** coupling. Still needs the shared-infra strategy first. |
| **Production** | Would own work orders, shop floor, TV, quality, packing, dispatch, drawings/models | **Extract only after Sales** | Reads `SalesOrder` (one service) + `sales_attachments`; depends on CAD worker, shared storage, masters. If Production ships first, its Sales read must become an API call. |
| **Main (Dashboard/Marketing/Settings/shared)** | Would remain the hub for auth, masters, documents, notifications | **Keep as-is** | Correctly identified as shared. Dashboard aggregates every module → must stay central. |
| **CAD worker** | Already a separate process (same jar, worker mode, no port) | **Leave alone** | Not a microservice; correct as an isolated worker. |

**Boundary soundness conclusion [INFERRED]:** the proposed vertical cuts are *technically plausible*
and align with the code's actual seams, which is better than most monoliths. **But the plan does not
yet include the things that make a service a service:** a per-service data-ownership model, a stable
published API contract, an auth/token strategy across processes, a shared-infra (users/masters/
numbering/documents/notifications) plan, and inter-service failure handling. Without these, moving
controllers into new folders/apps would create **distributed monolith** problems, not microservices.

---

## 6. Final Recommendation with Evidence

### Recommended option: **B — Improve modular boundaries while retaining one deployable Spring Boot backend.**

**Why this is the best fit:**
- The repository **already is** a modular monolith with genuine package/module separation
  (Sales→Production = none; Production→Sales = one service; Purchase = self-contained vs data). **[VERIFIED]**
  Option B formalises and protects boundaries that largely exist — high value, low risk.
- The strongest microservices argument (independent deployability/scaling) is **not yet a real need**:
  one physical server, one team, no per-module load skew evidence. **[INFERRED]**
- The strongest blocker (shared MySQL with cross-module FKs + shared infra) is **not solved by
  moving code**; Option B lets that be addressed deliberately under Phase 3.
- The baseline is unreleased and dirty; hardening it first is **mandatory** regardless of the
  eventual target, so no work is wasted by choosing B now.

**Are microservices necessary now?** **No.** They are a *possible future goal*. **Which module first
if/go when?** Purchase is the most self-contained, but only after shared infra and data ownership are
defined.

**Conditions that would justify changing this decision (to C/D):**
1. A measurable need for **independent scaling** or **independent release cadence** of one module
   (e.g. Production throughput saturating its share of the box).
2. **Data ownership resolved**: per-service schemas/ownership, no cross-service FK reliance, sagas or
   outbox for cross-module flows.
3. **Shared infra extracted first** (auth/identity, master data + numbering, documents/storage,
   notifications) behind stable contracts.
4. **A green, trustworthy regression net** (lint clean, stale tests fixed, critical E2E passing).
5. **Operational capacity** for multiple deploys/monitoring on the physical server (and a decision
   on the reverse proxy — explicitly **out of scope now**).

**Risks of choosing wrong:**
- *Premature microservices:* distributed transactions over shared FKs → data inconsistency; 4×
  operational surface on one box; stalled delivery while the team runs distributed plumbing instead
  of business features; partial deploys during a dirty baseline.
- *Doing nothing (pure A):* module boundaries erode, `@PreAuthorize`/package discipline drifts, and a
  future migration becomes far harder — which is why B > A.

---

## 7. Phased Roadmap (planned only — nothing implemented)

### Phase 1 — Stabilize the current application and establish a reliable baseline
- **Prerequisites:** none.
- **Actions:** reconcile the 133 modified / 1 deleted / 65 untracked changes into coherent, reviewed
  commits; decide the fate of the `CrmController` deletion + untracked Contacts slice as one change;
  confirm `./mvnw verify` and `npm run build` against the committed revision; pin ports/toolchain.
- **Completion criteria:** clean working tree at a tagged revision; build + 476 tests green on that
  revision; runtime start documented.
- **Risks:** losing uncommitted work if mishandled (must **not** reset/clean).
- **Mandatory before proceeding:** **YES.**

### Phase 2 — Resolve verified DB, Git, lint, test and E2E issues
- **Prerequisites:** Phase 1.
- **Actions:** resolve the `contacts` schema gap (apply/add the migration and add it to the schema
  baseline so the app boots under `ddl-auto=validate`); drive lint to green; fix the two stale
  production contract tests; add an aggregate frontend test runner; run the priority E2E workflows
  (auth → CRM → CPR→Quotation→Sales Order → Production; Purchase PR→PO→GRN→Invoice).
- **Completion criteria:** lint exit 0; all frontend tests green; critical workflows E2E-verified;
  schema baseline matches code.
- **Risks:** schema changes need a maintenance window/backup; scope creep.
- **Mandatory:** **YES.**

### Phase 3 — Define module boundaries, API contracts, auth strategy, data ownership
- **Prerequisites:** Phases 1–2.
- **Actions:** document each module's public HTTP contract and data ownership; introduce an enforced
  module boundary in code (e.g. façade/ports so cross-module calls go through defined interfaces, not
  repositories); decide the shared-infra services (identity, masters+numbering, documents/storage,
  notifications); define the auth/token strategy for any future multi-process world; document the
  Production→Sales read contract (already HTTP in the UI).
- **Completion criteria:** written boundary + ownership map; cross-module code calls routed through
  façades; no new direct cross-module repository use.
- **Risks:** under-specified boundaries invite leakage.
- **Mandatory before extraction:** **YES.**

### Phase 4 — Decide whether any module earns independent extraction
- **Prerequisites:** Phase 3.
- **Actions:** evaluate Purchase (most self-contained) against concrete criteria: independent scale or
  release need, clean contracts, data ownership readiness, and operational capacity. Decide
  extract / keep-in-monolith per module.
- **Completion criteria:** documented decision per module with evidence; **"keep in monolith" is an
  acceptable, expected outcome.**
- **Risks:** extracting for architectural fashion rather than need.
- **Mandatory:** decision is mandatory; extraction is not.

### Phase 5 — If justified, plan a reversible incremental migration
- **Prerequisites:** Phase 4 decision + all Phase 2–3 gates.
- **Actions:** strangler-fig extraction of the chosen module: define its DB ownership + migration,
  publish its contract, route the frontend per-module, add rollback (feature-flag/dual-run), add
  cross-service failure handling; extend CI with contract tests.
- **Completion criteria:** chosen module runs independently with rollback proven; remaining monolith
  unaffected; documented runbook.
- **Risks:** distributed transactions, partial failure, data drift.
- **Mandatory:** only if Phase 4 says yes.

---

## 8. Go / No-Go Decision for Microservices Migration

### 🔴 **NO-GO** to begin microservices migration now.

Gates and their state:

| Gate | State |
|---|---|
| Clean, frozen baseline | ❌ dirty (133 M / 1 D / 65 ??) |
| Schema matches code | ❌ `contacts` table missing from schema (live DB unverified) |
| Green quality gates | ⚠️ backend 476 tests pass; lint fails (863); 2 frontend tests fail |
| E2E verification of critical workflows | ❌ not performed |
| Data-ownership model for split | ❌ not defined |
| Shared-infra extraction plan | ❌ not defined |
| Independent scaling/release need | ❌ none demonstrated |
| Operational capacity for N services | ⚠️ single physical server, no proxy in scope |

**Flip to GO only when:** Phases 1–3 complete, the Phase 4 need test is met for a specific module, and
the operational prerequisites exist. Until then, extraction would trade a working monolith for a
distributed system with unresolved consistency and operational risk.

---

## 9. Unresolved Risks and Unverified Items

| Item | Status |
|---|---|
| Live `erp_db` schema vs source (incl. whether `contacts` exists) | **[NOT VERIFIED]** — no `mysql` client, no Python MySQL driver; no writes permitted |
| End-to-end behaviour of critical workflows (auth, Sales, Purchase, Production, CRM, CAD) | **[NOT VERIFIED]** — no authenticated E2E run |
| Which mode Purchase runs in (`VITE_PURCHASE_DATA_MODE` local vs api) in the live build | **[NOT VERIFIED]** |
| CAD worker liveness | **[NOT VERIFIED]** — no separate JVM identified; `/v1/cad-conversion/health` → 401 |
| H2 `purchase_timeline.created_at` index warning vs MySQL `validate` | **[INFERRED RISK]** |
| Whether any uncommitted change introduced lint/test regressions vs HEAD | **[NOT VERIFIED]** (no HEAD checkout performed, by rule) |
| Whether `IntegrationService`'s raw `EntityManager` crosses module tables | **[INFERRED]** — it holds an `EntityManager`; exact queries not exhaustively reviewed |
| Single-instance schedulers (6 job/scheduler classes) under any multi-process split | **[INFERRED RISK]** — they assume one instance |

---

## Final Answer: "Should we continue with the monolithic architecture for now?"

**Yes — continue with the monolith for now, but treat it as a *modular monolith to be improved*, not
one to be split.** The evidence supports **Option B**: formalise and protect module boundaries inside
the existing single Spring Boot backend (which already shows genuinely clean module seams — no
Sales→Production code coupling, narrow Production→Sales coupling, a self-contained Purchase), while
keeping one deployable unit, one shared MySQL, and one frontend. **Microservices are unnecessary at
this point** on a single physical server with a shared database, a dirty/unreleased baseline, and no
demonstrated per-module scaling or release-cadence need; they would introduce distributed-transaction
and operational risk before the project has solved its actual blockers (data ownership, shared
infrastructure, schema/Git/lint/test/E2E hygiene). Revisit the Sales/Purchase/Production split only
after Phases 1–4 make it measurable and safe — and even then, **Purchase**, not Sales or Production,
is the only module that looks independently extractable first.

---

*End of report. Read-only; the only artifact created is this file. No source, schema, configuration,
dependency, or Git state was modified, and no infrastructure (Nginx/Docker) was introduced.*
