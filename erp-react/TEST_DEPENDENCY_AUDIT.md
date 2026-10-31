# Test File Importance & Dependency Audit — ERP Project

Repository: `C:\Users\Mahes\Desktop\Sri\erp-react` · Branch `main` (HEAD `93a76c3`) · Date: 2026-10-15

**This is an audit. No file was created, edited, renamed, moved, deleted or disabled by it.** The only
files this task wrote are this report and the generated appendix
[TEST_FILE_INVENTORY.md](TEST_FILE_INVENTORY.md) (plus git-ignored scratch logs under `tmp/verify/`).

Commands and evidence: `tmp/verify/` (`audit-data2.txt`, `a15-backend-final.log`,
`a19-final-unit.log`, `a16-final-node.log`, `node-per-file.txt`, `audit_data2.py`, `gen_inventory.py`).

---

## 1. Executive summary

The repository has **427 test-related files**: 126 backend test sources, 101 frontend test files, 11
supporting/config artefacts and 189 ad-hoc scripts. They form **three independent test systems**:

| System | Files | Runner | Where it runs | Local result (this session) |
|---|---|---|---|---|
| Backend JUnit 5 / MockMvc / ArchUnit / REST Assured | 126 java (+1 test properties) | Maven Surefire via `./mvnw test` / `verify` | CI `backend` job (H2, no MySQL) | **113 classes, 693 tests, 0 failures, 0 errors, 0 skipped, exit 0** |
| Frontend in-source suites | 83 `.test.js` under `src/**` | **vitest 5 + jsdom** (`npm run test:unit`) | CI `frontend-unit` job (non-blocking) | **1901 tests, 1887 pass, 14 fail, exit 1** |
| Frontend contract suites | 18 `.test.js` under `tests/**` | **node's built-in test runner** (`npm run test:node`) | CI `frontend-tests` job | **323 tests, 323 pass, exit 0** |

Findings that matter for "what happens if a file is missing":

1. **No test file is a runtime or production-build dependency.** Deleting any of them leaves the app
   startable and `npm run build` / the production jar unaffected — test sources are not on the production
   classpath (`src/test/java` is `test`-scope; Vite bundles only what the app imports). The only real
   dependency chain is *within the test suite*: 13 helper/probe/base classes must exist for the tests that
   reference them to compile.
2. **CI enforces far less than a local run.** **49 of 126 backend test files (≈213 tests) and 2 of 18
   frontend contract files (39 tests) are untracked**, so they do not exist in a fresh checkout and never
   execute in CI. For example **the entire architecture-boundary suite (10 files, 74 tests) is untracked,
   including the 22 ArchUnit rules of `ModuleBoundaryTests`.** CI's backend job therefore executes ≈**480** tests from 74 tracked classes, not 693.
3. **Nothing in CI is broken by those missing files** (verified by a code-level reference scan): the only
   cross-references from tracked test files to untracked ones are javadoc mentions
   (`{@link WriteCapableLiveApiTest}`, `{@code AuthRateLimitIsolationTests}`,
   `SalesDocumentAuthorityContractTests`), which do not affect compilation. There is no *code-level*
   dependency from a tracked test on an untracked class.
4. **13 backend classes are environment-gated live suites** (`api/**`) with `ERP_API_TEST_ENABLED`. A normal
   `mvnw verify` discovers them and executes **0 tests** — they are not "passing". Two of them run in the
   dedicated `live-api` CI job (which needs two repository secrets); the other 11 belong to modules that
   have no equivalent job.
5. **The vitest suite is executed by CI but cannot fail it** (`continue-on-error: true`) — 1901 tests are
   reported, 14 of them currently fail, and the pipeline stays green.
   Worse: **`vitest.config.js` — the jsdom environment, the `src/**` include and the `tests/**` exclude —
   is untracked** (and *not* git-ignored, checked with `git check-ignore`), so a CI checkout does not have
   it. `vitest run` then falls back to the tracked [vite.config.js](vite.config.js), which declares no
   `test` block: environment `node` (45 `src/**` suites use `localStorage`) and vitest's default `include`
   pattern, which also matches the 18 `tests/**` files that belong to node's runner. The unit job therefore
   does not run the suite this repository maintains — and because it is `continue-on-error`, nobody sees it.
   (Locally, removing the config was measured at **925 of 1772 failing**; the CI side is config-derived and
   labelled *Unverified* in §9.4.)
6. **Backend authorization is not dependent on the frontend visibility tests** — and it must not be: the
   frontend `tests/sales-delete-permissions.test.js` (28 tests, **untracked → not in CI**) only checks that
   buttons are hidden/shown. The backend enforcement is independently covered by *tracked* tests
   (`SalesExecApiTest`, `CprApiTest`, `AuthorizationSecurityTests`, `DocumentsApiTest`, …).
7. **189 scripts under `scripts/`** are one-off verification/audit drivers (mostly CDP/browser probes).
   Nothing references them (not `package.json`, not CI); 85 of them contain credential-looking literals.

---

## 2. Repository and testing framework inventory

### 2.1 Frameworks actually in use

| Layer | Framework / version | Configuration | Notes |
|---|---|---|---|
| Backend unit/integration/architecture | JUnit 5 (`spring-boot-starter-test` 3.4.13), MockMvc, Mockito, ArchUnit 1.4.2, REST Assured 5.5.6, H2 (test scope) | `erp-backend/pom.xml`, `erp-backend/src/test/resources/application.properties` | No explicit Surefire/Failsafe configuration → Maven defaults: Surefire runs `*Test`, `*Tests`, `Test*`. **No `*IT.java` / Failsafe integration-test phase exists** (verified: no file matches `*IT.java`) |
| Backend test DB | H2 in MySQL mode, created per context by `AbstractSecurityTest` | `@DynamicPropertySource` + `INIT=` domains | The real `erp_db` is never used by the test suite |
| Frontend in-source | vitest 5.0.4 + jsdom 30.1.2 | [vitest.config.js](vitest.config.js) — `environment: jsdom`, `include: src/**/*.test.{js,jsx}`, `exclude: tests/**`, `env: VITE_PURCHASE_DATA_MODE=local`. **Untracked → not present in a CI checkout** | Declared in `package.json` devDependencies `^5.0.4` / `^30.1.2`; the tracked [vite.config.js](vite.config.js) has no `test` block |
| Frontend contract | Node built-in runner (Node 24) | `npm run test:node` → `node --test "tests/**/*.test.js"` | `tests/production-integration.test.js` is a self-contained script with its own `assert` helper |
| Frontend E2E | none | — | No Playwright/Cypress config or dependency exists |
| CI | GitHub Actions | [.github/workflows/ci.yml](.github/workflows/ci.yml) | 5 jobs: `frontend`, `frontend-tests`, `frontend-unit`, `backend`, `live-api` |

### 2.2 Test execution paths (verified configuration)

| Command | What it runs | Evidence |
|---|---|---|
| `npm run test:node` | 18 files / 323 tests (`tests/**`) | run in this session: **323 pass, 0 fail, exit 0** (per-file results in `tmp/verify/node-per-file.txt`) |
| `npm run test:unit` | 83 files / 1901 tests (`src/**`) | run in this session: **1887 pass, 14 fail, exit 1** |
| `npm test` | both, sequentially | `"test": "npm run test:node && npm run test:unit"` |
| `npm run build` | Vite production bundle | **exit 0** (`✓ built in 10.99s`); test files are not part of it |
| `./mvnw -o -B test` (or `verify`) | all Surefire-discovered backend classes on H2 | **113 report files, 693 tests, 0/0/0, BUILD SUCCESS, exit 0** (`tmp/verify/a15-backend-final.log`, parsed per class in `tmp/verify/audit-data2.txt`) |
| env-gated live suites | `api/**` REST Assured classes | present in the run as **0-test reports**; executed separately only with `ERP_API_TEST_ENABLED=true` |

GitHub Actions job → suite mapping:

| Job | Executes | Gating |
|---|---|---|
| `frontend` | `npm ci` + `npm run build` | — |
| `frontend-tests` | `npm run test:node` (16 tracked files / 284 tests in CI) | — |
| `frontend-unit` | `npm run test:unit` — locally 83 files / 1901 tests, but with **no vitest config in the checkout** it runs under vitest defaults (node env, default `include`) | `continue-on-error: true` → **cannot fail the pipeline**, and the mismatch is invisible |
| `backend` | `./mvnw -B verify` → ≈480 tests from 74 tracked classes, H2 | — |
| `live-api` | MySQL 8.0 service container (`erp_ci_live`), dedicated backend, then `-Dtest=SalesDeleteAuthorityLiveApiTest,DocumentsPaginationLiveApiTest` | **Skipped unless `ERP_CI_JWT_SECRET` and `ERP_CI_API_PASSWORD` secrets exist**; the job prints a warning and claims no result otherwise |

---

## 3. Complete test-file inventory

The **complete per-file inventory (all 427 paths, with purpose, classification, CI status, impact and
removal recommendation) is in [TEST_FILE_INVENTORY.md](TEST_FILE_INVENTORY.md)** — generated from the
repository state and the recorded runs, so every number in it is traceable.

Totals by area:

| Area | Files | Tracked | Untracked | Tests observed locally |
|---|---|---|---|---|
| Backend `erp-backend/src/test/java/**` | 126 | 77 | 49 | 693 (113 classes; 13 files are helpers/base classes that run no tests) |
| Backend test resources | 1 | 1 | 0 | — (configuration) |
| Frontend `src/**/*.test.js` | 83 | 83 | 0 | 1901 |
| Frontend `tests/**/*.test.js` | 18 | 16 | 2 | 323 |
| Supporting/config artifacts | 10 | 6 | 4 | — |
| `scripts/**` ad-hoc tooling | 189 | 189 | 0 | 0 (never executed by any wired command) |
| **Total** | **427** | **372** | **55** | **2917** |

---

### 3.1 Summary table (decision-relevant subset)

Full table: [TEST_FILE_INVENTORY.md](TEST_FILE_INVENTORY.md). Classification: **A** runtime dependency,
**B** build/CI dependency, **C** critical regression/security, **D** important functional/integration,
**E** useful supporting, **F** potentially redundant/obsolete.

| File path | Purpose | Class | Runs in CI? | App runtime impact if missing | Build impact | Test/CI impact | Removal recommendation |
|---|---|---|---|---|---|---|---|
| `erp-backend/pom.xml` | Maven build + test dependencies | A | yes | none | **production build and test compile depend on it** | every backend test | Keep — critical |
| `erp-backend/src/test/resources/application.properties` | H2 test profile, test JWT key, seeder/scheduler overrides | B | yes | none | none (test scope) | **all 693 backend tests fail without it** | Keep — critical |
| `package.json` / `package-lock.json` | npm manifest, test scripts, locked graph | A | yes | none | `npm ci`/`build` depend on it | frontend suites | Keep — critical |
| `vitest.config.js` | vitest + jsdom config for `src/**` (env, include, exclude) | B | **no (untracked)** | none | none | CI's unit job runs without it (node env, default include) — 925 failures when a config was absent locally | Keep — critical (commit it) |
| `.github/workflows/ci.yml` | pipeline definition (5 jobs) | B | — | none | none | defines what CI enforces at all | Keep — critical |
| `.../erp/api/BaseApiTest.java` | live-suite base client (login, specs, gating) | B | compiled only | none | none | live suites do not compile without it | Keep — critical |
| `.../erp/security/AbstractSecurityTest.java` | H2 datasource + audit table + rate-limit isolation | B | compiled/run | none | none | ~30 security/integration classes depend on it | Keep — critical |
| `.../erp/api/LiveDatabaseTarget.java` + `WriteCapableLiveApiTest.java` | fail-closed database-target guard for write-capable live suites | C/B | compiled only | none | none | live destructive suite refuses to run without them | Keep — critical |
| `.../erp/api/LiveDatabaseTargetGuardTests.java` | 6 tests pinning the guard | C | **no (untracked)** | none | none | guard logic unverified in CI | Keep — critical (commit it) |
| `.../erp/security/SalesExecApiTest.java` | SALES_DELETE enforcement (E-Action / remark delete → 403 for USER) | C | **yes** | none | none | backend delete authorization loses its tracked check | Keep — critical |
| `.../erp/security/SalesDocumentAuthorityContractTests.java` | CPO single/bulk/permanent delete authority, 403 vs 400 ordering | C | **no (untracked)** | none | none | CPO delete authorization has no CI check | Keep — critical (commit it) |
| `.../erp/api/sales/SalesDeleteAuthorityLiveApiTest.java` | live 401/403/404 on the three destructive CPO routes | C | only in `live-api` job (needs secrets) | none | none | route-level authorization unverified unless secrets exist | Keep — critical |
| `.../erp/security/CprApiTest.java` | CPR authority split: restorable delete ⇒ `CPR_EDIT`, permanent bulk ⇒ `CPR_DELETE` | C | **yes** | none | none | CPR delete policy loses its net | Keep — critical |
| `.../erp/security/AuthSecurityTests.java`, `AuthorizationSecurityTests.java`, `JwtSecurityTests.java`, `ExpiredJwtSecurityTests.java`, `RefreshTokenSecurityTests.java`, `RefreshTokenCleanupTests.java`, `RateLimitTests.java`, `InputValidationSecurityTests.java`, `CorsSecurityTests.java`, `FileSecurityTests.java`, `FileStorageSecurityTests.java`, `ActuatorSecurityTests.java` | authentication, JWT lifetime/expiry, refresh rotation + reuse detection, registration rate limiting, input/CORS/file/actuator hardening | C | **yes** | none | none | any regression in these areas ships unnoticed | Keep — critical |
| `.../erp/architecture/ModuleBoundaryTests.java` (22 ArchUnit rules) | modular-monolith boundaries: no forbidden cross-module deps | C | **no (untracked)** | none | none | **architecture drift is not blocked by CI today** | Keep — critical (commit it) |
| `.../architecture/*BoundaryTests.java`, `SourceHygieneTests.java`, `AuthRateLimitIsolationTests.java` (8 more files / 52 tests) | CAD/Production/Sales/Purchase boundaries, persistence ownership, source hygiene, rate-limit isolation | C | **no (untracked)** | none | none | module-boundary violations go unnoticed in CI | Keep — critical (commit them) |
| `.../security/DocumentsApiTest.java` | documents listing envelope + `size=200` contract | C | **yes** | none | none | pagination contract loses its CI check | Keep — critical |
| `.../api/documents/DocumentsPaginationLiveApiTest.java` | live clamping (negative page → 0, size 0/negative → 1, oversized → 200) | C | only in `live-api` job | none | none | clamp behaviour unverified without secrets | Keep — recommended |
| `.../production/ProductionTrackerCpoLinkIntegrationTests.java` | tracker ↔ CPO link (FK behaviour, 6 tests) | D | **no (untracked)** | none | none | the tracker-linked-delete question loses its pin | Keep — recommended (commit it) |
| `.../production/QualityInspectionPersistenceTests.java` | QC persistence (9 tests) | D | **no (untracked)** | none | none | QC persistence unverified in CI | Keep — recommended (commit it) |
| `.../production/ProductionKpiAggregationIntegrationTests.java` | Production KPI aggregation (15 tests) | D | **yes** | none | none | KPI regressions | Keep — recommended |
| `tests/sales-delete-permissions.test.js` | frontend mirrors `canDeleteSales` visibility (28 tests) | C (frontend layer) | **no (untracked)** | none | none | UI visibility regressions; **never a substitute for the backend 403 tests** | Keep — recommended (commit it) |
| `src/purchase/services/*.test.js` (81 files) | purchase module behaviour in local data mode | D | yes (non-blocking job) | none | none | purchase lifecycle regressions | Keep — recommended |
| 13 files behind the 14 failures (see §10) | FY document numbering, release-before-shipment, notification feed, follow-up date, unawaited assertion, source-scan, work-queue count | F | yes, non-blocking | none | none | currently failing — signal, not noise | Investigate further |
| `scripts/**` (189 files) | ad-hoc CDP/browser/API audit drivers | E | no | none | none | none (unwired) | Investigate further |
| `erp-backend/archunit_store/` | ArchUnit freeze store — **empty**, `FreezingArchRule` deliberately not used | E | no | none | none | none | Investigate further |

---

## 4. Classification of each file (A–F)

The per-file classification is in [TEST_FILE_INVENTORY.md](TEST_FILE_INVENTORY.md). Distribution across
all 427 files:

| Class | Files | Meaning here |
|---|---|---|
| **A — runtime dependency** | 3 | `package.json`, `package-lock.json`, `erp-backend/pom.xml`. Removing any of them stops application build/installation (`npm ci`, `npm run build`, Maven package). No `.java` or `.test.js` file is in this class. |
| **B — build/CI dependency** | 17 | Test-scope compile/config dependencies: `application.properties` (test), `vitest.config.js`, `ci.yml`, the Maven wrapper, and 12 backend helper/base classes. Their absence does **not** affect the production build but breaks the *test* build or the CI jobs. |
| **C — critical regression/security** | 40 | Backend security suites (auth, JWT, refresh, rate limit, CORS, file/actuator hardening), the CPO/CPR authority contracts, the documents pagination contract, the entire architecture-boundary suite, the live API suites, the database-target guard, and the frontend `sales-delete-permissions` test. |
| **D — important functional/integration** | 156 | Module behaviour and integration tests (purchase, production, CPR, dashboard, performance, adapters) and the frontend module contract suites. |
| **E — useful supporting** | 198 | 189 `scripts/**` drivers, CAD/utility/cache unit tests, the empty ArchUnit store, `E2E_TEST_REPORT.md`, two git-ignored scratch scripts. |
| **F — potentially redundant/obsolete** | 13 | The 13 in-source suites behind the 14 currently failing assertions (contract drift). Flagged for investigation, **not** for removal. |

Evidence notes:

* The counts are rule-derived and each row carries its own evidence columns; nothing is classified from a
  file name alone. For example `ModuleBoundaryTests.java` contains **0 `@Test`** but **22 `@ArchTest`**
  rules — it is a real test class (all 22 execute under the ArchUnit engine), not a dead file.
* `ModuleBoundaryTests.java` in particular has 0 `@Test` and 22 `@ArchTest` — all 22 execute.
* Conversely `*Probe.java`, `BoundaryFindings.java`, `AuditSchemaFilterProvider.java`, `BaseApiTest.java`,
  `AbstractSecurityTest.java`, `WriteCapableLiveApiTest.java`, `LiveDatabaseTarget.java` contain **no
  tests at all**; they are compile dependencies of other tests (see §7).
* `erp-backend/src/test/resources/application.properties` is the *only* test resource; it shadows the main
  configuration and is why backend tests never touch MySQL.

---

## 5. Runtime impact if a test file is absent (Scenario A)

**Answer for every one of the 427 files: the application still starts and functions.** Nothing in this
inventory is needed by:

* the Spring Boot application — Maven compiles `src/main/java` for the artifact and `src/test/java` is
  `test`-scope, excluded from the boot jar (the `spring-boot-maven-plugin` repackage excludes test scope);
* the React app — Vite bundles only modules reachable from `src/main.jsx`; `.test.js` files are never
  imported by application code (verified: no non-test module imports a `*.test.js` file);
* the CAD worker — it runs from the same artifact and has no test dependency.

Two important exceptions to "no impact":

1. **Deleting a helper/base class breaks test compilation** — i.e. it does not break the app, but it can
   break `./mvnw test`/`verify` before any test runs (§7).
2. **Deleting `erp-backend/src/test/resources/application.properties`** changes test behaviour globally:
   the backend suite would fall back to main resources, i.e. the real `erp_db` — which is exactly what the
   test profile exists to prevent. Never remove it.

---

## 6. Production build impact (Scenario B)

| Build | Effect of a missing test file |
|---|---|
| `npm run build` (Vite/rolldown) | **No effect.** Verified: test files are not in the dependency graph; the build succeeded (exit 0) after test-file edits. |
| `npm ci` | **No effect** from test sources; affected only by `package.json` / `package-lock.json` drift (both are current — `npm ci --dry-run` exit 0). |
| `./mvnw package` / `install` | **No effect on the artifact.** Note: `package` still runs `test-compile`, so a *broken* test source or a missing helper class fails the build unless `-Dmaven.test.skip=true` is used. `./mvnw verify` additionally runs (and must pass) the 480 tracked tests. |
| `./mvnw -DskipTests package` | Compiles tests but runs none; missing tracked tests do not fail it. |

So: removing a test file changes **only** test execution and CI coverage — never the shipped frontend bundle
or the backend jar.

---

## 7. Test-suite and CI/CD impact (Scenarios C and D)

### Scenario C — local test execution

| Removal | Effect |
|---|---|
| A backend `*Test(s).java` class | That class's tests disappear. The run stays green, with N fewer tests (per-class counts in the appendix). |
| A backend helper (`BaseApiTest`, `AbstractSecurityTest`, `AuditSchemaFilterProvider`, `BoundaryFindings`, the 7 `*Probe` classes, `LiveDatabaseTarget`, `WriteCapableLiveApiTest`) | **Compilation failure** of every consumer (consumers are listed per file in the appendix): the whole `mvnw test` run aborts with `cannot find symbol`, so *no* test executes until the reference is removed. |
| `src/utils/readCache.test.js` / `leadNotes.test.js` | Those 36 tests disappear; `npm run test:unit` still passes its remaining 1865. |
| A `src/purchase/**/*.test.js` | Its tests disappear; other files are unaffected (vitest isolates files). |
| A `tests/*.test.js` | Node's runner discovers one fewer file. `tests/production-integration.test.js` is self-contained; the rest use `node:test`, so no shared harness breaks. |
| `vitest.config.js` | vitest falls back to `vite.config.js`/defaults: no jsdom ⇒ `localStorage is not defined` (45 `src/**` suites use it) and `VITE_PURCHASE_DATA_MODE` unset ⇒ real HTTP attempts; the default `include` also sweeps in `tests/**`. Measured locally: **925 of 1772 failing** in that state. **In CI this is the current state**, because the file is untracked. |
| `tests/**` in vitest's `exclude` list | The `tests/**` files would be executed twice, under two frameworks. |

### Scenario D — CI/CD

| Missing file | CI consequence (verified from `ci.yml` + git tracking) |
|---|---|
| Any **tracked** backend test | Silently removed from the `backend` job. No failure, no notice — pure coverage loss. |
| Any **untracked** backend test (**49 files, ≈213 tests**) | Already absent in CI. A fresh `actions/checkout` never sees it, so the `backend` job today runs ≈**480 tests from 74 classes**. |
| Any **tracked** frontend test | Removed from its job (contract or unit). |
| The 2 **untracked** `tests/*.test.js` (11 + 28 = 39 tests) | Already absent from CI; `frontend-tests` runs 284 of the 323 local tests. |
| `vitest.config.js` | **Already the CI situation** (untracked): `frontend-unit` runs vitest without the jsdom env, without the `tests/**` exclusion and without the pinned `VITE_PURCHASE_DATA_MODE`, and reports that as if it were the suite. |
| `package.json` scripts, vitest/jsdom devDependencies | `frontend-unit` cannot start at all (vitest missing); the job is `continue-on-error`, so the pipeline could stay green while the suite silently shrinks. |
| `erp-backend/src/test/resources/application.properties` | `backend` job fails fast, or (worse) tests would target the configured MySQL. |
| `.github/workflows/ci.yml` | Nothing runs at all. |
| Any `scripts/**` file | No CI consequence — these files are not referenced by any workflow or npm script. |

CI-specific gaps found:

1. `frontend-unit` is `continue-on-error: true` → its 14 current failures do not fail the pipeline.
2. `live-api` executes 2 of the 13 gated live classes and needs two secrets; when the secrets are absent the
   job warns and skips, claiming no result (correct behaviour, but the coverage is then absent).
3. The `backend` job has no guard against "discovered 0 tests" and no reporting of the test count, so a
   silently shrunk suite looks identical to a healthy one.
4. 49 untracked backend tests + 2 untracked frontend tests mean **local green ≠ CI green/covered**.
5. The **vitest configuration itself is untracked**, so the unit job's environment differs from the
   maintained one (see §9.5) — a second, independent local-vs-CI divergence.

---

## 8. Security and regression risks (Scenario E)

Backend authorization is **not** replaceable by the frontend visibility tests: `tests/sales-delete-permissions.test.js`
asserts that buttons/menus are hidden or shown, which cannot prove that the server rejects a call. The two layers
are audited separately below.

| Protected behaviour | Enforcing test(s) | In CI | Independent second mechanism | Real defect that could escape if the test were absent |
|---|---|---|---|---|
| Role/permission matrix (RBAC) | `AuthorizationSecurityTests` (7), `CprApiTest` (6), `PurchaseWorkQueueIntegrationTests` (11) | **yes** | `RolePermissions` + `@PreAuthorize` on controllers | a role silently gains an authority (e.g. USER able to approve) |
| Sales single/bulk/permanent delete authority | `SalesExecApiTest` (SALES_DELETE → 403 for USER on E-Action/remark delete) tracked; `SalesDocumentAuthorityContractTests` (4) untracked; `SalesDeleteAuthorityLiveApiTest` (live, gated) | **partial** | `@PreAuthorize('SALES_DELETE')` on the 6 destructive routes | the three CPO destructive routes lose their only authority assertions outside this machine |
| CPR restorable vs permanent delete authority | `CprApiTest` (6, tracked) | **yes** | `CPR_EDIT` / `CPR_DELETE` + `RolePermissions` | restore-path delete requiring the wrong authority, or permanent delete reachable by USER |
| Authentication & JWT | `AuthSecurityTests` (8), `JwtSecurityTests` (9), `ExpiredJwtSecurityTests` (1) | **yes** | `JwtService.parseClaims` (`verifyWith`), fail-fast secret | expired/foreign-signature/`none`-algorithm tokens accepted |
| Refresh-token rotation & reuse detection | `RefreshTokenSecurityTests` (6), `RefreshTokenCleanupTests` (3) | **yes** | hashed rows + family revocation in `RefreshTokenService` | a replayed refresh token minting endless sessions |
| Registration/auth rate limiting + test isolation | `RateLimitTests` (2, tracked), `AuthRateLimitIsolationTests` (5, **untracked**) | **partial** | `AuthRateLimitFilter` + `RateLimiter` buckets | production limits weakened while tests still pass |
| Input validation, CORS, file/upload, actuator hardening | `InputValidationSecurityTests` (7), `CorsSecurityTests` (3), `FileSecurityTests` (9), `FileStorageSecurityTests` (7), `ActuatorSecurityTests` (5) | **yes** | Spring Security config + filters | path traversal, permissive CORS, exposed actuator |
| Marketing ACL/activity contracts | `MarketingSecurityTests` (26), `MarketingActivityContractTests` (9), `MarketingSettingsApiTest` (5) | **yes** | service-level checks | cross-entity data leakage in marketing |
| Documents pagination contract (200-row clamp) | `DocumentsApiTest` (12, tracked); oversized-clamp assertions in `DocumentsPaginationLiveApiTest` (gated) | **mostly** | `DocumentRepositoryService.MAX_PAGE_SIZE = 200` | unbounded page size (memory/CPU) or a silently changed envelope |
| Modular-monolith boundaries | `ModuleBoundaryTests` (22 ArchUnit rules) + 8 files / 52 tests, **all untracked** | **no** | `MODULAR_MONOLITH_FOUNDATION.md` + code review | a forbidden cross-module dependency (e.g. Production importing Sales entities) re-enters unnoticed |
| Production tracker ↔ CPO link / FK | `ProductionTrackerCpoLinkIntegrationTests` (6, untracked) | **no** | DB constraint `FKbx8jmfkcsqv250xv0o0xywnku` (`NO ACTION`) | a mapping regression or an undocumented delete behaviour |
| Quality-inspection persistence | `QualityInspectionPersistenceTests` (9, untracked) | **no** | entity mapping + `ddl-auto=validate` | QC records lost or mis-mapped |
| Audit-trail integrity | `SharedAuditContractTests` (2, untracked), `PurchaseAuditWriteTests` (2), `PurchaseAuditFailureIsolationTests` (2) (both untracked), `AttachmentStorageLedgerTests` (14, tracked) | **partial** | `AuditPort` / central audit writer | audit rows dropped or duplicated for a module |
| Previously fixed regressions | sales delete UI (`tests/sales-delete-permissions.test.js`, untracked) · documents clamp (`DocumentsApiTest` + live) · tracker FK decision (untracked) · CPR authority split (`CprApiTest`) · production KPIs (`ProductionKpiAggregationIntegrationTests`) | mixed | the code changes themselves | a fixed regression silently returns |

---

## 9. Tests currently not executed by CI/CD

### 9.1 Untracked test files (absent from a fresh checkout) — 49 backend files / ≈213 tests

| Package | Files | Tests lost to CI |
|---|---|---|
| `erp/architecture/` | 10 (`AuthRateLimitIsolationTests`, `BoundaryFindings`, `CadProductionBoundaryTests`, `ModuleBoundaryTests`, `ProductionBoundaryScopeTests`, `ProductionPersistenceBoundaryTests`, `ProductionPersistenceOwnershipTests`, `ProductionSalesBoundaryTests`, `PurchaseIngressBoundaryTests`, `SourceHygieneTests`) | **74** (incl. all 22 ArchUnit rules) |
| `erp/production/` | 8 (`ModelConversionJobAdapterTests`, `ModelConversionProjectionTests`, `ProductionAttachmentAtomicityTests`, `ProductionAttachmentContractIntegrationTests`, `ProductionDocumentContractIntegrationTests`, `ProductionOrderCpoResolutionIntegrationTests`, `ProductionTrackerCpoLinkIntegrationTests`, `QualityInspectionPersistenceTests`) | 51 |
| `erp/service/**` | 7 (5 probes + `production/ProductionDashboardReadAdapterTests`, `production/ProductionDocumentServiceTests`) | 16 |
| `erp/dashboard/` | 3 (`DashboardStatsApiTests`, `DashboardStatsQueryCountTests`, `service/DashboardAggregationServiceTests`) | 12 |
| `erp/cpr/` | 3 (+ `api/CprDashboardReadAdapterTests`) | 10 |
| `erp/sales/api/` | 2 (`SalesDashboardReadAdapterTests`, `SalesOrderLookupAdapterTests`) | 10 |
| `erp/purchase/` | 3 (`PurchaseAuditFailureIsolationTests`, `PurchaseAuditWriteTests`, `PurchaseRequisitionIngressAdapterTests`) | 9 |
| `erp/cad/` | 3 (`CadModelProjectionTests`, `CadProductionRegressionProbe`, `CadProjectionPortConsumerProbe`) | 8 |
| `erp/api/` | 5 (`LiveDatabaseTarget`, `LiveDatabaseTargetGuardTests`, `WriteCapableLiveApiTest`, `documents/DocumentsPaginationLiveApiTest`, `sales/SalesDeleteAuthorityLiveApiTest`) | 6 (guard only; the two live suites need an env) |
| `com.vishatech.cadworker/` | 2 (`CadWorkerPersistenceUnitTests`, `CadWorkerProjectionTests` — the rest of the `CadWorker*` class is tracked) | 4 |
| `erp/audit/`, `erp/crm/api/`, `erp/security/` | 1 each (`SharedAuditContractTests`, `CrmDashboardReadAdapterTests`, `SalesDocumentAuthorityContractTests`) | 2+7+4 = 13 |

Frontend counterpart: `tests/production-tracker-empty-progress.test.js` (11 tests) and
`tests/sales-delete-permissions.test.js` (28 tests) — **39 tests** present locally, absent in CI.

*Confidence:* derived statically (git tracking × per-class Surefire counts). It is **not** the result of a CI
run; the safe way to confirm it is to copy these files into a temporary checkout of `HEAD` and run
`./mvnw -o -B test` there (isolated, no effect on this working tree).

### 9.2 Discovered but executing no tests (environment-gated live suites) — 13 classes

`erp/api/**`: `AdministrationApiTest`, `AuthApiTest`, `DocumentsApiTest`, `EngineeringApiTest`, `FinanceApiTest`,
`InventoryApiTest`, `MarketingApiTest`, `ProductionApiTest`, `PurchaseApiTest`, `SalesApiTest`, `UserApiTest`
(11 tracked) plus `DocumentsPaginationLiveApiTest` and `SalesDeleteAuthorityLiveApiTest` (untracked).
A normal `mvnw verify` writes 0-test reports for them; only the `live-api` job (2 of the 13, and only with both
secrets) or a manual `ERP_API_TEST_ENABLED=true` run executes them. This was exercised earlier in this session
against a disposable database on port 8099: **15 tests, 0 failures, exit 0** (see
[STABILIZATION_FINAL_REPORT.md](STABILIZATION_FINAL_REPORT.md) §7).

### 9.3 Compiled but never executed (support classes) — 13 files

`BaseApiTest`, `AbstractSecurityTest`, `AuditSchemaFilterProvider`, `BoundaryFindings`, `LiveDatabaseTarget`,
`WriteCapableLiveApiTest` and 7 `*Probe` classes. They are dependencies, not tests.

### 9.4 Test configuration that CI does not have — 1 file (highest-impact gap)

`vitest.config.js` is **untracked and not git-ignored** (`git check-ignore -v vitest.config.js` → no match,
exit 1). A CI checkout therefore runs vitest with `vite.config.js` (tracked, no `test` block) or vitest
defaults, which means: `environment: node` instead of `jsdom`, `include` = vitest's default pattern
(matching `tests/**` as well as `src/**`) instead of `src/**` only, `exclude: tests/**` absent, and
`VITE_PURCHASE_DATA_MODE` unset (the purchase facades then reach for HTTP). Consequences are localised to
the `frontend-unit` job, which is `continue-on-error: true` — the pipeline stays green either way.

*Confidence:* the *untracked* status is measured (`git ls-files`, `git check-ignore`). The *effect* on CI is
**Unverified** (no CI run was performed here); it follows from vitest's documented resolution order and was
measured locally only in the equivalent "config absent" state (925 of 1772 failing). Safe confirmation:
copy the repo to a scratch directory at `HEAD`, run `npm ci && npm run test:unit`, and compare the file/test
totals with 83 / 1901.

### 9.5 Tooling that no pipeline touches

`scripts/**` (189 files, all tracked, referenced by nothing), `tmp/mkt-audit.sh` and `tmp/notif-e2e.sh`
(git-ignored), and the empty `erp-backend/archunit_store/`.

---

## 10. Duplicate, stale, or potentially obsolete candidates

| Candidate | Evidence | Assessment |
|---|---|---|
| 13 in-source suites behind the 14 failing assertions (`numberingEngine`, `globalSearch`, `purchaseAcceptance`, `purchaseToPayAudit`, `quotationWorkflow` ×2, `downstreamWorkflow`, `logisticsChainWorkflow`, `poAwardWorkflow`, `notificationFeed`, `rfqFollowUpAuto`, `settingsConfig`, `workflowOrdering`, `workQueue`) | Failing on every run; root causes are contract drift (FY document numbering, release-before-shipment rule, an unawaited `expect(...).resolves`, a source-text scan, a work-queue count) | **Investigate further** — these are genuine signals, not noise. Not removal candidates. |
| `tests/production-integration.test.js` (1 test) | Static assertions that pages/contexts/routes/CSS are wired; largely re-proven by `npm run build` and the routing table | Keep — cheap guard; low unique value |
| `tests/*-pagination.test.js` (production, purchase) vs backend `ProductionOrderPagingTests`, `PurchaseReceivingPagingIntegrationTests`, `ProductionKpiAggregationIntegrationTests` | Same feature, different layer (frontend wiring vs server behaviour) | **Not duplicates.** Keep both — the frontend ones assert rendering/params, the backend ones assert the API contract |
| 3 purchase files with a partial `vi.mock('./api-client')` (repaired this session) | Identical 3-line mock in each | Keep; a shared test helper would remove the duplication |
| 7 `*Probe` classes | Referenced **only** by (untracked) architecture tests | Keep while the architecture suite exists; they become dead code only if it is dropped |
| 189 `scripts/**` drivers (97 `cdp-*` browser probes, 31 `erp-*`, 29 `verify-*`, 12 `audit-*`, …) | Not referenced by `package.json`, CI, or each other; one-off by name and content; 85 contain credential-looking literals | **Investigate further** (consolidate/retire after review; do not delete blindly — some encode manual verification recipes) |
| `erp-backend/archunit_store/` | Empty; `FreezingArchRule` explicitly *not* used (`ModuleBoundaryTests` comment) | Investigate further (unused) |
| `tmp/mkt-audit.sh`, `tmp/notif-e2e.sh` | Git-ignored scratch; superseded by the maintained suites | Investigate further |

No file was classified as obsolete on the basis of age or "has not run lately" alone.

---

## 11. Recommended CI/CD improvements

1. **Commit `vitest.config.js` first.** It is untracked, not ignored, and it is what makes the 1901-test
   suite meaningful in CI (jsdom, `src/**` only, pinned data mode). This is a one-file change with the
   largest effect on what the pipeline actually checks.
2. **Commit the untracked tests (or deliberately ignore them).** 49 backend files (213 tests, including all
   22 architecture rules and the CPO/CPR authority contracts) and 2 frontend files (39 tests) are invisible to
   CI today. Committing them raises the `backend` job from ≈480 to 693 tests locally/observed.
3. **Remove `continue-on-error` from `frontend-unit`** once the 14 drift items are decided, so 1901 tests
   actually gate merges.
4. **Add a no-silent-shrinkage guard** to the backend job: parse the Surefire totals and fail when the
   executed test count drops below an agreed floor (that is what would have caught the untracked-file gap).
5. **Require the live-API secrets** (or run it on a schedule) and extend the `live-api` job to the remaining 11
   gated classes — they are tracked, target `/v1`, and already pass against an isolated DB.
6. **Publish machine-readable results** (Surefire XML is already produced; add JUnit/JSON reporters for
   vitest/node) so coverage trend is visible in the pipeline.
7. **De-duplicate test configuration knowledge**: document in one place that `src/**` = vitest+jsdom and
   `tests/**` = node:test, and that `VITE_PURCHASE_DATA_MODE=local` is a test-only setting (it lives in
   `vitest.config.js` today).
8. **Credential hygiene**: the 85 `scripts/**` files with embedded login literals should move to environment
   variables (independent of any test decision).

---

## 12. Safe next steps and files that must be preserved

Must preserve (never delete without a replacement plan):

* Test infrastructure: `erp-backend/src/test/resources/application.properties`, [vitest.config.js](vitest.config.js)
  (**untracked — must be committed, not deleted**), [package.json](package.json), `package-lock.json`,
  `erp-backend/pom.xml`, `.github/workflows/ci.yml`.
* Backend support classes (compile dependencies): `BaseApiTest`, `AbstractSecurityTest`,
  `AuditSchemaFilterProvider`, `BoundaryFindings`, `LiveDatabaseTarget`, `WriteCapableLiveApiTest`, and the 7
  `*Probe` classes **together with their consumers**.
* Security suites (§8), the architecture suite, the gated live suites and the database-target guard — these are
  the only enforcement of authorization, JWT/refresh, rate-limit and boundary rules.
* The frontend `src/**` suites and the `tests/**` contract suites — including the two untracked ones, which
  should be committed rather than dropped.
* `src/utils/salesPermissions.js` (production code behind the frontend capability mirror) and
  `tests/E2E_TEST_REPORT.md` (recorded verification evidence).

Safe next steps (no repository change required to execute them):

1. Decide the fate of the 55 untracked test-related files: commit, or document the deliberate exclusion.
2. Verify CI parity in an isolated copy before trusting the ≈480/693 split: `git worktree`/clone of `HEAD`,
   copy the untracked test files in, run `./mvnw -o -B test` and `npm ci && npm run test:node && npm run test:unit`.
3. Decide the 14 failing assertions (business rules vs test staleness) — do not delete those files either way.
4. If any file is later removed, re-run: `npm run test:node`, `npm run test:unit`, `./mvnw -o -B test` and
   `npm run build`, and compare the executed test counts against this report.

---

### Evidence ledger (commands run for this audit)

| Command | Result |
|---|---|
| `git ls-files --error-unmatch <file>` (per file, 372 calls in loops) | tracking status: 77/49 backend, 99/2 frontend split |
| `./mvnw -o -B test` (H2 test profile) | **693 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS, exit 0**; 113 per-class XML reports parsed |
| `npm run test:node` + 18 × `node --test <file>` | **323 tests, 323 pass, exit 0** (per-file counts in `tmp/verify/node-per-file.txt`) |
| `npm run test:unit` | **83 files, 1901 tests, 1887 pass, 14 fail, exit 1** |
| `npm run build` | **exit 0** (`✓ built in 10.99s`) |
| `npm ci --dry-run` | exit 0 (manifest and lockfile in sync) |
| static scans: helper-reference scan, tracked→untracked code-reference scan, `import`-of-test-file scan, `SALES_DELETE`/`CPR_DELETE` scans, `@Test`/`@ArchTest`/`@Disabled` scans | 0 code-level tracked→untracked references; 0 non-test imports of test files; no `@Disabled`; no Failsafe/`*IT` phase |
| `python tmp/verify/gen_inventory.py` (read-only) | generated [TEST_FILE_INVENTORY.md](TEST_FILE_INVENTORY.md): 427 rows |
| **Not executed:** the GitHub Actions workflows themselves (no runner/Docker on this host) and a fresh-checkout parity experiment (method described in §12) | labelled *Unverified* in §9.1 |


