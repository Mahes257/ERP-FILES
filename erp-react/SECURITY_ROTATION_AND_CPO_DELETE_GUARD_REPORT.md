# Security Rotation + Tracker-Linked CPO Deletion Policy — Execution Report

Date: 2026-10-15 · Repository: `C:\Users\Mahes\Desktop\Sri\erp-react` · Branch: `main`
Base HEAD: `93a76c3da949f953c7273503d3a6383f31bbe82a` (unchanged throughout)

Both approved actions were executed and verified. Nothing was staged, committed,
stashed, reset, or reverted; no business data and no schema was modified.

---

## 1. Task 1 — JWT security remediation

### 1.1 Findings re-verified against current code (not assumed)

| Finding | Evidence |
|---|---|
| Secret source, no default | `application.properties:46` → `app.jwt.secret=${ERP_JWT_SECRET}`; `JwtService` refuses to start on a blank/weak secret |
| `/auth/refresh` is `permitAll` | `SecurityConfig.java:67-68` |
| Refresh tokens are opaque, stored as SHA-256 hashes | `RefreshToken.tokenHash` (`length=64, unique`); `RefreshTokenService.hash()` |
| `revokeAllForUser` exists | `RefreshTokenService.java:163` (no HTTP endpoint, no other caller) |
| Sessions are scoped per user | `RefreshToken.userId`; `RefreshTokenRepository.findByUserId` |

### 1.2 The running instance was proven to use `erp-backend/.env` and `erp_db`

Port 8080 was owned by PID 35308 (`com.vishatech.erp.ErpApplication`, launched by
`mvnw spring-boot:run` from `erp-backend`). Spring Boot does not read `.env` by itself
and there is no dotenv dependency, so the secret comes from the process environment —
therefore it had to be *measured*, not assumed:

* A token signed with the **current `erp-backend/.env` secret** was accepted:
  `GET /v1/auth/me → HTTP 200`.
* A login through that instance wrote `refresh_tokens` rows into **`erp_db`**
  (confirmed by row-count deltas on `localhost:3306/erp_db`, host `MaHeS`).

So the instance's configuration and database target were both established before any
change was made.

### 1.3 Revocation of active sessions for `user_id = 1` only

The exposed sessions were confirmed to belong to `user_id = 1`
(`admin@vishaktech.com`) by hashing the two dumped refresh tokens and looking the
hashes up in `refresh_tokens` (hash values were never printed).

| Measurement | Value |
|---|---|
| Active (non-revoked) rows for `user_id = 1` **before** | **449** |
| Rows affected by the revocation | **449** |
| Active (non-revoked) rows for `user_id = 1` **after** | **0** |
| Other users' active sessions before → after | unchanged (user 2: 12 → 12; users 18-27: 1 each, user 24: 2) |
| Dumped session #1 (`tmp/live-login.json`) | `user_id=1`, `revoked_reason=ADMIN_REVOKED`, revoked |
| Dumped session #2 (`tmp/live-login2.json`) | `user_id=1`, `revoked_reason=ADMIN_REVOKED`, revoked |

**Method, stated plainly.** No HTTP endpoint exposes `revokeAllForUser`, so the
revocation was performed as one narrowly scoped statement —
`UPDATE refresh_tokens SET revoked_at=NOW(), revoked_reason='ADMIN_REVOKED'
WHERE user_id = 1 AND revoked_at IS NULL` — which is exactly the set
`RefreshTokenService.revokeAllForUser` revokes. This was the **only** DML executed
against `erp_db`; it touched auth session state and no business table. Without it,
"scoped refresh-session revocation for `user_id=1`" (explicitly approved) could not
have happened at all.

### 1.4 Secret rotation and restart

* A new 48-byte (384-bit) HMAC key was generated with a CSPRNG and written to
  `erp-backend/.env` (`ERP_JWT_SECRET`). The value was never printed, logged, echoed
  into shell history, or written to any report or tracked file. `erp-backend/.env` is
  git-ignored (`.gitignore:45`) and all its other keys were preserved.
* The instance was restarted with the environment read from that file
  (`tmp/verify/run-8080.sh`, the same mechanism `tmp-run-8099.sh` already uses).
  Startup: `Started ErpApplication in 18.528 seconds`, `GET /v1/actuator/health →
  {"status":"UP"}`. No unrelated process was restarted.

### 1.5 Verification results

Stale tokens in the dumps were already expired, so rotation was proven with tokens
signed with the **old** secret and tokens signed with the **new** one:

| Check | Result |
|---|---|
| Access token signed with the **old** secret (minted pre-rotation) | **401** |
| Real app-issued access token from before the restart (old secret) | **401** |
| Access token signed with the **new** secret (freshly minted) | **200** |
| Fresh login (new secret in effect) → and its token used | **200** → **200** |
| Revoked refresh sessions minting new access tokens (fresh admin session + both dumped tokens) | **401 / 401 / 401** |
| Unaffected user (user 2) — session issued *before* rotation still mints | **200**, and its new access token works (**200**) |
| Old dumped access tokens | **401** |

All of the above were re-confirmed after a second restart at the end of the work, so
the running instance is on the rotated secret and the new code.

### 1.6 Scratch dumps deleted

Exact paths verified individually, contents checked for references first (only two
audit-report `.md` files mention them by name; no script or process reads them):

| Path | Size | SHA-256 (first 16) |
|---|---|---|
| `.tmp-clean/token.txt` | 173 B | `261041c5f1772bcf` |
| `tmp/live-login.json` | 370 B | `a2fcae219c379376` |
| `tmp/live-login2.json` | 370 B | `2075f842075cb6f8` |
| `tmp/live-token.txt` | 172 B | `e1f27cb34fad6ad6` |

Each was removed with `rm -- '<exact path>'` (no wildcards, no out-of-repository
siblings); every other scratch file in `tmp/` was left alone.

---

## 2. Task 2 — Tracker-linked CPO permanent deletion returns HTTP 409

### 2.1 Current code, re-verified

* The only hard delete of a Sales Order is `salesOrderRepository.deleteAll(chain)`
  inside `SalesOrderService.bulkPermanentDelete` — reached by
  `POST /sales-orders/bulk-permanent-delete` (`@PreAuthorize SALES_DELETE`).
  `DELETE /sales-orders/{id}` is a *soft* delete (`status='deleted'`), unchanged.
* The link lives in `production_trackers.sales_order_id` (`ProductionTracker` /
  `ProductionTrackerRepository.findBySalesOrderId`), plus a denormalised `cpo_no`.
* Module boundary: the rule `outside_does_not_depend_on_production_persistence`
  forbids Sales from importing `entity.production` / `repository.production`. The
  established pattern is a port in `production/api` implemented by a
  `service.production` adapter (precedent: `PdfGenerationService` consuming
  `ProductionDocumentPort`).

### 2.2 Implementation

| File | Change |
|---|---|
| `erp-backend/src/main/java/com/vishatech/erp/production/api/ProductionTrackerLinkPort.java` | **new** — published contract `Optional<Long> linkedTrackerId(Long salesOrderId)`; carries no Production entity/repository/DTO/service type |
| `erp-backend/src/main/java/com/vishatech/erp/service/production/ProductionTrackerService.java` | implements the port (matches `sales_order_id`, falling back to the denormalised CPO number only when the tracker has no id, so another order's tracker never blocks this one) |
| `erp-backend/src/main/java/com/vishatech/erp/exception/ConflictException.java` | **new** — `@ResponseStatus(CONFLICT)` |
| `erp-backend/src/main/java/com/vishatech/erp/exception/GlobalExceptionHandler.java` | explicit 409 handler (the catch-all would otherwise turn it into a 500) |
| `erp-backend/src/main/java/com/vishatech/erp/service/SalesOrderService.java` | `bulkPermanentDelete` now validates **all** ids first and throws `ConflictException` when any row of the revision chain has a linked tracker; injects `ProductionTrackerLinkPort` |

Stable message:

> Customer Purchase Order '<soNo>' cannot be permanently deleted because Production
> tracker #<id> is still linked to it. Remove the tracker first.

No schema change, no foreign-key change, no authorization change, no change to
soft-delete, restore, archive or any other delete path. `erp_db` was not used for any
test; the suite runs on H2 in-memory (`src/test/resources/application.properties`,
`ddl-auto=create-drop`).

### 2.3 New test class — 12 tests, all passing

`src/test/java/com/vishatech/erp/production/SalesOrderPermanentDeleteTrackerGuardTests.java`

| # | Test | Asserts |
|---|---|---|
| 1 | `aLinkedTrackerMakesPermanentDeletionA409AndChangesNothing` | 409, `success=false`, message names the CPO and tracker; CPO, timeline row and tracker unchanged |
| 2 | `aMixedBulkRequestPurgesNothingAtAll` | 409 and **nothing** purged when a deletable CPO precedes a linked one |
| 3 | `anUnlinkedCpoIsStillPermanentlyDeletedWithItsRelatedRows` | 200, "Permanently deleted 1", row **and** related timeline row gone |
| 4 | `aUserWithoutTheDeleteAuthorityStillGetsA403` | 403 for a registered USER, CPO intact |
| 5 | `theExistingNotFoundEnvelopeIsUnchanged` | 404 + existing envelope |
| 6 | `theExistingValidationEnvelopeIsUnchanged` | 400, `ids must not be empty` |
| 7 | `softDeleteAndRestoreAreUnaffectedByALinkedTracker` | soft delete → `deleted`, restore → `draft` |
| 8 | `removingTheTrackerThroughItsOwnLifecycleUnblocksTheDeletion` | 409 → tracker deleted via its own lifecycle → 200 |
| 9 | `thePortReportsTheTrackerLinkedByIdAndNothingForAnUnlinkedOrder` | port semantics incl. `null` |
| 10 | `aTrackerHoldingOnlyTheCpoNumberStillBlocksTheDeletion` | denormalised-number link also blocks |
| 11 | `aTrackerBelongingToADifferentOrderNeverBlocksThisOne` | no false positive from another order's tracker |
| 12 | `everyRowOfTheRevisionChainIsCheckedNotJustTheRequestedOne` | base-row link blocks a request naming a revision row |

One test initially failed on my own incorrect expectation (`DELETE /sales-orders/{id}`
answers with a message, not the order) — the assertion was corrected; no production
behaviour was bent to make a test pass.

---

## 3. Commands executed and results

| Command | Result |
|---|---|
| `./mvnw -o -B -q compile` | exit 0 (first attempt failed on a missing `java.util.Optional` import — fixed) |
| `./mvnw -o -B test -Dtest=SalesOrderPermanentDeleteTrackerGuardTests` | exit 0 · **12 tests, 0 failures, 0 errors, 0 skipped** |
| `./mvnw -o -B test` | exit 0 · **705 tests, 0 failures, 0 errors, 0 skipped** · `BUILD SUCCESS` |
| Test database target (checked in the 3.5 MB suite log) | **H2 only** — 679 `org.h2.` references, 20 `H2Dialect`; **0** `com.mysql` / `MySQLDialect` / `jdbc:mysql` / `erp_db` references |
| Live checks via `tmp/verify/probe.cjs` (token-minting + HTTP) | see §1.5 |
| `GET /v1/actuator/health` after both restarts | `{"status":"UP"}` |

Backend baseline before this work was 693 tests; the suite is now **705** (+12 new),
with `ModuleBoundaryTests` (22 tests) green — the new port introduces no boundary
violation.

**The live 409 path was deliberately not exercised** on the shared database: the only
way to exercise it is a permanent-delete request against a real tracker-linked CPO,
which would hard-delete a real record if the guard were wrong. It is covered by the
H2 suite instead.

Frontend and unrelated modules were **not changed by this work**: no file under
`src/`, `tests/`, `package.json` or either Vite config differs from the pre-existing
working-tree state.

---

## 4. `erp_db` integrity

A row count for all **143** tables was captured before and after
(`tmp/verify/counts-before.txt` vs `tmp/verify/counts-final.txt`). The only
difference is the session table:

```
refresh_tokens   1134  →  1140
```

All 142 other tables — including `sales_orders` (9), `production_trackers` (2),
`quotations`, `invoices`, `customers`, `leads` — are identical. The `refresh_tokens`
delta is entirely the issuance/rotation of sessions during the verification itself
(logins and refreshes), not business data. No DDL, and no DML other than the single
scoped revocation in §1.3. `erp_storage_verify` and the empty `erp` schema were not
touched.

---

## 5. Git before → after

| | Before | After |
|---|---|---|
| Branch / HEAD | `main` / `93a76c3` | `main` / `93a76c3` (identical) |
| Staged files | 50 | **50** (the CRM renames are untouched) |
| Unstaged modified | 169 | 170 |
| Untracked | 117 | 120 |

A line-by-line diff of the two `git status --porcelain` snapshots
(`tmp/verify/git-before.txt` / `git-after.txt`) reports **no status entry removed**
and only these additions from this work:

```
 M erp-backend/src/main/java/com/vishatech/erp/exception/GlobalExceptionHandler.java
?? erp-backend/src/main/java/com/vishatech/erp/exception/ConflictException.java
?? erp-backend/src/test/java/com/vishatech/erp/production/SalesOrderPermanentDeleteTrackerGuardTests.java
```

plus, inside already-untracked directories: `production/api/ProductionTrackerLinkPort.java`
(new) and the already-untracked `service/production/ProductionTrackerService.java`
(modified), and `exception`/`service/SalesOrderService.java` (already modified before
this work). All pre-existing staged, unstaged and untracked work is intact. Nothing
was staged or committed.

---

## 6. Remaining limitations / open items

1. **Live 409 not exercised** (see §3) — policy correctness rests on the H2 suite.
2. **Revocation mechanism** — performed as the scoped SQL statement in §1.3 because no
   HTTP endpoint exposes `revokeAllForUser`. If a first-class admin action is wanted,
   that is a separate change.
3. **Old access tokens remain valid only until expiry** — the rotation was proven with
   old-secret tokens being rejected, but any token issued before the rotation is also
   invalidated by the key change (observed: real pre-restart token → 401).
4. **Rotation affects all users' access tokens**, by design. Refresh sessions were only
   revoked for `user_id = 1`; other users' sessions survived and still mint tokens.
5. `erp-backend/.env` now holds the new secret and the previous value was not retained
   anywhere — if another environment (CI, staging, another machine) shares that secret,
   it must be rotated there too.
