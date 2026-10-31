# ERP Final Stabilization — Completion Report

Scope: the consolidated pending items (Sales UI permission awareness, security-test
rate-limit stabilization, CPR bulk-delete authority, Production tracker foreign key,
JWT exposure assessment, safe live API verification).
No secrets were printed, no schema or data in the shared `erp_db` was modified, no
Git staging/commit/reset/clean/stash was performed, and all pre-existing working-tree
changes were left untouched.

---

## 1. Findings and root causes

### 1.1 Sales UI vs backend `SALES_DELETE`
The eight Sales document modules already had backend `SALES_DELETE` guards on every
destructive route (single `DELETE /{id}`, `POST /bulk-delete`,
`POST /bulk-permanent-delete`), but the UI rendered the delete entry points
unconditionally. The role → permission map is single-sourced in
`RolePermissions.permissionsOf`: ADMIN and MANAGER hold `SALES_DELETE`, USER does not.

### 1.2 Security-suite auth rate limiting (the reported ~3-attempt headroom)
Root cause, confirmed from source and reproduced: `RateLimiter` is a **per-Spring-context**
bean whose windows are keyed by **client IP** (`auth:register:<ip>`,
`auth:login:<ip>`, `auth:refresh:<ip>`, plus `login:<email>:<ip>` in `AuthService`).
Every test class that declares the *same* `@TestPropertySource` is served by the *same
cached context*, i.e. the same limiter and the same per-IP counter, and every MockMvc
call arrives from the same IP. So a per-class "budget" is really an **aggregate budget
shared by the whole context group**: once the group's registration attempts crossed the
pinned maximum, later classes received `429` for `POST /auth/register` instead of their
own assertion.

Reproduced before the fix — full suite, `com.vishatech.erp.security.SalesSettingsApiTest`,
5 of 8 methods failing at the register helper: `expected: 201 but was: 429`
(order-dependent, not a logic failure).

### 1.3 CPR delete authorities
`DELETE /cprs/{id}` and `POST /cprs/bulk-delete` are the *restorable* delete
(status → `DELETED`, "CPR moved to trash", reversible) and both require `CPR_EDIT`.
`POST /cprs/bulk-permanent-delete` is the irreversible purge and requires the narrower
`CPR_DELETE`. `RolePermissions`: USER holds `CPR_VIEW`, `CPR_CREATE`, `CPR_EDIT`
(not `CPR_DELETE`); MANAGER/ADMIN hold all four. The reported "inconsistency" is a
deliberate two-level policy, not an accident — see §4.

### 1.4 `production_trackers.sales_order_id`
Live `erp_db` (read-only `information_schema`): column is `bigint`, `IS_NULLABLE=YES`,
foreign key `FKbx8jmfkcsqv250xv0o0xywnku → sales_orders(id)` with
`ON DELETE NO ACTION / ON UPDATE NO ACTION` — exactly the shape the raw-`Long`
mapping writes to. Data: 2 tracker rows, 0 with `sales_order_id IS NULL`, 0 orphaned
(every stored value resolves to a live `sales_orders.id`). Three tables reference
`sales_orders` at all: `production_trackers.sales_order_id`,
`sales_order_e_actions.sales_order_id`, `sales_order_items.sales_order_id`.

### 1.5 JWT exposure (presence-only assessment)
Access/refresh-token-shaped strings exist **only** in locally written verification
scratch dumps, never in version control and never in an application log:

| Location | Ignored? | Committed? | Content shape |
|---|---|---|---|
| `.tmp-clean/token.txt` | yes (`.gitignore:125`) | no | access token |
| `tmp/live-token.txt`, `tmp/live-login.json`, `tmp/live-login2.json` | yes (`.gitignore:96`) | no | access token + `refreshToken` |
| sibling `../tmp/ui_token.txt`, `ui_prod_token.txt`, `e2e_token.txt`, `ui_login.json`, `dc_test.log` (outside the repo) | n/a | n/a | access token (+ `refreshToken` in `ui_login.json`) |

- `git grep` over `HEAD` finds no token: nothing is committed.
- Shell histories (`.bash_history`, PowerShell `ConsoleHost_history.txt`) contain **no**
  token-shaped strings; the 99 agent/terminal capture logs in `%TEMP%` contain **none**.
- The app has no file log appender and its logback patterns carry no request headers, so
  the backend does not persist tokens; `JwtAuthenticationFilter` reads the `Authorization`
  header and never logs it.
- Residual risk: the dumps carry a **refresh token** (7-day TTL, `ERP_JWT_REFRESH_EXPIRATION_MS`
  default `604800000`); the `2026-10-12` dumps were still inside that window on 2026-10-15
  (`2026-09-26` dumps are expired). Access tokens (30 min) are long expired.

---

## 2. Changes made

| File | Change | Why |
|---|---|---|
| `src/components/Common/CurrentUserContext.jsx` | existing context now also exposes `canDeleteSales` (ADMIN/MANAGER) | one frontend mirror of the backend `SALES_DELETE` authority; UI gate only, the server stays the enforcement point |
| `src/utils/salesPermissions.js` (new) | shared capability helper for the delete entry points | no role comparisons inline at every call site |
| eight Sales surfaces (`src/components/SalesDesign/SalesDocumentDesign.jsx`, `src/components/SalesDetail/SalesViewPage.jsx`, `src/components/SalesTable/SalesListPage.jsx`, `src/pages/sales/{CpoEActions,EActionViewPage,QuotationDesign,QuotationListPage,QuotationViewPage,SalesContractListPage,SalesContractViewPage}.jsx`) | single / bulk / bulk-permanent delete entry points gated on that capability | authorised users keep the workflow; unauthorised users no longer see controls the server would refuse. API paths, envelopes, dialogs and behaviour unchanged |
| `tests/sales-delete-permissions.test.js` (new) | 28 assertions: authority parses against `RolePermissions.java`/`UserRole.java`, every controller delete route is covered, every delete entry point sits behind the capability, and the scanner itself is tested | non-vacuous Sales delete contract |
| `erp-backend/src/main/java/com/vishatech/erp/security/RateLimiter.java` | new scoped `clear(String prefix)` | lets a test method start from its own bucket; expiry remains the only reset a deployment needs |
| `erp-backend/src/test/java/com/vishatech/erp/security/AbstractSecurityTest.java` | `@BeforeEach isolateAuthRateLimitWindows()` clears `auth:` and `login:` windows | makes the classes sharing one cached context order-independent |
| `erp-backend/src/test/java/com/vishatech/erp/architecture/AuthRateLimitIsolationTests.java` | guard extended: every auth-calling class pins its own budget, the per-method reset exists, `RateLimitTests` still proves throttling with low limits, production limits and the shared test profile are unchanged | removes the order-dependent 429 without weakening rate limiting |
| `erp-backend/src/test/java/com/vishatech/erp/api/BaseApiTest.java` | optional limited-authority caller (`ERP_API_TEST_USER_EMAIL`/`_PASSWORD`, or `ERP_API_TEST_ALLOW_REGISTER=true`) with `assumeTrue` skip | live 403 verification without weakening the default single-credential run |
| `erp-backend/src/test/java/com/vishatech/erp/api/sales/SalesDeleteAuthorityLiveApiTest.java` (new) | 4 live tests | 401 unauthenticated, 403 for an authenticated USER on all three destructive routes, 404 for ADMIN on an unknown id, unchanged read/404 envelopes |
| `erp-backend/src/test/java/com/vishatech/erp/api/documents/DocumentsPaginationLiveApiTest.java` (new) | 5 live tests | page envelope unchanged; `page=-3` → 0; `size=0`/`-50` → 1; `size=100000` → 200; unknown id → 404 |
| `erp-backend/src/test/java/com/vishatech/erp/security/CprApiTest.java` (earlier in this session) | pins the two-level CPR delete policy | see §4 |

Backend authorization, production rate-limit policy, JWT configuration, database schema
and response contracts were **not** changed.

---

## 3. Verification results

### 3.1 Sales UI permissions (Task A)
- `node --test tests/sales-delete-permissions.test.js` → **28 pass, 0 fail** (4 suites).
- `npm run build` → **exit 0**, `✓ built in 6.96s`.

### 3.2 Security-suite stability (Task B)
| Run | Command | Result |
|---|---|---|
| before fix | `./mvnw -o -B test` | **686 tests, 5 failures** (all `SalesSettingsApiTest … expected 201 but was 429`), exit 1 |
| targeted after fix | `-Dtest=SalesSettingsApiTest,RateLimitTests,AuthRateLimitIsolationTests,CprApiTest,AuthSecurityTests,RefreshTokenSecurityTests,DocumentsApiTest` | **47 tests, 0 failures**, exit 0 (`SalesSettingsApiTest` now 8/8; `RateLimitTests` still asserts `429`; isolation guard 5/5) |
| full suite after fix (run 1) | `./mvnw -o -B test` | **687 tests, 0 failures, 0 errors, 0 skipped**, exit 0, BUILD SUCCESS |
| full suite after fix (repeat) | `./mvnw -o -B test` | **687 tests, 0 failures, 0 errors, 0 skipped**, exit 0, BUILD SUCCESS |

The repeated run is the regression evidence for order independence; the guard test keeps
both the per-class budget and the per-method reset from being removed unnoticed, while
`RateLimitTests` (own context, low limits) still proves the throttle itself.

`com.vishatech.erp.api.*` live tests are disabled unless `ERP_API_TEST_ENABLED=true`, and
they reported `Tests run: 0` inside the full suite — the normal suite is unaffected.

### 3.3 Live API verification (Task F)
Isolated environment, never the shared data or the shared dev process:

- dedicated Spring Boot instance on **port 8099** (the shared dev backend on **8080 was
  left running and untouched**);
- database = the pre-existing isolated schema **`erp_storage_verify`** (`erp_db` was only
  ever read with `setReadOnly(true)` `SELECT`s); uploads redirected to `tmp/verify/uploads`;
- `erp_storage_verify` is a stale copy (it predates the CRM tables), so `validate` cannot
  pass there: the run used `ERP_DDL_AUTO=update`, scoped to that isolated schema only —
  Hibernate added the missing tables; nothing was dropped or altered. This is the one DDL
  issued anywhere, and it touched no shared data.

`ERP_API_TEST_ENABLED=true ERP_API_TEST_BASE_URI=http://localhost:8099` (base path default
`/v1`), `ERP_API_TEST_ALLOW_REGISTER=true`:

```
Tests run: 36, Failures: 0, Errors: 0, Skipped: 0   BUILD SUCCESS   exit=0
  com.vishatech.erp.api.administration.AdministrationApiTest     3
  com.vishatech.erp.api.auth.AuthApiTest                         3
  com.vishatech.erp.api.documents.DocumentsApiTest               2
  com.vishatech.erp.api.documents.DocumentsPaginationLiveApiTest 5   (new)
  com.vishatech.erp.api.engineering.EngineeringApiTest           2
  com.vishatech.erp.api.finance.FinanceApiTest                   3
  com.vishatech.erp.api.inventory.InventoryApiTest               2
  com.vishatech.erp.api.marketing.MarketingApiTest               2
  com.vishatech.erp.api.production.ProductionApiTest             2
  com.vishatech.erp.api.purchase.PurchaseApiTest                 3
  com.vishatech.erp.api.sales.SalesApiTest                       2
  com.vishatech.erp.api.sales.SalesDeleteAuthorityLiveApiTest    4   (new)
  com.vishatech.erp.api.users.UserApiTest                        3
```

All nine new methods passed:
`destructiveSalesEndpointsRejectAnUnauthenticatedCaller`,
`destructiveSalesEndpointsRejectAnAuthenticatedUserWithoutSalesDelete`,
`destructiveSalesEndpointsAcceptTheSalesDeleteAuthority`,
`salesReadsAndTheNotFoundEnvelopeAreUnchanged`,
`thePageEnvelopeIsUnchanged`, `negativePageIsNormalisedToTheFirstPage`,
`zeroAndNegativeSizesFallBackToOneRow`, `oversizedPageRequestsAreClampedToTwoHundred`,
`unknownDocumentReturnsNotFound`.

The isolated instance was stopped afterwards (`8099` closed, java PID 4448 terminated);
the shared `8080` listener (PID 34500) was never restarted or touched.

### 3.4 Frontend suite
19 test files were run individually (`node --test <file>`, status captured per file):
**14 pass, 5 fail**. All five failures are pre-existing and unrelated to this session's
Sales changes:

- `tests/crm-contacts.test.js`, `tests/production-kpi-pagination.test.js` — read Java
  sources at pre-move paths (`erp/entity/Contact.java`, `erp/service/ContactService.java`,
  `erp/repository/QualityInspectionRepository.java`; the CRM/Production modules now live
  under `crm/…` and `repository/production/…`), plus one stale UI-shape assertion
  (`machineUtilizationSummary(...)` no longer exists).
- `tests/production-integration.test.js` — 153 passed, 2 failed: stale `modelFormats.js`
  constant assertions (`BACKEND_CONVERT_TYPES`, `SLD_STORE_ONLY_TYPES`). Its
  `Common/CurrentUserContext` import assertions **pass**.
- `src/utils/leadNotes.test.js`, `src/utils/readCache.test.js` — import `vitest`, which is
  not installed; they cannot run under `node --test` (there is no `npm test` script).

None of the five reads or asserts anything this session changed; `npm run build` passes.

---

## 4. CPR authorization decision (Task C)

**Decision: keep the two-level policy; the "inconsistency" is intentional and is now
pinned by tests.**

- restorable delete — `DELETE /cprs/{id}` **and** `POST /cprs/bulk-delete` → `CPR_EDIT`
  (the operation only moves the record to the trash and stays reversible; single and bulk
  agree);
- irreversible purge — `POST /cprs/bulk-permanent-delete` → `CPR_DELETE`, which USER does
  not hold (least-privilege compatible authority, no broadening).

Evidence: `CprApiTest.restorableDeleteIsAnEditWhilePermanentDeleteNeedsTheNarrowerAuthority`
pins 401 for unauthenticated callers on all three routes, 200 for a USER on the single and
bulk restorable delete with the unchanged envelope (`message = "CPR moved to trash"`),
400 (not 403) for an authorised caller's empty selection — validation stays distinct from
authorization — 403 for a well-formed permanent delete by USER, 400 for its malformed body,
and 200 for MANAGER (which holds `CPR_DELETE`). `approvalsAndPermanentDeleteRequireTheNarrowerCprAuthorities`
covers the same for approve/float. Routes, response contracts and transaction semantics
are unchanged.

---

## 5. Production tracker foreign key (Task D)

**Conclusion: retain the constraint unchanged; no migration, no schema change, no code
change.**

- The FK (`FKbx8jmfkcsqv250xv0o0xywnku`, `NO ACTION`/`NO ACTION`) is compatible with the
  raw-`Long` mapping: same column, same `bigint` type, nullable, and the mapping never
  writes a value the constraint could reject (it stores ids, not entity graphs).
- The constraint still holds on live data: 2 rows, 0 null links, 0 orphans.
- It is documented as an approved decision in `MODULAR_MONOLITH_FOUNDATION.md` (§728–781):
  the move from `@ManyToOne SalesOrder` to `Long salesOrderId` kept the column, its type,
  its nullability, its constraint and every stored value, verified read-only against
  `information_schema`, with runtime `ddl-auto=validate` as the net.
- Observation (pre-existing, not a regression, no change proposed): because the FK is
  `ON DELETE NO ACTION` on a table that other rows still point to, a *permanent* (hard)
  delete of a CPO that a `production_tracker` still references is refused by MySQL with a
  constraint violation. This behaviour predates the mapping change (the constraint is in
  the database, untouched by the refactor) and needs a product decision — either block it
  in the service with a clear 409, or cascade/purge the tracker links — not an automatic
  schema change.

---

## 6. JWT exposure assessment (Task E)

**Conclusion: no version-controlled or application-log exposure; a local scratch-file
exposure exists and is still live for one refresh token. A controlled `ERP_JWT_SECRET`
rotation is recommended, but was NOT performed (needs explicit approval).**

- Evidence in §1.5: tokens are present in git-ignored local scratch dumps only (4 inside
  the repo, all covered by `.gitignore`, plus 5 in the sibling scratch directory); no token
  in `HEAD`, none in shell history, none in the 99 agent capture logs, and the backend has
  no file log appender that could persist one.
- If rotation is authorised: change `ERP_JWT_SECRET`, restart every backend instance, and
  expect **every existing access token and refresh session to be invalidated** (all users
  re-authenticate; refresh-token rows remain but can no longer be verified by the new
  signing key). Also delete the scratch dumps
  (`.tmp-clean/token.txt`, `tmp/live-*.json`, `tmp/live-token.txt`, and
  `../tmp/ui_*token.txt`, `../tmp/e2e_token.txt`, `../tmp/ui_login.json`, `../tmp/dc_test.log`).
- No JWT configuration, session or running backend was changed by this task.

---

## 7. Database safety

- `erp_db` (shared): **read-only** access only — `setReadOnly(true)` SELECTs against
  `information_schema` and counts; no DDL, no DML, no seeder, no migration.
- The only writes anywhere were inside the isolated `erp_storage_verify`: Hibernate
  `ddl-auto=update` adding the tables that stale copy lacked, its own startup
  seeders/backfills, and exactly one throwaway `USER` account created by the live 403 test
  (`ERP_API_TEST_ALLOW_REGISTER`). No shared development data was touched.

## 8. Git state

- Branch `main`; the pre-existing working tree was recorded before the first change
  (229 porcelain entries, including the staged CRM renames and untracked migration docs).
- Final comparison against that snapshot shows **only** the intended additions:
  `M erp-backend/src/main/java/com/vishatech/erp/security/RateLimiter.java`,
  `M erp-backend/src/test/java/com/vishatech/erp/api/BaseApiTest.java`,
  `M erp-backend/src/test/java/com/vishatech/erp/security/AbstractSecurityTest.java`,
  `?? erp-backend/src/test/java/com/vishatech/erp/api/sales/SalesDeleteAuthorityLiveApiTest.java`,
  `?? erp-backend/src/test/java/com/vishatech/erp/api/documents/DocumentsPaginationLiveApiTest.java`
  (plus this report); `AuthRateLimitIsolationTests.java` sits inside an already-untracked
  directory. Diffstat: RateLimiter `+15`, AbstractSecurityTest `+30`, BaseApiTest
  `+88/-19` — normal and CR-at-EOL-insensitive diffstats are identical, so there is no
  whitespace churn.
- Nothing was staged, committed, reset, cleaned, stashed or restored; the pre-existing
  staged renames and untracked files are exactly as they were. No `git push`.

## 9. Remaining limitations / items needing approval

1. **Secret rotation** (§6) — recommended, awaiting authorisation; also deleting the
   scratch dumps (outside this task's edit scope).
2. **Permanent-delete of a tracker-linked CPO** (§5) — product decision; no code or schema
   change made.
3. **5 frontend test files** (§3.4) — pre-existing stale-path/stale-source assertions and
   two vitest-only files; fixing them is a separate task. There is still no `npm test`
   aggregate runner and CI builds the frontend without running these tests.
4. **Isolated environment artefacts** — `erp_storage_verify` now has the tables Hibernate
   added and one throwaway account; dropping/cleaning it was deliberately not done.
5. Live verification ran against the isolated MySQL instance on 8099, not against the
   shared dev instance on 8080; the checks above are the ones actually executed.
