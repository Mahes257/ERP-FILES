# ERP Final Stabilization — Completion Report

Date: 2026-10-15 · Repository: `C:\Users\Mahes\Desktop\Sri\erp-react` · Branch: `main` (HEAD `93a76c3`)

Scope: Tasks A–F of the final stabilization brief. Everything below is evidence from commands run in this
session; command output lives in the git-ignored `tmp/verify/` directory (`a1…`–`a20…` logs).

---

## 1. Executive summary

| Task | Status |
|---|---|
| **A** — Repair the remaining frontend test failures | **Completed and verified** (with 14 pre-existing failures documented, §3.5) |
| **B** — JWT secret rotation: verification + plan | **Awaiting explicit approval** (nothing rotated, nothing deleted) |
| **C** — Tracker-linked CPO permanent deletion | **Awaiting explicit approval** (decision request, no behaviour changed) |
| **D** — Automate isolated live API verification in CI | **Partially completed** (workflow + fail-closed guard written and verified locally; the GitHub job itself cannot run on this host) |
| **E** — Isolated test database leftovers | **Awaiting explicit approval** (inspected read-only, cleanup plan prepared) |
| **F** — Preserve previous stabilization work | **No change required — verified** |
| *(follow-up round)* | See **§12** — closure verification: Task A rotation + scoped session-revocation procedure, Task B tracker-linked CPO permanent-delete proposal (no approval on record → no code written), Task C isolated-database cleanup manifest. All four sensitive actions remain **awaiting explicit approval**; nothing was rotated, revoked, dropped or deleted. |

Key outcomes:

* The five reported frontend test failures are fixed. The five were: three suites with stale Java paths /
  stale source assertions (`tests/crm-contacts`, `tests/production-kpi-pagination`,
  `tests/production-integration`) and two suites that imported **vitest**, which the repository never
  declared, configured or scripted.
* The vitest question is answered at the right level: the 83 in-source suites (`src/**`) are vitest; the 18
  legacy suites (`tests/`) stay on node's built-in runner. Vitest + jsdom are now declared, configured and
  scripted, and 1901 tests execute instead of erroring out at import.
* Before: the in-source suite could not run at all (no dependency, no config). After: **1901 tests,
  1887 pass, 14 fail** — and the 14 are genuine contract drift, listed individually in §3.5, not harness
  breakage.
* A **fail-closed database-target guard** now protects the write-capable live API suites, and the live
  suites were executed against a dedicated backend on a disposable schema: **15/15 pass, exit 0**.
* Backend full suite: **693 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS**.
* The JWT assessment is now sharper than the previous round: **rotating `ERP_JWT_SECRET` alone does not end
  the exposed session**, because refresh tokens are opaque rows and `/auth/refresh` needs no JWT. Rotation
  must be paired with revoking the active refresh-token rows.

---

## 2. Current Git state and changes relative to the baseline

Baseline recorded at the start of this task: branch `main`, HEAD `93a76c3`, **229–242 porcelain entries**
(50 already **staged** by earlier work — the CRM package renames), plus untracked migration documents.

Nothing was staged, committed, reset, cleaned, stashed or restored by this session. `git diff --cached`
still lists exactly the 50 pre-existing staged entries; `HEAD` is unchanged.

At the diff review: **250 porcelain entries**, 85 untracked — plus this report file itself (86). The delta is
entirely this task's work:

```
 M .github/workflows/ci.yml
 M package.json
 M package-lock.json
 M src/purchase/services/bulkDocumentOperations.test.js
 M src/purchase/services/documentLifecycle.test.js
 M src/purchase/services/documentOperations.test.js
 M tests/crm-contacts.test.js
 M tests/production-integration.test.js
 M tests/production-kpi-pagination.test.js
 M erp-backend/src/test/java/com/vishatech/erp/api/BaseApiTest.java
?? erp-backend/src/test/java/com/vishatech/erp/api/WriteCapableLiveApiTest.java          (new)
?? erp-backend/src/test/java/com/vishatech/erp/api/LiveDatabaseTarget.java                (new)
?? erp-backend/src/test/java/com/vishatech/erp/api/LiveDatabaseTargetGuardTests.java      (new)
?? vitest.config.js                                                                        (new)
   (SalesDeleteAuthorityLiveApiTest.java also lives in an untracked directory; its content was changed here)
```

* `src/utils/readCache.test.js` and `src/utils/leadNotes.test.js` are **back at their `HEAD` content** (no
  diff). See §3.2 — the earlier conversion to `node:test` was backed out in favour of declaring vitest.
  The converted copies are kept in `tmp/verify/node-test-backup/`.
* Backend files added/changed by the previous stabilization round (`RateLimiter`,
  `AbstractSecurityTest`, the live-test classes, the architecture tests) are untouched.
* Scratch/verification artefacts are confined to the git-ignored `tmp/` tree (`tmp/verify/**`, probes,
  logs) — no scratch file is added to the repository.
* `PERMANENT_DELETE_AUDIT_REPORT.md` remains deleted in the worktree; that is a pre-existing user change
  and was deliberately left alone.

---

## 3. Task A — Frontend test failures

### 3.1 Root causes found

| # | Failure (as reported) | Root cause | Resolution |
|---|---|---|---|
| 1 | `tests/crm-contacts.test.js` | Asserted the old CRM source paths (`erp/controller/ContactController.java`, `erp/entity/Contact.java`) after the CRM package migration | Paths updated to `erp/crm/controller/ContactController.java`, `erp/crm/entity/Contact.java` |
| 2 | `tests/production-kpi-pagination.test.js` | Same class of staleness: Production paths/keys after the Production package move | Paths and KPI-key assertions aligned with the current tree |
| 3 | `tests/production-integration.test.js` | Stale Java paths + `modelFormats` assertions that no longer matched the routing table | Assertions re-derived from the current format-routing contract |
| 4 | `src/utils/leadNotes.test.js` | `import ... from 'vitest'` — vitest was **not** in `package.json`, **not** in `package-lock.json`, had no config, and there was no test script | §3.2 |
| 5 | `src/utils/readCache.test.js` | Same | §3.2 |

### 3.2 The vitest question (frameworks)

Evidence gathered before deciding:

* **81 tracked** test files under `src/purchase/**` and **2 tracked** under `src/utils/` import `vitest` and
  use `vi.fn()`, `vi.mock()`, fake timers — all present in `HEAD`, i.e. the repository's own in-source
  convention.
* **17 tracked** files under `tests/**` use `node:test`; `tests/production-integration.test.js` is a
  standalone script with its own `assert` helper. Different convention, different runner.
* `node_modules/.bin/vitest` existed but the package was undeclared — an earlier ad-hoc install
  (`tmp/verify/a1-vitest-install.log`). Nothing in CI or npm scripts could run any of the 83 files.

Decision: **the in-source suites are vitest; the `tests/` suites stay on node's built-in runner.** Both are
supported, separately, with no file executed under two frameworks.

Added:

* `package.json` devDependencies: `vitest ^5.0.4`, `jsdom ^30.1.2` (`npm i -D`, so `package-lock.json` is
  in sync — verified with `npm ci --dry-run` → exit 0).
* `package.json` scripts: `test` (both), `test:node` (`node --test "tests/**/*.test.js"`), `test:unit`
  (`vitest run`).
* `vitest.config.js`: `environment: 'jsdom'`, `include: src/**/*.test.{js,jsx}`,
  `exclude: [..., 'tests/**']`, and `env: { VITE_PURCHASE_DATA_MODE: 'local' }`.

The two `src/utils` suites were restored to their `HEAD` (vitest) content rather than kept as hand-rolled
`node:test` ports — they are part of the vitest convention and now run as written.

Two environment decisions are worth recording, because without them the suite fails for reasons that have
nothing to do with the code under test:

* **jsdom, not bare node.** These modules are browser-side stores backed by `localStorage`. In a node
  environment every store silently degrades to `[purchase] Failed to persist …` and the suites that seed
  state through `localStorage.clear()` throw `ReferenceError: localStorage is not defined`. First run
  without a config: 81 files / 1772 tests → **925 failed** (432 of them that single error).
* **`VITE_PURCHASE_DATA_MODE=local`.** `src/purchase/services/api-client.js` routes every call through
  `withFallback`, and its module default is `'api'`; under vitest the suites therefore fired real HTTP
  requests that no test environment serves (`AxiosError: Network Error`). With jsdom but default mode:
  83 files / 1808 tests → 374 failed. The suites drive the local/storage-backed facades, so the config pins
  local mode for tests only. The module default (production behaviour) was **not** changed.

### 3.3 Additional repairs inside the in-source suite (minimal, no assertion changes)

* `bulkDocumentOperations.test.js`, `documentLifecycle.test.js`, `documentOperations.test.js` each mock
  `./api-client` partially; the facade calls `isApiMode()` while wiring itself up, so all three files died
  at import with `No "isApiMode" export is defined on the "./api-client" mock`. Each factory now also
  returns `isApiMode: () => false` (the local path those suites exercise) — every existing assertion is
  unchanged and now actually runs.
* `documentLifecycle.test.js` installed its `FileReader` double only when no DOM provided one. Under jsdom
  the real `FileReader` rejects the plain objects the test passes it
  (`parameter 1 is not of type 'Blob'`), so the double is now applied unconditionally — which is what the
  assertions were written against.

### 3.4 Final counts

| Suite | Files | Tests | Pass | Fail | Skipped | Unexecuted | Exit |
|---|---|---|---|---|---|---|---|
| `npm run test:node` (`tests/**`, node runner) | 18 | 323 | 323 | 0 | 0 | 0 | 0 |
| `npm run test:unit` (`src/**`, vitest+jsdom) | 83 | 1901 | 1887 | 14 | 0 | 0 | 1 |
| `npm run test` (both) | 101 | 2224 | 2210 | 14 | 0 | 0 | 1 |

Nothing is silently skipped: the vitest runs report skipped/todo as 0, and the previously unexecuted
suites now execute.

### 3.5 The 14 remaining failures (pre-existing contract drift — not rewritten)

| Suite | Test | Root cause |
|---|---|---|
| `numberingEngine.test.js` | `computeNext > respects a custom starting number` | Expects `QT-2026-1001` for `fy: '2026', startNo: 1001`; implementation returns `QT-001` |
| `globalSearch.test.js` | `finds the PO by number and returns the full related chain` | Expects route `/purchase/orders/PO-4201`; implementation builds `PO-2026-4201` |
| `purchaseAcceptance.test.js` | full lifecycle invariants | Expects document numbers matching `/^QT-2026-/` |
| `purchaseToPayAudit.test.js` | 27-step audit | Same numbering expectation |
| `quotationWorkflow.test.js` | RULE 9, RULE 10 | Same numbering expectation (2 tests) |
| `downstreamWorkflow.test.js` | `createShipment refuses a PO that has not been released` | Implementation does not enforce release-before-shipment |
| `logisticsChainWorkflow.test.js` | `RULE 1 — an un-released PO cannot be shipped` | Same missing rule |
| `poAwardWorkflow.test.js` | `RULE 5 — acknowledgement, shipment and GRN are refused before release` | Same missing rule |
| `notificationFeed.test.js` | `logistics events emit Shipment, GRN and Inspection` | Emitted feed rows do not match the asserted document number |
| `rfqFollowUpAuto.test.js` | `sending an RFQ with no responses auto-creates a follow-up` | Due-date expectation (`2026-09-10` vs `2026-10-22`) |
| `settingsConfig.test.js` | `Save persists and Reset restores the saved values` | Test bug: `expect(...).resolves.toBe(...)` is **not awaited** |
| `workflowOrdering.test.js` | `handleContinue navigates to Approval when tech eval is done` | Source-text assertion against a file whose contents/split changed |
| `workQueue.test.js` | `surfaces live records created through the actual services` | Count expectation vs current record shape |

These were left untouched on purpose: the brief forbids rewriting tests to make them pass, and forbids
changing production behaviour to satisfy a stale assertion unless a genuine defect is proven. Two of the
clusters (financial-year document numbering, release-before-shipment) are business-rule questions and are
listed in §11 as decisions, not as fixes.

---

## 4. Frontend build

`npm run build` → **exit 0**, `✓ built in 10.99s` (`tmp/verify/a16-final-build.log`). Only the pre-existing
rolldown chunking/ineffective-dynamic-import warnings.

---

## 5. Task B — JWT exposure and rotation (nothing executed)

### 5.1 Configuration and token semantics (verified)

* `application.properties`: `app.jwt.secret=${ERP_JWT_SECRET}` (no default — startup fails fast),
  `app.jwt.expiration-ms=${ERP_JWT_EXPIRATION_MS:1800000}` (**30 min** access token),
  `app.jwt.refresh-expiration-ms=${ERP_JWT_REFRESH_EXPIRATION_MS:604800000}` (**7 days** refresh).
* `JwtService`: HS256, `verifyWith(key)`, minimal claims (subject = email, iat, exp), never logs a token;
  a weak/non-base64 secret aborts startup.
* `RefreshToken` + `RefreshTokenService`: refresh tokens are **256-bit opaque random values**, stored only
  as SHA-256 hashes, rotated on every use, with reuse detection that revokes the whole family.
* `SecurityConfig` permits `/auth/login`, `/auth/register`, **`/auth/refresh`**, `/auth/logout` without
  authentication. `/auth/refresh` therefore needs no valid access token.

### 5.2 Consequence for rotation

> **Rotating `ERP_JWT_SECRET` invalidates access tokens only.** Every unrevoked, unexpired refresh row
> (7-day window) can still call `POST /v1/auth/refresh` and obtain a fresh access token signed with the
> **new** key. Rotation is not complete unless the active refresh-token rows are revoked at the same time.

### 5.3 Local scratch exposure (still present, git-ignored)

| Artefact | Written | Content |
|---|---|---|
| `.tmp-clean/token.txt` | 2026-10-10 13:40 | one JWT-shaped value |
| `tmp/live-login.json` | 2026-10-12 15:08 IST | login response (access + refresh token) |
| `tmp/live-login2.json` | 2026-10-12 15:32 IST | login response |
| `tmp/live-token.txt` | 2026-10-12 15:32 IST | access token |
| `tmp/live-*.json` (leads/contacts/client id) | 2026-10-12 | CRM business payloads (no secrets) |

All are untracked and covered by `.gitignore` (`git check-ignore` confirms). One **tracked** file,
`src/purchase/services/platform/contracts.test.js:73`, contains a JWT-shaped literal used as a fake
`authToken` fixture. It exposes no secret material (no secret, no signing key), but it is not obviously
synthetic; replacing it with an unmistakable placeholder is recommended (not changed here, to avoid
editing an unrelated suite).

### 5.4 Which database the dumps came from (read-only probe, counts only)

`refresh_tokens.created_at` stores UTC instants; the scratch file times (IST) are 09:38 / 10:02 UTC.

* `erp_db` (the **shared** development database, the one `erp-backend/.env` points at):
  * 11 tokens created 09:00–11:00 UTC on 2026-10-12, **7 of them still active**;
  * rows at the dump minutes: **1** in 09:35–09:42 UTC (dump 1) and **2** in 09:59–10:06 UTC (dump 2).
* `erp_storage_verify` (isolated): **0** tokens created on 2026-10-12.

So the dumped refresh tokens were issued by the **shared** environment's instance, and at least one of
them is plausibly still valid (refresh TTL ends ≈ 2026-10-19). Because only hashes are stored, a specific
dump cannot be mapped to a specific row — stated as "plausible and not excludable", not as proof.

### 5.5 Live session inventory (read-only)

* `erp_db`: **1137** refresh rows, **69 active** (UTC-corrected), **34 active rows expire after
  2026-10-19**. In the last 3 hours: 10 new rows, **all 10 rotations of existing families, 0 fresh
  logins** — i.e. the running dev app is actively refreshing sessions.
* `erp_storage_verify`: 11 rows, all active, all created by verification logins.

### 5.6 Instances that hold the secret

* One backend is listening on **:8080** (`java`, PID 34500) — the shared dev instance the report targets.
* `erp-backend/.env` holds `ERP_JWT_SECRET` (git-ignored, not printed). A grep over shell/Markdown/
  properties/sources shows no other component reads it (the frontend does not; the CAD worker does not).
* A rotation therefore needs: new secret → restart that one instance (and any other instance started with
  the same environment). The isolated verification instance used in Task D has been stopped.

### 5.7 Proposed rotation procedure (for approval — not executed)

1. Generate: `openssl rand -base64 64`.
2. Store it in the environment/secret store (locally: `erp-backend/.env`), never in chat or a tracked file.
3. **Revoke the active refresh rows in the same change window**, e.g.
   `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'SECRET_ROTATION' WHERE revoked_at IS NULL;`
   (DML on `erp_db` — needs explicit approval; without it, rotation does not end the exposure).
4. Restart every backend that loaded the secret (currently the :8080 instance). Expect a short restart gap
   and **all users re-authenticating**.
5. Delete the scratch dumps listed in §5.3.
6. Optional hardening: reduce `ERP_JWT_REFRESH_EXPIRATION_MS` below 7 days, or add "revoke all sessions for
   user" to the admin surface (not required for this incident).

**Expected impact:** every access token invalid immediately; every refresh session invalid only because of
step 3; no data loss; no schema change.
**Rollback:** restore the previous secret and restart — tokens signed with the old key become valid again;
refresh rows are unaffected by the secret. Step 3 is not reversible without re-login.

---

## 6. Task C — Tracker-linked CPO permanent deletion (decision request)

Findings (current code and metadata):

* `ProductionTracker` maps the CPO as a **raw id**: `@Column(name = "sales_order_id") private Long salesOrderId;`
  — no JPA association.
* The live FK is `FKbx8jmfkcsqv250xv0o0xywnku → sales_orders(id)`, `ON DELETE NO ACTION`, documented as an
  approved decision in `MODULAR_MONOLITH_FOUNDATION.md` §728–781 (kept column, type, nullability,
  constraint and values; verified read-only against `information_schema`).
* Lifecycle already established in code: `SalesOrderService.delete`/`bulkDelete` are **soft deletes**
  (`status="deleted"` + `archivedAt`, restorable via `restore`), and `archive` exists.
* `SalesOrderService.bulkPermanentDelete` hard-deletes the whole revision chain after purging
  timeline/history/attachments/edit-history/revision rows — but it does **not** consider
  `production_trackers`. With a linked tracker the delete fails on the FK (constraint violation surfaced as
  a server error), because the constraint is `NO ACTION`.
* Live data: `production_trackers` = 2 rows, `sales_orders` = 9 rows, 0 orphans (read-only probe).
* No document in the repository states the intended policy: the previous report records it verbatim as
  needing "a product decision — either block it in the service with a clear 409, or cascade/purge the
  tracker links".

Because the policy is **not** established, no code or schema change was made (per the brief). Decision
request, options and risks:

| Option | Behaviour | Risk |
|---|---|---|
| **A (recommended)** Reject | Permanent delete returns **409** with a message naming the linked tracker CPO numbers; users are pointed at soft delete / archive / restore | Preserves production history and referential integrity; requires a UI copy change ("cannot permanently delete, X tracker(s) reference it") |
| **B** Archive instead | A permanent delete of a linked CPO silently degrades to soft delete/archive | "Permanent" stops meaning permanent; audit ambiguity |
| **C** Cascade | Delete the tracker rows with the CPO | Destroys production history for a Sales-side action; needs explicit, documented approval |

Recommended default: **A**, implemented as a pre-check in `bulkPermanentDelete` (and, if desired, the same
message on single-row paths) plus tests for authorized/unauthorized callers and linked/unlinked records.
No database change and no change to the CPO↔tracker relationship are implied.

---

## 7. Task D — Isolated live API verification in CI

### 7.1 What was added

**Fail-closed database-target guard** (`erp-backend/src/test/java/com/vishatech/erp/api/`):

* `LiveDatabaseTarget` — pure decision logic: blank ⇒ refuse; `erp_db` (bare or inside a JDBC URL) ⇒
  refuse; production-looking names ⇒ refuse; anything else is accepted and echoed back.
* `WriteCapableLiveApiTest` — base class that runs the check in `@BeforeAll` **before** the inherited
  REST Assured client is built, printing the target database into the log. `SalesDeleteAuthorityLiveApiTest`
  now extends it (it exercises destructive routes and can register a throwaway account).
* `LiveDatabaseTargetGuardTests` — 6 tests pinning the refusals/acceptances, the single declaration of the
  shared database name, the guard wiring of the destructive suite, and that the live suites remain
  environment-gated. These run in the ordinary H2 suite, so the safety net is itself covered even when no
  live run happens.
* `BaseApiTest` gained a diagnostics line (`[live-api] target = …`) and an explicit note that RestAssured's
  whole-request/response logging is **not** enabled because it would print the live `Authorization` header.

**CI** (`.github/workflows/ci.yml`, YAML-validated; 5 jobs):

| Job | Purpose |
|---|---|
| `frontend` | unchanged: install + build |
| `frontend-tests` | new: `npm run test:node` (contract suite, green) |
| `frontend-unit` | new: `npm run test:unit` (vitest). Published even when red — `continue-on-error: true` with the reason in the file, because 14 pre-existing drift failures are known and should be visible rather than hidden. Remove the flag once §3.5 is decided |
| `backend` | unchanged: `./mvnw -B verify` (H2) |
| `live-api` | new, below |

`live-api` job: MySQL 8.0 **service container** with a throwaway `erp_ci_live` database; a dedicated
backend started with `ERP_DDL_AUTO=update`, `ERP_DATABASE_URL` pointing at `jdbc:mysql://127.0.0.1:3306/erp_ci_live`
and credentials from repository secrets; readiness polled on `/v1/health` (with a 180 s bound and a log tail
on failure); then
`ERP_API_TEST_ENABLED=true … ERP_API_TEST_TARGET_DB=erp_ci_live ./mvnw -B test -Dtest=SalesDeleteAuthorityLiveApiTest,DocumentsPaginationLiveApiTest`;
a diagnostics step tails the backend log on failure; a final `always()` step stops only the job's own backend
and removes its temp files. The database, its rows and any throwaway account die with the container.
No credential literal is added to the workflow: `ERP_CI_JWT_SECRET` and `ERP_CI_API_PASSWORD` are secrets, and
when either is absent the job emits `::warning::` "SKIPPED … no live test result is claimed" instead of
pretending to pass.

### 7.2 Verification actually performed (local, equivalent to the CI flow)

A dedicated instance was started on **:8099** against the disposable schema `erp_storage_verify`
(`tmp/verify/run-isolated-8099.sh`, which refuses `erp_db`), then:

```
ERP_API_TEST_ENABLED=true ERP_API_TEST_BASE_URI=http://127.0.0.1:8099 \
ERP_API_TEST_TARGET_DB=erp_storage_verify ERP_API_TEST_ALLOW_REGISTER=true \
./mvnw -o -B test -Dtest=LiveDatabaseTargetGuardTests,SalesDeleteAuthorityLiveApiTest,DocumentsPaginationLiveApiTest
```

**Result: Tests run 15, Failures 0, Errors 0, Skipped 0, BUILD SUCCESS, exit 0** — discovered and executed,
not skipped. The instance's own request log shows exactly which calls were made:

| Endpoint | Statuses observed |
|---|---|
| `POST /v1/auth/login` | 200 (authorized), 401 (bad credentials) |
| `POST /v1/auth/register` | 201 (throwaway USER, isolated schema) |
| `GET /v1/documents` | 200 (page envelope, clamps) and 401 unauthenticated |
| `GET /v1/documents/999999999` | 404 |
| `GET /v1/sales-orders`, `GET /v1/sales-orders/999999999` | 200, 404 |
| `POST /v1/sales-orders/bulk-delete` | 401 / 403 / 404 |
| `POST /v1/sales-orders/bulk-permanent-delete` | 401 / 403 / 404 |

Negative guard check: with `ERP_API_TEST_TARGET_DB=erp_db` the write-capable suite aborts with
`IllegalStateException: Refusing to run write-capable live API tests against the shared development database
'erp_db'` → BUILD FAILURE, and no request is issued.

Two operational notes:

* On **Git Bash**, exporting `ERP_API_TEST_BASE_PATH=/v1` is mangled by MSYS into
  `C:/Program Files/Git/v1` for the native JVM (this produced a misleading 404 during verification). The
  code default is already `/v1`, so local runs simply omit the variable; Linux CI is unaffected. This is
  also why the live suites must never depend on shell-converted paths.
* `RestAssured.basePath` is preserved as `/v1`; no route or context path was changed.

Status: the workflow was written and validated but **could not be executed on this host** (no GitHub
runner, no Docker here) — hence "Partially completed". Everything the job does was reproduced locally
against an isolated database, which is the part that can be verified offline.

---

## 8. Task E — Isolated database leftovers (no destructive action taken)

Read-only probe results (`tmp/verify/IsolationProbe.java`; schemas, counts and names only — no credentials):

| Schema | Tables | Users | Refresh tokens | Sales orders | Trackers | Audit rows |
|---|---|---|---|---|---|---|
| `erp_db` (**shared**, what `.env` points at) | 143 | 12 | 1137 | 9 | 2 | 236 |
| `erp_storage_verify` (isolated) | 137 | **11** | 11 (all active) | 0 | 0 | 0 |
| `erp` (empty) | 0 | – | – | – | – | – |

* `erp_storage_verify` is genuinely isolated: it is not the database the application is configured with,
  it holds none of the shared business data (0 sales orders, 0 trackers), and every write of the previous
  and current verification rounds landed there.
* Leftovers identified: the schema itself (137 tables created/copied for verification), **11 users of which
  the `live-verify-*` throwaway accounts came from the live runs** (2 in this session, the rest from the
  previous round), and 11 refresh rows (all issued by verification logins).
* An empty schema named `erp` also exists (0 tables) — ownership unclear; may be an abandoned scratch schema.

Cleanup plan (awaiting approval — nothing executed):

1. `DROP SCHEMA erp_storage_verify;` — removes the isolated tables, its 11 users and 11 refresh rows.
   Less destructive alternative: keep the schema and delete only the `live-verify-%` accounts plus truncate
   the `refresh_tokens` rows written by verification.
2. `DROP SCHEMA erp;` — only if the empty schema is confirmed unused (it holds no tables).
3. Delete the Task B scratch dumps (§5.3) in the same maintenance window.
4. No DDL/DML at all was issued against `erp_db`, and none is proposed for it here.

---

## 9. Backend test suite

Run after the final Java edit (`./mvnw -o -B test`, H2 test profile, no MySQL):

```
[INFO] Tests run: 693, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

exit 0. Baseline run earlier in the session: 687 tests, 0/0/0, BUILD SUCCESS; the difference is exactly the
6 new guard tests. Architecture guards (`ModuleBoundaryTests` 22 tests, CAD/Production/Sales/Purchase
boundary tests, `SourceHygieneTests`), the security suites, the rate-limit isolation tests and the
production/purchase integration tests are all inside that green run.

The environment-gated REST Assured suites (`api/**`) report as **0 executed** in this run because
`ERP_API_TEST_ENABLED` is unset — they are excluded by `@EnabledIfEnvironmentVariable`, not "passing". They
were executed separately in §7.2.

---

## 10. Database safety confirmation

* All inspection used **read-only** JDBC connections (`setReadOnly(true)`) and printed only schema names,
  table/row counts and timestamps. No credential, connection string, token value or hash was printed.
* No DDL, DML, seeder or migration was executed against **`erp_db`** (the shared development database), by
  any command in this session.
* Writes that did occur, all inside the disposable schema `erp_storage_verify`: Hibernate
  `ddl-auto=update` reconciliation at startup, three verification logins and two throwaway
  `live-verify-*` registrations. Evidence: `erp_storage_verify` users 9 → 11 and refresh rows 6 → 11, while
  `erp_db` business rows are unchanged (`trackers 2`, `sales_orders 9`, `users 12`, `audit_logs 236`).
* `erp_db` refresh rows rose 1134 → 1137 during the session; the probe shows all 10 rows created in the last
  3 hours are **family-reused rotations with 0 fresh logins**, so they belong to the already-running dev
  instance's sessions, not to verification (verification's three logins are all accounted for in the
  isolated instance's log and in that schema's own rows).
* The dedicated verification instance on :8099 was stopped; the user's instance on :8080 was not touched or
  restarted. `netstat` confirms only :8080 is still listening.

---

## 11. Remaining limitations and decisions requiring explicit approval

1. **Rotate `ERP_JWT_SECRET` and revoke active refresh sessions** (§5) — awaiting approval. Without the
   refresh-row revocation the rotation does not end the exposure.
2. **Delete the sensitive scratch artefacts** (§5.3) — awaiting approval.
3. **Tracker-linked CPO permanent deletion** (§6) — business decision; recommended option A (clear 409,
   preserve history). No code or schema change made.
4. **Clean the isolated schemas** (§8) — awaiting approval; nothing dropped.
5. **14 failing in-source tests** (§3.5) — two are business rules (financial-year document numbering,
   release-before-shipment), one is an unawaited async assertion in the test itself, the rest are smaller
   contract drifts. They are visible in CI (the `frontend-unit` job is reported), not hidden, and were not
   rewritten to pass.
6. **CI live verification** (§7) — the job needs `ERP_CI_JWT_SECRET` and `ERP_CI_API_PASSWORD` repository
   secrets and a Linux runner to execute; until then it reports itself as skipped and claims no result.
7. **Committed test defaults**: `BaseApiTest` falls back to `admin@vishaktech.com` / `Admin@123` (present in
   `HEAD`, matching the developer seeder's defaults). Not changed here; worth replacing with
   secret-only credentials if these suites are ever pointed at anything but a disposable database — which
   the new guard now enforces.

---

## 12. Final closure round — 2026-10-15 (verification only; nothing sensitive executed)

Baseline re-recorded at the start of this round: branch `main`, HEAD `93a76c3`, 254 porcelain entries
(50 staged — the pre-existing CRM renames — 88 untracked — 13 deleted, 104 modified, 1 added, 1 renamed, 47 renamed+modified — 0 stashes). **This round changed no file except
this report**: no source, test, config, database or secret was modified, nothing was staged, committed,
reset, cleaned, stashed or restored, and `HEAD` plus the 50 staged entries are exactly as they were.

| Task of the closure brief | Status |
|---|---|
| **A** — JWT exposure assessment + coordinated rotation/revocation | **Awaiting explicit approval** — assessment re-verified, procedure prepared (§12.1); nothing rotated, revoked or deleted |
| **B** — Tracker-linked CPO permanent-delete policy | **Awaiting explicit approval** — no approval exists anywhere in the repository (§12.3.1), so behaviour is unchanged; the exact change and its tests are specified in §12.3.2 |
| **C** — Isolated verification-database cleanup | **Awaiting explicit approval** — manifest and disposal reasons in §12.4; nothing dropped; `erp` is classified *cannot determine safely* |
| **D** — This report | **Completed and verified** (§12.5) |

## 12.1 Task A — JWT exposure, re-verified

The four scratch dumps **still exist**, each still contains exactly one token-shaped value, and all four are
git-ignored. No content, token or secret is reproduced anywhere in this report.

| Path (no contents shown) | Ignored by | Written | Token-shaped values |
|---|---|---|---|
| `.tmp-clean/token.txt` | `.gitignore:125` (`.tmp-clean/`) | 2026-10-10 13:40 | 1 |
| `tmp/live-login.json` | `.gitignore:96` (`tmp/`) | 2026-10-12 15:08 | 1 (+ an adjacent `refreshToken` field) |
| `tmp/live-login2.json` | `.gitignore:96` | 2026-10-12 15:32 | 1 (+ an adjacent `refreshToken` field) |
| `tmp/live-token.txt` | `.gitignore:96` | 2026-10-12 15:32 | 1 |

Related but not part of the four: `tmp/live-client-id.txt`, `tmp/live-lead*.json`, `tmp/live-contacts-*.json`
(CRM payloads, no credentials) and login/token dumps that live **outside** the repository
(`../tmp/ui_login.json`, `../tmp/ui_prod_token.txt`, `../tmp/e2e_token.txt`, `../tmp/capture-login.json`,
`../tmp/login*.json`). Nothing token-shaped is committed: `git grep` over `HEAD` finds **0** matching files.

Implementation re-read this round (unchanged from §5): `/auth/login`, `/auth/register`, **`/auth/refresh`** and
`/auth/logout` are `permitAll` (`SecurityConfig.java:67`); refresh tokens are 256-bit opaque values stored only
as SHA-256 hashes, rotated on every use, with family-wide revocation on reuse and on logout
(`RefreshTokenService.rotate/revoke/revokeAllForUser`); `JwtService` is HS256 and fails fast on a weak secret.
`revokeAllForUser(userId, reason)` exists in the service but **no HTTP endpoint exposes it** — there is no
supported API to revoke sessions remotely.

Read-only session scoping (new evidence this round):

| Fact | Measured value |
|---|---|
| `erp_db` refresh rows | 1140 total — **70 active**, 673 revoked, 35 active with `expires_at > 2026-10-19` |
| Accounts holding active sessions | `user_id=1` (**ADMIN**, matches the committed `admin@…` test default) 69 rows / 66 families; `user_id=27` (MANAGER) 1 row |
| Still-active rows created on the dump day 2026-10-12 (UTC) | **21**, every one owned by `user_id=1`: 04:00Z ×11, 05:00Z ×2, 06:00Z ×1, **09:00Z ×6**, **10:00Z ×1** (the dumps are 09:38Z and 10:02Z) |
| `erp_storage_verify` refresh rows | 11, all active, **none** created on 2026-10-12 |

The dumps were therefore issued by the **shared** instance and the 09:38Z/10:02Z ones remain inside their
7-day window (TTL ends ≈2026-10-19). Because only hashes are stored, a dump cannot be mapped to a specific
row; this stays *plausible and not excludable*, not proven.

**Scoping — answered directly:** revocation does **not** have to be global. Because rotation keeps
`family_id`, a created-date filter alone could miss the current head of an already-rotated chain, so the
narrow scope that actually ends the exposure is **all still-active rows of `user_id=1`** (69 rows, 66
families): one account re-authenticates, the other account's single session survives. Revoking all 70 active
rows is the broader alternative (it also logs out `user_id=27`). Deleting or rewriting rows is unnecessary
for either option — the application never deletes on logout, it sets `revoked_at`/`revoked_reason`.

**Coordinated rotation + revocation procedure (placeholders only — NOT executed):**

1. **Precheck.** Record the active count (`SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()` → expect 70). Confirm the secret holders: `erp-backend/.env` (git-ignored) and, independently, the CI-only secrets `ERP_CI_JWT_SECRET`/`ERP_CI_API_PASSWORD` used by the disposable `erp_ci_live` container — rotating the local secret does not affect CI.
2. **Generate** `openssl rand -base64 64`; store the value in the secret store (`erp-backend/.env`) and the *previous* value in the password manager for the rollback window. Never in chat, logs, source or a tracked file.
3. **Revoke the exposed sessions in the same change window** (DML on `erp_db` — needs approval). Narrow:
   `UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(), revoked_reason = 'SECRET_ROTATION' WHERE user_id = :adminUserId AND revoked_at IS NULL;`
   Global alternative: the same statement without the `user_id` predicate. (`revoked_reason` is always written alongside `revoked_at`; the values used by the code are `ROTATED`, `REUSE`, `EXPIRED`, `ACCOUNT_DISABLED`, `LOGOUT`.)
4. **Restart** every backend that loaded the secret — exactly one here (`:8080`, PID 34500 at the time of writing). Two instances holding different keys would silently reject each other's tokens, so this must be a single window. No restart was performed in this round.
5. **Postcheck.** A pre-rotation refresh value at `POST /v1/auth/refresh` → **401**; a fresh login → 200; re-run the precheck count → 0 active for that user; confirm only `:8080` is listening.
6. **Delete the four scratch files** — per file, never the directory. Same maintenance window.

*Expected effects:* access tokens signed with the old key are rejected immediately (they were 30-minute tokens anyway); revoked contexts return 401 at `/auth/refresh`; the affected account re-authenticates; no schema
change, no data loss. *Rollback:* restoring the previous secret re-validates old **access** tokens that have
not expired, but cannot un-revoke refresh rows — those users simply log in again.

## 12.2 Task A residual hygiene (no change made)

The one committed token-shaped literal is a **fake fixture**, verified this round as 23 characters in 3
segments at `src/purchase/services/platform/contracts.test.js:73` — far too short to be a signed JWT, and no
signing key, secret or real token is involved. Recommendation (unchanged): replace it with an unmistakable
placeholder such as `'<test-token>'` when that suite is next edited.

## 12.3 Task B — Tracker-linked CPO permanent deletion

### 12.3.1 Approval status: none exists

Searched the whole repository (Markdown, code and tests) for ADR/policy wording: the only statements about
the 409 policy are the **recommendations of the two previous reports** (`STABILIZATION_COMPLETION_REPORT.md`
§5 and §7.276, `STABILIZATION_FINAL_REPORT.md` §6 and §11.3). `MODULAR_MONOLITH_FOUNDATION.md` §728–781
documents the *foreign key* as an approved decision; it says nothing about permanent-delete behaviour. No
business-owner approval, decision record or ticket reference exists in the repository or in the task
context. Per the brief — *do not infer approval merely because the policy was recommended previously* —
**no behaviour was changed**.

### 12.3.2 Current behaviour (verified, not changed)

| Element | Finding |
|---|---|
| Endpoint | `POST /v1/sales-orders/bulk-permanent-delete` → `SalesOrderController:285` `@PreAuthorize("hasAuthority('SALES_DELETE')")` |
| Service | `SalesOrderService.bulkPermanentDelete(List<Long>)` (line 570) — purges timeline/history/attachments/edit-history/revision rows for the whole revision chain, then `deleteAll(chain)` |
| Tracker awareness | **None.** No pre-check of linked trackers; the class injects no Production contract at all (it would be the first). |
| Transaction | `SalesOrderService` is `@Transactional` at class level → the purge and the delete share one transaction, so a constraint failure rolls the whole thing back (no half-purged CPO) |
| Foreign key | `FKbx8jmfkcsqv250xv0o0xywnku` on `production_trackers.sales_order_id → sales_orders.id`, `ON DELETE NO ACTION` / `ON UPDATE NO ACTION` (re-verified read-only) |
| Failure surface | The constraint violation reaches `GlobalExceptionHandler.handleDataIntegrity` → **409** with the *generic* message "The record references data that does not exist or is not allowed." — already a 409, but misleading: the referenced row exists, it is the referenced data that blocks the delete. (If it surfaced as `PersistenceException` instead, the handler returns **500**.) |
| Live data | `production_trackers` 2 rows, both linked, 0 orphans (re-verified); `sales_orders` 9 rows, 0 soft-deleted |
| Test coverage | **None.** No test anywhere exercises a permanent delete of a tracker-linked CPO — `ProductionTrackerCpoLinkIntegrationTests` pins only the link and the column, and the Sales authority suites pin 401/403/404/400 ordering, not 409 |

### 12.3.3 Proposed change (for approval — not applied)

Smallest change that implements "reject with a clear 409, never cascade" while respecting the architecture
rules (`outside_does_not_depend_on_production_persistence` forbids `service.*` from touching
`repository.production..`/`entity.production..`, so the check must go through a **published Production
contract**, exactly as `PdfGenerationService` and `CadConversionJobService` do):

| # | File | Change |
|---|---|---|
| 1 | `production/api/CpoDeletionGuardPort.java` **(new)** | Published contract, no Production types: `List<String> blockingTrackerNumbers(Long salesOrderId)` (empty = deletable) plus the tracker ids if the message needs them | 
| 2 | `service/production/CpoDeletionGuardAdapter.java` **(new)** | Production-owned implementation using the existing `ProductionTrackerRepository.findBySalesOrderId` — no new query, no schema change, read-only |
| 3 | `exception/ConflictException.java` **(new)** | One-line `RuntimeException`, following `DuplicateResourceException` | 
| 4 | `exception/GlobalExceptionHandler.java` | Add `@ExceptionHandler(ConflictException.class)` → 409 `ApiResponse.error(message)`, next to the existing `DuplicateResourceException` mapping | 
| 5 | `service/SalesOrderService.java` | Constructor gains the port; `bulkPermanentDelete` checks every id **before** purging; on a link, throw `ConflictException` → the whole request fails 409 and nothing is deleted. Authorized + unlinked behaviour is byte-identical to today | 
| 6 | `production/api`/architecture tests | `ProductionBoundaryScopeTests`/`ProductionSalesBoundaryTests` probes may need one added case asserting the new contract is Production-owned and carries no entity/repository type | 

Expected response body (existing envelope, `ApiResponse.error`): **409**
`"Customer Purchase Order <soNo> cannot be permanently deleted because production history references it: tracker(s) WO-…"`
— the identifiers are the tracker's own document numbers, which the Sales UI already displays on the
Production screens, so nothing new is disclosed to an authenticated `SALES_DELETE` holder. Bulk semantics:
the request is rejected as a whole (atomic), matching the single-transaction implementation; the alternative
("delete the unblocked ones, report the blocked ones") is a product choice, not the recommended default.

Proposed tests (new file `production/CpoPermanentDeleteTrackerGuardTests.java`, H2/`AbstractSecurityTest`):

1. linked tracker + ADMIN/MANAGER (`SALES_DELETE`) → **409**, `ApiResponse.error` envelope, and the CPO, its items and its timeline/history rows are still present (proves the pre-check runs *before* the purge);
2. unlinked CPO → **200**, rows actually gone (revision chain and related rows included);
3. USER (no `SALES_DELETE`) → **403**, unchanged ordering (authority before any lookup);
4. unknown id → **404**; malformed body → **400** (existing envelope, unchanged);
5. soft delete → restore still work, and a soft-deleted but tracker-linked CPO still refuses permanent deletion;
6. tracker deleted after linking (no longer blocking) → permanent delete succeeds — pins that only *existing* references block.

Approve option A and the change will be applied and tested in a follow-up round; the alternative options
remain those of §6 (archive-instead-of-delete, or cascade — the latter destroys production history and is not
recommended).

## 12.4 Task C — Isolated verification databases: cleanup manifest (nothing executed)

Read-only probe this round (`tmp/verify/ClosureProbe.java`, `setReadOnly(true)`, counts and names only):

| Schema | Tables | users | refresh_tokens | sales_orders | production_trackers | audit_logs | purchase_requisitions |
|---|---|---|---|---|---|---|---|
| `erp_db` — **shared development database** | 143 | 12 | 1140 | 9 | 2 | 236 | 16 |
| `erp_storage_verify` — isolated verification schema | 137 | **11** | **11 (all active)** | 0 | 0 | 0 | 0 |
| `erp` — empty schema | **0** | – | – | – | – | – | – |

The previous round's numbers are therefore **re-verified**, not assumed: 137 tables / 11 users / 11 refresh
rows in `erp_storage_verify`.

Isolation and ownership evidence:

* The application is configured with `erp_db` (`application.properties:27` default and `erp-backend/.env`);
the probe confirms the configured database *is* the shared one. No application, npm script, CI job or
properties/yml/env file references `erp_storage_verify` — only two git-ignored scratch scripts do
(`tmp/verify/run-isolated-8099.sh`, `tmp/verify/envcheck.sh`), and the former **refuses to run** when the
target is `erp_db` (lines 13–14). The CI `live-api` job creates its own throwaway `erp_ci_live` inside the
job's MySQL service container.
* The schema holds **none** of the shared business data (0 sales orders, 0 trackers, 0 audit rows, 0 purchase
requisitions) and its users are the throwaway verification accounts — **3** of the 11 match `live-verify-%`,
the rest are copies created when the schema was seeded for verification.
* Its 11 refresh rows are **all active** but **none** was created on 2026-10-12, so they cannot be the ones
in the scratch dumps — consistent with the dumps coming from the shared instance (§12.1).
* No process is connected to it: `information_schema.PROCESSLIST` shows **11 sessions on `erp_db`** and none
on `erp_storage_verify`. The disposable instance is stopped — **port 8099 is not listening**; only MySQL
(`:3306`) and the user's backend (`:8080`, PID 34500) are.

Manifest — every resource, why it is disposable, and its classification:

| Resource | Count | Why it is disposable | Classification |
|---|---|---|---|
| `erp_storage_verify` schema (tables) | 137 tables | Created/copied solely for the isolated live-API verification; regenerable in minutes by `run-isolated-8099.sh` | **Safe to remove after approval** |
| `erp_storage_verify.users` | 11 | Verification logins (3 throwaway `live-verify-%` accounts + seeded copies); none is a real user account of `erp_db` | **Safe to remove after approval** |
| `erp_storage_verify.refresh_tokens` | 11 (all active) | Issued by verification logins to the isolated instance only; worthless once the schema is gone | **Safe to remove after approval** |
| `erp_storage_verify` attachments/job rows | 0 business rows | No business payload stored | **Safe to remove after approval** |
| `erp` empty schema | 0 tables | Owned by nobody provable; may belong to another tool, another project or an abandoned scratch run — the brief's rule applies | **Cannot determine safely — leave untouched** |
| `erp_db` (shared) | all of it | Not a verification artefact | **Must not be touched** |

Proposed cleanup (needs approval; **not executed**):

1. Prechecks — re-run the probe and require: `erp_storage_verify` not equal to the configured database, 0
   sessions on it, port 8099 closed, and business-row counts of `erp_db` recorded (`users 12`, `sales_orders 9`,
   `production_trackers 2`, `audit_logs 236`, `purchase_requisitions 16`).
2. `DROP DATABASE IF EXISTS erp_storage_verify;` (or, if a less destructive step is preferred, drop only the
   137 verification tables and the 11 users/refresh rows inside it).
3. Postchecks — the probe must still show `erp_db` at exactly those counts, `erp_storage_verify` absent, and
   the app on `:8080` still serving (`GET /v1/health`).
4. Do **not** touch `erp`; if its ownership is ever established, it holds no tables so removing it changes no
   data.

## 12.5 Task D — Evidence ledger for this round

| Command / artefact (`tmp/verify/`) | Result |
|---|---|
| `./mvnw -o -B test` → `a22-closure-backend.log` | **Tests run: 693, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS, exit 0** (04:40 min, 2026-10-15T13:14). No Java file was edited in this round; this is a fresh confirmation of the current state, not a re-run after a change |
| `ClosureProbe` (read-only) → `closure-probe.txt` | schema table above; refresh scoping; FK `NO ACTION`; `processlist` shows only `erp_db` |
| `UserIdProbe` (read-only) → `userid-probe.txt` | `user_id=1` = ADMIN matching the committed `admin@…` default with 69 active rows / 66 families; `user_id=27` MANAGER with 1 |
| `git status --porcelain`, `git diff --cached`, `git log -1` | 250 entries (50 staged, 88 untracked, 0 stashes); HEAD still `93a76c3`; index and `HEAD` untouched |
| `git grep` for JWT-shaped literals over `HEAD` | 0 files |
| `git check-ignore -v` on the four dumps | all four ignored (`.gitignore:125`, `.gitignore:96`) |
| live-API suites, Vitest/node suites, frontend build | **not re-run** — no frontend or test-source change was made this round; the §3.4 / §4 results stand (323/323 node, 1901 vitest with 14 documented failures, build exit 0) |

Shared-database safety confirmation for this round: every database access was a **read-only** JDBC
connection (`setReadOnly(true)`) issuing `SELECT` against `information_schema` and count queries only. **No
DDL, no DML, no seeder, no migration and no drop was executed against `erp_db`** — or against any other
schema. `erp_db` business counts are identical to the previous round (`sales_orders 9`, `production_trackers
2`, `users 12`, `audit_logs 236`); its refresh rows moved 1137 → 1140 because the user's own running instance
keeps rotating sessions, which is normal activity and not caused by this round. No secret, token, hash,
connection string or password was printed into any log, probe or report.

## 12.6 Open items and residual risks (all awaiting a decision)

1. **Rotate `ERP_JWT_SECRET` and revoke `user_id=1`'s active refresh rows** in one window (§12.1) — awaiting approval; without the revocation step the rotation does not end the exposure.
2. **Delete the four scratch dumps** (plus, optionally, the out-of-repo siblings) — awaiting approval; per-file only.
3. **Tracker-linked CPO permanent delete** (§12.3) — business decision; **no approval on record**, so no code was written. Today the operation already returns a 409, but with a misleading generic message and no tracker identifiers; the proposed change makes the refusal explicit and pre-emptive.
4. **Clean `erp_storage_verify`** (§12.4) — awaiting approval; `erp` stays untouched as *cannot determine safely*.
5. **14 failing in-source tests** (§3.5) — unchanged, visible in CI's non-blocking `frontend-unit` job; two clusters are business rules (financial-year numbering, release-before-shipment).
6. **CI live verification** (§7) — still needs the `ERP_CI_JWT_SECRET`/`ERP_CI_API_PASSWORD` secrets and a Linux runner; until then the job reports itself as skipped and claims no result.
7. **Hygiene, not incidents:** the fake JWT fixture at `contracts.test.js:73` (§12.2) and the committed test
   defaults in `BaseApiTest` (§11.7) remain; both are repo-internal, and the live suites are now fail-closed
   against any database other than an explicitly named disposable one.

**Nothing in this list was executed.** The classification requested by the closure brief is: Task A —
*awaiting explicit approval* (assessment done, procedure ready); Task B — *awaiting explicit approval*
(behaviour verified, change fully specified, no code written); Task C — *awaiting explicit approval*
(manifest ready, nothing dropped); Task D — *completed and verified*.
