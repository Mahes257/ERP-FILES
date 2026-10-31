# ERP Security Audit Report

**Project:** VishakTech ERP (`erp-react`)
**Audited components:** React 19 + Vite frontend (`src/`), Spring Boot 3.4.13 backend (`erp-backend/`), Spring Security, MySQL/JPA persistence, file storage, all modules present in the source tree (CRM, Sales Execution, CPR/Workflows, Purchase, Production, Marketing, Documents, Calendar, Notifications, Settings, Administration).
**Audit date:** 2026-10-17
**Audit type:** Read-only source review, configuration review, isolated test execution, dependency audit.
**Auditor stance:** Evidence-first. No application code, configuration, schema, dependency, or database was modified. The only file created by this audit is this report.

> **Reading convention.** Status labels are exactly:
> **Implemented and verified** · **Implemented; runtime verification pending** · **Partially implemented** · **Not found in inspected code** · **Not verified**.
> "Verified" means verified by a check that was actually executed during this audit (test, exact grep, file read) — never by assumption. A control implemented in code but not exercised at runtime is labelled *runtime verification pending*.

---

## 1. Executive summary

The ERP has a substantially hardened authentication and authorization layer for an application of this size. Key controls are genuinely present in code, not just described in documentation:

- Stateless Spring Security with HS256 JWTs, a fail-fast ≥256-bit signing key, BCrypt password hashing, 30-minute access tokens, rotating SHA-256-hashed refresh tokens with reuse detection and family revocation.
- Method security is enabled and used extensively: **691 `@PreAuthorize` annotations across 77 controllers covering 1,022 endpoint mappings**. Permission authorities are derived server-side from the persisted role; 36 fine-grained permissions are defined and mapped to `ADMIN`/`MANAGER`/`USER`.
- Registration no longer accepts a client-supplied role; it always creates `USER`.
- File serving is authenticated, UUID-name constrained, path-traversal guarded, served with `nosniff`, `no-store`, and a strict inline/attachment policy. Document-repository files additionally enforce document visibility.
- Authentication endpoints are rate limited; authentication events are written to a dedicated `SECURITY` logger with masked emails/IPs; JWT failures are classified and logged without ever logging the token.
- Central error handling returns generic 500s, JSON 401/403, and maps validation/business errors to 400/409 without leaking stack traces.
- Secrets are environment-driven with no production defaults (`app.jwt.secret`, DB username/password).
- **Executed evidence:** the targeted backend security suite **95/95 passed**; the frontend Sales-delete permission contract test **28/28 passed**; the architecture-boundary suite **32/33 passed** with one pre-existing failure unrelated to security.

The most important **evidence-backed gaps** are:

1. **Open self-registration grants internal ERP access (High).** `POST /v1/auth/register` is public and creates a `USER`, and `USER` holds `SALES_VIEW/CREATE/EDIT`, `CRM_VIEW/CREATE/EDIT`, `PURCHASE_VIEW/CREATE/EDIT`, `PRODUCTION_VIEW/CREATE/EDIT`, `DOCUMENT_VIEW/CREATE`, `MARKETING_*` and `CPR_*`. Anyone who can reach the API can create an account and read/write business data; there is no email verification or admin approval.
2. **Marketing expense approvals have no role or ownership check (High).** `POST /v1/marketing/expenses/{id}/approve|reject|correction` require only `isAuthenticated()`; the service (`ExpenseTripService.approve`) checks only that the trip is `Submitted`. Any authenticated user — including the submitter — can approve any expense trip by ID.
3. **Uploaded files escape the 4 GB pool and are never physically deleted (High).** Document uploads and generated PDFs call `FileStorageService.store`, whose size check counts only eight attachment tables; documents add bytes to disk without being counted. Permanent document deletion and attachment deletion remove DB rows but leave the files on disk. With open registration, this is an unauthenticated-to-authenticated path to unbounded disk consumption and indefinite retention of business documents.
4. **Vulnerable frontend dependencies (High).** `npm audit` (executed) reports **6 advisories: 5 high, 1 moderate**, including `xlsx@0.18.5` (prototype pollution + ReDoS, **no npm fix available**) which parses user-supplied spreadsheets in the browser, and `axios@1.19.0` (multiple advisories, fix available <1.20.0).

No **Critical** finding was confirmed: no pre-auth RCE, no SQL injection, no unauthenticated file access, no role-escalation via registration, and no hardcoded production secret in the current `application.properties` were found in the inspected scope.

**Overall assessment:** security-conscious architecture with strong authentication/authorization fundamentals, undermined by a permissive public onboarding path and a handful of missing object/role checks in secondary modules. The application should not be exposed to the public internet in its current state without closing H1–H3 and the Medium items in §14.

---

## 2. Project architecture and security boundaries

### 2.1 Runtime shape (as found)

```
Browser (React 19 + Vite SPA, localStorage tokens)
  │  Axios: Authorization: Bearer <access token>, baseURL /v1
  ▼
Reverse proxy / Vite dev proxy (TLS expected at the proxy; not in this repo)
  ▼
Spring Boot 3.4.13 (Java 21), context path /v1
  ├─ AuthRateLimitFilter      (per-IP, POST /auth/login|register|refresh)
  ├─ JwtAuthenticationFilter  (signature, expiry, account state, reloads user)
  ├─ Spring Security chain    (stateless, CSRF disabled, CORS allow-list)
  ├─ @PreAuthorize method security (691 annotations)
  ├─ Controllers (77) → Services → JPA repositories (231 @Query, 5 native)
  ▼
MySQL (JPA, ddl-auto=validate by default) + filesystem uploads/
```

- Backend entry point: [`ErpApplication.java`](erp-backend/src/main/java/com/vishatech/erp/ErpApplication.java).
- Security chain: [`SecurityConfig.java`](erp-backend/src/main/java/com/vishatech/erp/config/SecurityConfig.java).
- API base path: `/v1` (all paths in this report include it).
- Frontend entry: [`main.jsx`](erp-react/src/main.jsx), routes in [`App.jsx`](erp-react/src/App.jsx).
- A second, port-less context exists for CAD conversion: [`CadWorkerApplication.java`](erp-backend/src/main/java/com/vishatech/cadworker/CadWorkerApplication.java). It has no web layer and is out of the HTTP attack surface; it is not otherwise audited here.

### 2.2 Trust boundaries

| Boundary | Enforcement point | Evidence |
|---|---|---|
| Anonymous → authenticated | Spring Security `anyRequest().authenticated()`; `/auth/*`, `/health`, `/error`, selected actuator, `/ws/**` public | `SecurityConfig.java:66-85` |
| Authenticated user → module action | `@PreAuthorize` at class and/or method level, authorities from `CustomUserDetailsService` | `CustomUserDetailsService.java:29-40`; 691 annotations |
| Authenticated user → individual record | Service-layer ownership/visibility checks (documents, marketing, jobs); most ERP data is company-wide by design | `DocumentPermissionService.java`; `MarketingVisitService.java:955-1020`; `ProcessingJobService.java:398` |
| User → stored file | Authenticated `/files/{uuid}`; document visibility for repository-owned files; `nosniff` + disposition | `FileController.java:76-129` |
| Role → permission | `RolePermissions.permissionsOf(role)` | `RolePermissions.java:17-71` |
| Audit actor identity | `AuditContext` reads `SecurityContextHolder`, never request headers | `AuditContext.java:24-56` |

### 2.3 Data model ownership (important for IDOR analysis)

Most ERP business records (leads, customers, quotations, sales orders, invoices, CPRs, purchase documents, production orders, documents marked `TEAM_ONLY`) are **company-wide**: any authenticated internal user may read them. There is no `userId` foreign key on those rows and therefore no per-user object-level boundary to bypass. Record-level ownership *does* exist for marketing visits, travel plans/schedules, expense trips, questionnaire forms and processing jobs; those services were inspected for owner checks. This distinction matters: "user A can read user B's quotation" is intended design, not IDOR; "user A can approve user B's expense" is a defect (§13, SEC-H2).

---

## 3. Security controls inventory

| # | Control | Where | Status |
|---|---|---|---|
| 1 | Stateless Spring Security chain, method security | `config/SecurityConfig.java:26-116` | Implemented and verified |
| 2 | JWT creation/validation, HS256, ≥256-bit key, fail-fast | `security/JwtService.java:33-82` | Implemented and verified |
| 3 | JWT filter with account-state enforcement | `security/JwtAuthenticationFilter.java:56-136` | Implemented and verified |
| 4 | BCrypt password hashing | `SecurityConfig.java:134-136`; `AuthService.java:107` | Implemented and verified |
| 5 | Refresh tokens: hashed at rest, rotation, reuse detection, logout revocation | `service/RefreshTokenService.java:75-211` | Implemented and verified |
| 6 | Public registration cannot set role | `AuthService.java:96-113`; `dto/RegisterRequest.java` | Implemented and verified |
| 7 | Role/permission model (3 roles, 36 permissions) | `security/Permission.java`; `security/RolePermissions.java`; `entity/UserRole.java` | Implemented and verified |
| 8 | 691 method-level authorization annotations, 77 controllers | `@PreAuthorize` across `controller/`, `crm/controller/`, `production/` | Implemented and verified |
| 9 | Authentication rate limiting + per-email/IP login throttle | `security/AuthRateLimitFilter.java`; `security/RateLimiter.java`; `AuthService.java:59-73` | Implemented and verified |
| 10 | JSON 401/403 handlers, generic 500 | `security/RestAuthenticationEntryPoint.java`; `RestAccessDeniedHandler.java`; `exception/GlobalExceptionHandler.java` | Implemented and verified |
| 11 | Security event logging with masking | `security/SecurityAuditLogger.java` | Implemented and verified |
| 12 | CORS allow-list, no wildcard | `SecurityConfig.java:144-171`; `application.properties:144` | Implemented and verified |
| 13 | CSRF disabled by design (Bearer token, no cookies) | `SecurityConfig.java:56-62` | Implemented; design decision |
| 14 | Security headers: CSP, Referrer-Policy, frame DENY, optional HSTS | `SecurityConfig.java:90-110` | Implemented; runtime verification pending |
| 15 | Upload extension allow-list, server-generated names, size caps | `service/FileStorageService.java:62-101` | Implemented and verified |
| 16 | Authenticated file serving, traversal guards, `nosniff`, disposition | `controller/FileController.java:76-129` | Implemented and verified |
| 17 | Document repository visibility + lifecycle permission checks | `service/DocumentPermissionService.java`; `DocumentRepositoryService.java` | Implemented and verified |
| 18 | Shared attachment storage ledger (4 GB) | `service/AttachmentStorageService.java` | Partially implemented (see SEC-H3) |
| 19 | Central audit log (read-only API) | `entity/production/AuditLog.java`; `controller/production/AuditController.java`; `service/production/AuditService.java` | Implemented; over-exposed (SEC-M4) |
| 20 | DTO-based request binding (no entity mass assignment) | `dto/` records; controllers | Implemented |
| 21 | Parameterized JPQL/native queries, whitelisted sorting | 231 `@Query`; `AuditService.mapSortField` etc. | Implemented and verified |
| 22 | Secrets externalized, no defaults for JWT/DB | `application.properties:24-45`; `erp-backend/.env.example` | Implemented; rotation pending (SEC-M10) |
| 23 | Schema validation (`ddl-auto=validate` default) | `application.properties:36` | Implemented; runtime verification pending |
| 24 | WebSocket STOMP JWT authentication | `config/StompJwtInterceptor.java` | Partially implemented (no account-state check; wildcard origins) |
| 25 | Dependency audit | `npm audit` | Executed; 6 vulnerabilities (SEC-H4) |
| 26 | Backend dependency vulnerability scan | — | Not found in inspected code / Not verified |
| 27 | Password reset, MFA, email verification | — | Not found in inspected code |
| 28 | Database TLS, encryption at rest, backup policy | — | Not found in inspected code / Not verified |
| 29 | Frontend role-based route guards | `ProtectedRoute.jsx` only checks authentication | Partially implemented |
| 30 | SPA-layer CSP | — | Not found in inspected code (hosting responsibility) |

---

## 4. Authentication security

### 4.1 Mechanism and login flow

1. `POST /v1/auth/login` with `{email, password}` → `AuthController.login` (`AuthController.java:34-37`) → `AuthService.login` (`AuthService.java:59-93`).
2. `AuthService` applies an email+IP fixed-window throttle (`RateLimiter.tryAcquire`, 10/15 min by default), then delegates to `AuthenticationManager` → `DaoAuthenticationProvider` with `BCryptPasswordEncoder` (`SecurityConfig.java:121-136`).
3. On success it resets the email+IP counter, writes `LOGIN_SUCCESS`, and calls `RefreshTokenService.issue`, which returns an access token plus a raw refresh token.
4. Response: `AuthResponse(token, "Bearer", email, fullName, role, refreshToken)`.

- **Password hashing:** BCrypt, default strength 10, `SecurityConfig.passwordEncoder()`; hash stored in `users.password` (`User.java:52-53`). No custom hashing, no plaintext. Verified indirectly by passing login/registration tests.
- **Password policy:** `@Size(min = 8)` only (`RegisterRequest.java:12`). No complexity, breach-list, or reuse checks. No password-change or password-reset endpoint exists in the inspected code (targeted grep for `forgot-password`, `resetPassword`, `password-reset` returned no implementation).
- **Account states:** `enabled`, `locked`, `accountExpired`, `credentialsExpired` on `User` (`User.java:34-50`), mapped into Spring `UserDetails` (`CustomUserDetailsService.java:35-44`) and enforced per request by the JWT filter (`JwtAuthenticationFilter.java:83-92`). No administrative UI or API to set these states was found.
- **Sessions:** `SessionCreationPolicy.STATELESS` (`SecurityConfig.java:64`); no server-side HTTP session; no cookies used for authentication.
- **Tokens:** HS256 via JJWT 0.12.6, `verifyWith(signingKey)` (rejects `none`/wrong algorithm/bad signature), claims limited to `sub`/`iat`/`exp` (`JwtService.java:54-82`). Access lifetime 30 min (`app.jwt.expiration-ms`, default 1800000). Refresh lifetime 7 days.
- **Refresh tokens:** 256-bit `SecureRandom` values, SHA-256 hashed at rest (`refresh_tokens.token_hash`), rotated on every refresh, family lineage, reuse revokes the family, logout revokes the presented token, disabled/locked account revokes the token on rotation (`RefreshTokenService.java:75-211`).
- **Logout:** frontend calls `POST /v1/auth/logout` and clears storage (`authService.js:66-76`; `tokenStorage.clearAuth`). **The access token itself is not revoked** and remains valid until expiry (≤30 min). Reported as SEC-L1.
- **Anonymous access:** only `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/health`, `/error`, `/actuator/health|info|prometheus`, `/ws/**` (`SecurityConfig.java:66-81`). Everything else requires authentication.
- **Failure handling:** bad credentials → 401 `{"message":"Invalid credentials"}` via `GlobalExceptionHandler` (`handleAuthentication`); unknown endpoints 404; malformed JWT → 401 with no details. Disabled/locked accounts are reported as bad credentials at login (`AuthService.java:84-92`), so account state is not disclosed.
- **Credential leakage:** tokens are never logged (`SecurityAuditLogger` masks email/IP and never receives tokens); the JWT filter logs only a failure category, masked subject, IP and URI (`JwtAuthenticationFilter.java:56-136`). Tokens are not placed in URLs; file URLs carry only opaque stored names. `ApiRequestLoggingFilter.sanitizeUri` strips query strings (`ApiRequestLoggingFilter.java:122-128`).
- **Browser storage:** access and refresh tokens are both in `localStorage` (`tokenStorage.js:15-58`), readable by any JavaScript in the origin. This is a deliberate architecture choice (Bearer header, no cookies) and is documented in the prior `SECURITY_AUDIT.md`; it remains an XSS-impact amplifier (SEC-M6).

**Assessment:** authentication implementation is **Implemented and verified** for the core mechanism and its negative paths (JWT tampering, expiry, disabled/locked users, wrong password) by executed tests. MFA, password reset and email verification are **Not found in inspected code**.

### 4.2 Authentication-relevant evidence

| Concern | Evidence |
|---|---|
| Login/refresh/logout endpoints | `AuthController.java:34-56` |
| Registration always `USER` | `AuthService.java:96-113` (line 107) |
| No `role` field in registration DTO | `RegisterRequest.java` |
| BCrypt | `SecurityConfig.java:134-136` |
| JWT key validation | `JwtService.java:33-52` |
| Account state enforcement | `JwtAuthenticationFilter.java:83-92` |
| Refresh rotation + reuse | `RefreshTokenService.java:95-142` |
| Login throttling | `AuthService.java:59-73`; `AuthRateLimitFilter.java:88-110` |
| Auth logs masked | `SecurityAuditLogger.java:22-109` |

---

## 5. Authorization and permissions matrix

### 5.1 Roles and permissions

`UserRole`: `ADMIN`, `MANAGER`, `USER` (`entity/UserRole.java`).
`Permission`: 36 authorities (`security/Permission.java`).
`RolePermissions.permissionsOf` expands them (`security/RolePermissions.java:17-71`):

| Permission group | ADMIN | MANAGER | USER |
|---|---|---|---|
| Sales view/create/edit | ✔ | ✔ | ✔ |
| Sales delete | ✔ | ✔ | — |
| Sales approve | ✔ | ✔ | — |
| Purchase view/create/edit | ✔ | ✔ | ✔ |
| Purchase approve | ✔ | ✔ | — |
| Production view/create/edit | ✔ | ✔ | ✔ |
| Production delete | ✔ | ✔ | — |
| Production approve | ✔ | ✔ | — |
| Production dispatch | ✔ | ✔ | — |
| CRM view/create/edit | ✔ | ✔ | ✔ |
| CRM delete | ✔ | ✔ | — |
| CPR view/create/edit | ✔ | ✔ | ✔ |
| CPR delete / approve | ✔ | ✔ | — |
| Marketing view/create/edit/delete | ✔ | ✔ | ✔ |
| Documents view/create | ✔ | ✔ | ✔ |
| Documents edit/delete | ✔ | — | — |
| Notifications view | ✔ | ✔ | ✔ |
| Notifications manage | ✔ | ✔ | — |
| Settings/User/Role manage | ✔ | — | — |

Authorities are added to the principal at authentication time from the persisted role (`CustomUserDetailsService.java:29-40`); nothing is read from client input. Because the JWT filter reloads the user on every request, a role change takes effect on the next request, not only at token expiry.

### 5.2 Endpoint protection summary (by controller)

1,022 endpoint mappings exist. The table below is the **complete controller-level inventory** of the gate that applies to every endpoint in that controller (method-level annotations can be stricter, never weaker, in the cases inspected). A dash in "Class gate" means authorization is applied per method or by the global authenticated-only rule.

| Base path | Class gate | Permissions referenced | Notes |
|---|---|---|---|
| `/auth` | none | — | Login/register/refresh/logout public; `/me` authenticated |
| `/health` | none | — | Public |
| `/leads`, `/customers`, `/contacts`, `/followups` | `CRM_VIEW` | CRM_VIEW/CREATE/EDIT/DELETE | `DELETE` on CRM_DELETE (MANAGER/ADMIN) |
| `/quotations`, `/sales-orders`, `/sales-contracts`, `/proforma-invoices`, `/delivery-challans`, `/invoices`, `/credit-notes`, `/payment-receipts`, `/pr-references` | `SALES_VIEW` | SALES_VIEW/CREATE/EDIT/DELETE/APPROVE | Approvals use `SALES_APPROVE`; deletes use `SALES_DELETE` |
| `/sales/dashboard`, `/sales/reports` | `SALES_VIEW` | SALES_VIEW | Read-only |
| `/cprs`, `/cost-workouts`, `/profit-workouts`, `/cpr-technical-verifications` | `CPR_VIEW` | CPR_VIEW/CREATE/EDIT/DELETE/APPROVE | Approvals use `CPR_APPROVE` |
| `/documents`, `/history`, `/record-revisions` | `DOCUMENT_VIEW` | DOCUMENT_VIEW/CREATE/EDIT/DELETE, ADMIN | Permanent delete also admin-checked in service |
| `/files` | `isAuthenticated()` | — | Document visibility enforced where applicable |
| `/masters`, `/settings` | `SETTINGS_MANAGE` (methods) | SETTINGS_MANAGE | ADMIN only in practice |
| `/users` | `SETTINGS_MANAGE` | SETTINGS_MANAGE; role change `hasRole('ADMIN')` | Role change is ADMIN-only |
| `/audit` | `PRODUCTION_VIEW` | PRODUCTION_VIEW | Every USER can read (SEC-M4) |
| `/notifications` | `NOTIFICATION_VIEW` | VIEW/MANAGE | — |
| `/approvals`, `/dashboard`, `/calendar`, `/exchange-rates`, `/products`, `/settings/grid-configs`, `/settings/sales`, `/settings/marketing` | `isAuthenticated()` | — | Personal/aggregate reads; sales/marketing settings additionally `SETTINGS_MANAGE` per method |
| `/marketing`, `/marketing/activities`, `/marketing/calendar`, `/marketing/map`, `/marketing/location-tracking`, `/marketing/travel-plans`, `/marketing/travel-schedules` | `MARKETING_VIEW` | MARKETING_VIEW/CREATE/EDIT/DELETE | Service adds owner checks |
| `/marketing/expenses` | `isAuthenticated()` | — | **Owner checks on CRUD; approval endpoints have none (SEC-H2)** |
| `/marketing/q-forms` | `isAuthenticated()` | — | Service-level owner/visit checks |
| `/api/purchase/**` (requisitions, RFQs, orders, invoices, vendors, receiving, work queue, adjustment notes, dashboard) | per method | PURCHASE_VIEW/CREATE/EDIT/APPROVE | `PURCHASE_APPROVE` on approvals |
| `/production-orders`, `/production-entries`, `/production-trackers`, `/quality-inspections`, `/models`, `/drawings`, `/castings`, `/fabrications`, `/assemblies`, `/machine-shop`, `/dispatch`, `/packing`, `/production/reports`, `/production/settings`, `/technical-verifications`, `/integration`, `/acknowledgements`, `/production-kpi` | `PRODUCTION_VIEW` | PRODUCTION_VIEW/CREATE/EDIT/DELETE/APPROVE/DISPATCH | Approvals use `PRODUCTION_APPROVE` |
| `/locations` | none | — | Reads authenticated; mutations call `requireAdmin()` in the controller (`LocationController.java:283-292`) |

### 5.3 Representative endpoint matrix (verified from annotations)

| Method | Path | Auth | Authority / check | Evidence |
|---|---|---|---|---|
| POST | `/v1/auth/register` | Public | always `USER` | `SecurityConfig.java:66-68`; `AuthService.java:107` |
| GET | `/v1/auth/me` | Authenticated | any | `AuthController.java:59-65` |
| GET | `/v1/leads` | Authenticated | `CRM_VIEW` | `crm/controller/LeadController.java` |
| DELETE | `/v1/leads/{id}` | Authenticated | `CRM_DELETE` | `crm/controller/LeadController.java` |
| GET | `/v1/quotations` | Authenticated | `SALES_VIEW` | `controller/QuotationController.java` |
| POST | `/v1/quotations` | Authenticated | `SALES_CREATE` | `controller/QuotationController.java` |
| DELETE | `/v1/quotations/{id}` | Authenticated | `SALES_DELETE` | `controller/QuotationController.java` |
| POST | `/v1/sales-contracts/{id}/approve` | Authenticated | `SALES_APPROVE` | `controller/SalesContractController.java:127-131` |
| GET | `/v1/documents` | Authenticated | `DOCUMENT_VIEW` + row visibility | `DocumentRepositoryController.java:40-77`; `DocumentPermissionService.java:48-57` |
| DELETE | `/v1/documents/{id}/permanent` | Authenticated | `DOCUMENT_DELETE` + service admin check | `DocumentRepositoryController.java:174-178`; `DocumentRepositoryService.java:676-695` |
| PATCH | `/v1/users/{id}/role` | Authenticated | `SETTINGS_MANAGE` + `hasRole('ADMIN')`; self-change blocked | `UserController.java:27-29,56-84` |
| GET | `/v1/audit` | Authenticated | `PRODUCTION_VIEW` (held by USER) | `AuditController.java:21-22` |
| POST | `/v1/marketing/expenses/{id}/approve` | Authenticated | **no role/owner check** | `ExpenseTripController.java:82-85`; `ExpenseTripService.java:156-166` |
| GET | `/v1/files/{filename}` | Authenticated | UUID name + document visibility if repo-owned | `FileController.java:76-129` |
| GET | `/v1/actuator/prometheus` | **Public** | none | `SecurityConfig.java:72-76`; `application.properties:354` |
| GET | `/v1/actuator/metrics`, `/v1/actuator/mappings` | Authenticated | any JWT (USER included) | `SecurityConfig.java:77`; `application.properties:354` |

### 5.4 Frontend authorization

- All application routes sit inside one `<ProtectedRoute />` block (`App.jsx:223-361`); `ProtectedRoute` checks only that a usable access or refresh token exists (`ProtectedRoute.jsx:8-14`).
- **No role-based route guard exists** in `App.jsx`, `src/purchase/routes/`, or `src/production/routes/` (targeted grep for `isAdmin`/role checks returned nothing). Every authenticated user can open every module's UI; the backend returns 403 on forbidden actions.
- Menu visibility is not role-filtered in `AppLayout.jsx`; it shows the sidebar profile role only.
- Delete affordances in the eight Sales document modules are gated by `hasSalesDelete(role)` (`src/utils/salesPermissions.js`; `CurrentUserContext.jsx:26-40`). A contract test asserts this mirror matches `RolePermissions.java` (executed, 28/28).
- These are **convenience controls only**; server-side authorization is independent and remains authoritative, which is the correct property. The gap is UI exposure of modules/actions that will fail at the API, not a backend bypass.

---

## 6. API and backend security

### 6.1 Request validation

- Controllers bind **DTO records**, not JPA entities: no mass-assignment of `id`, `role`, `password`, or audit columns was found. Registration ignores unknown JSON fields (Jackson default), which is why `{"role":"ADMIN"}` still creates `USER` (verified by `AuthSecurityTests`).
- Bean Validation is present on authentication, CRM lead, document, cost-workout, purchase, expense and CPR request DTOs, but coverage is **partial**: 334 `@RequestBody` parameters vs 184 `@Valid` annotations; only 31 of 220 DTO files contain `jakarta.validation` annotations. Examples without constraints: `dto/QuotationRequest.java`, `dto/TravelPlanRequest.java`. Business validation is also performed in services (`BadRequestException`, `IllegalArgumentException` → 400).
- **Impact:** malformed payloads can reach service code and produce 500s or partial writes; not a confirmed injection or authorization bypass. Reported as SEC-M9.
- `GlobalExceptionHandler` correctly maps: not found 404, bad request 400, forbidden 403, conflict 409, validation 400, method/media 405/415, upload too large 413, auth 401. The catch-all logs the exception server-side and returns a generic message (`GlobalExceptionHandler.java:180-190`).
- **Notable leak surface:** `IllegalArgumentException` messages are returned verbatim (400) and `ResourceNotFoundException` messages include the requested identifier; these are business identifiers, not stack traces/SQL. Low risk (SEC-L9).

### 6.2 SQL injection / query construction

- 231 `@Query` declarations, 5 native queries. All native queries are either constant SQL or use bound parameters (`AppSettingRepository.upsert`, `AttachmentStorageUsageRepository`). The only string concatenation in a native query is over a **hard-coded table allow-list** in `AttachmentStorageService.sumSizesPerTable` (`AttachmentStorageService.java:288-301`).
- Sorting is mapped through explicit switches (`AuditService.mapSortField`, `DispatchService.mapSortField`, etc.), not passed to the ORM.
- Executed tests `InputValidationSecurityTests.sqlInjectionInSearchParamIsNeutralized` and `sqlInjectionInSortParamIsNeutralized` passed (7/7 class).
- **Conclusion:** SQL injection: **Implemented and verified** for the inspected paths. This is not a proof that every one of 1,022 endpoints is injection-free; no SAST tool was run.

### 6.3 IDOR / BOLA and cross-module access

| Area | Object-level check | Evidence |
|---|---|---|
| Documents (view/download/edit/delete/versions) | Visibility (`ADMIN_ONLY`, team-scoped → ADMIN until `users.team` exists, legacy values → all authenticated) + uploader/admin for delete | `DocumentPermissionService.java:48-144` |
| Marketing visits / leads | ADMIN/MANAGER see all; others only their own; `AccessDeniedException` otherwise | `MarketingVisitService.java:955-1020` |
| Travel plans / schedules | Owner/requestee/assignee or ADMIN/MANAGER | `TravelPlanService.java:753-770`; `TravelScheduleService.java:439-453` |
| Expense trips (CRUD) | `assertCanAccess` owner or ADMIN/MANAGER | `ExpenseTripService.java:68-137,196-231,358-364` |
| Expense approvals | **Absent** | `ExpenseTripService.java:156-190` |
| Q-forms | Owner or ADMIN/MANAGER; visit ownership | `QuestionnaireFormService.java:443-476` |
| Processing jobs | Owner or admin | `ProcessingJobService.java:398` |
| Module attachments | **Authenticated-only; no object check** | `FileController.java:112-129` (only document-repo rows are checked) |
| CRM / Sales / Purchase / Production records | Company-wide by design | No owner column on the entities |

### 6.4 State transitions and duplicate requests

- Deletes are soft deletes (`status = deleted`, `archivedAt`) rather than row removal (`SalesOrderService.java:400-412`; `CprService.java:406-420`), with `RevisionSupport.requireLatest` guarding mutations of historical revisions.
- Business state machines exist (e.g., quote → contract → order conversions; approval states checked before transition), and several services reject edits in terminal states.
- **No idempotency keys** were found for write/convert endpoints; a double-submitted conversion request can execute twice if the UI/browser retries. Impact is business duplication, not privilege escalation. Informational.

### 6.5 Rate limiting, CORS, CSRF, headers, actuator

- **Rate limiting:** only `POST /auth/login`, `/auth/register`, `/auth/refresh` (`AuthRateLimitFilter.shouldNotFilter`); defaults 20 login attempts/IP/15 min, 10/email+IP/15 min, 5 registrations/IP/hour, 60 refreshes/IP/15 min. In-memory per instance. No limits on uploads, exports, or other write endpoints. 429 + `Retry-After` verified by `RateLimitTests` (2/2).
  - **Bypass risk:** the client IP is taken from `X-Forwarded-For` if present, from any caller (`AuthRateLimitFilter.java:114-121`; `AuditContext.java:65-77`; `RestAuthenticationEntryPoint.java:42-48`). Without a trusted-proxy configuration that overwrites this header, an attacker can rotate it to evade per-IP limits and to poison audit IPs (SEC-M3).
- **CORS:** explicit origin allow-list from `ERP_CORS_ALLOWED_ORIGINS` (default localhost dev origins), methods GET/POST/PUT/PATCH/DELETE/OPTIONS, credentials allowed, `Content-Disposition` exposed. Allowed headers include `Authorization`, `Content-Type`, and `X-Actor-Id/Name/Role` (`SecurityConfig.java:144-171`). The actor headers are **not read anywhere in backend Java** (verified by grep) — they are unnecessary but not trusted. Verified by `CorsSecurityTests` (3/3).
- **CSRF:** disabled. Correct for stateless Bearer-token auth with no cookies; documented in code (`SecurityConfig.java:56-62`). Would become a vulnerability if auth moved to cookies.
- **Headers:** CSP `default-src 'self'` with Google Fonts allowances, `object-src 'none'`, `frame-ancestors 'none'`; Referrer-Policy `strict-origin-when-cross-origin`; frame-options DENY; HSTS only when `ERP_SECURITY_HSTS=true` and only on secure requests (`SecurityConfig.java:90-110`). These headers are emitted on **API responses**; the SPA's own HTML headers depend on the hosting layer, which is not in this repository. No CSP `<meta>` exists in `index.html`.
- **Actuator:** base path `/actuator`; exposed endpoints `health,info,metrics,mappings,prometheus` (`application.properties:354`). Security allows `health`, `info`, **`prometheus`** anonymously and requires authentication for the rest (`SecurityConfig.java:72-77`). The comment above the property says Prometheus is deliberately *not* exposed, but the active line exposes it — a configuration/comment contradiction with real information disclosure (SEC-M2). `metrics` and `mappings` are reachable by any authenticated user, including a self-registered `USER`, and `mappings` enumerates every route.
- **WebSocket:** handshake `/ws/**` is `permitAll`; STOMP `CONNECT` requires a Bearer JWT and derives the principal from it (`StompJwtInterceptor.java:75-117`). Allowed origin patterns are `"*"` (`WebSocketConfig.java:50-53`). Because the token is supplied in a STOMP header (not a cookie), classic cross-site WebSocket hijacking does not apply, but unauthenticated cross-origin connection attempts are accepted until CONNECT (SEC-L4). The interceptor checks signature/expiry/subject but **not** `enabled`/`locked`, unlike the HTTP filter.

### 6.6 API classification summary

| Control | Status |
|---|---|
| Endpoint authentication (global `anyRequest().authenticated()`) | Implemented and verified |
| Endpoint authorization (`@PreAuthorize`) | Implemented and verified for tested paths; 691 annotations present |
| Object-level authorization | Partially implemented (documents, marketing, jobs); absent for attachments and expense approvals |
| DTO validation | Partially implemented |
| SQL injection resistance | Implemented and verified for inspected paths |
| Generic error handling | Implemented and verified |
| Brute-force protection | Partially implemented (per-instance, XFF-spoofable) |
| CORS | Implemented and verified |
| CSRF | Disabled by design |
| Security headers | Implemented; runtime verification pending |
| Actuator minimization | Partially implemented (Prometheus public, metrics/mappings to any JWT) |
| Rate limiting outside auth | Not found in inspected code |
| Idempotency for writes | Not found in inspected code |

---

## 7. File upload, download and document security

### 7.1 Upload path

All module attachments and repository documents ultimately pass through `FileStorageService.store` (`FileStorageService.java:62-101`):

1. Rejects null/empty files (`:63-66`).
2. Rejects files above `spring.servlet.multipart.max-file-size` (default **2 GB**, `application.properties:73`) (`:67-70`).
3. Calls `AttachmentStorageService.assertCanUpload(size)` (4 GB project-wide pool) (`:72`).
4. Sanitizes the original name (strips path components/control chars, caps at 255) (`:143-161`).
5. Accepts only the configured extension allow-list (`pdf,doc,docx,xls,xlsx,csv,txt,png,jpg,jpeg,gif,webp,zip,step,stp,iges,igs,stl,obj,glb,gltf`, `application.properties:100`) (`:76-83`).
6. Stores under a server-generated `UUID.ext` name with a normalized-path containment check (`:85-97`).

Verified by `FileStorageSecurityTests` (7/7: exe/script/html rejected, no-extension rejected, PDF accepted, traversal name neutralized, oversize/empty rejected).

**Frontend mirror:** `src/utils/attachmentStorage.js` mirrors size/type rules for UX, but the backend is authoritative.

### 7.2 Download path

`GET /v1/files/{filename}` (`FileController.java:76-105`):

- Requires authentication (class `@PreAuthorize("isAuthenticated()")`, and `/files/**` is not public).
- Accepts only server-generated `32-hex[.ext]` names (`isSafeStoredName`), rejecting separators/`..`/NUL.
- Normalizes and verifies the resolved path stays under the upload root (`FileStorageService.loadAsResource:123-140`).
- Sets `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`; only PDF/PNG/JPEG/GIF/WebP are served `inline`, everything else is `Content-Disposition: attachment`.
- If the stored name belongs to a document-repository entry or version, at least one owning document must be viewable by the caller, else 403 (`FileController.java:112-129`).
- Document-repository downloads (`GET /v1/documents/{id}/file`) enforce `DocumentPermissionService.canView`, write a `VIEWED`/`DOWNLOADED` audit entry, and also set `nosniff` + `no-store` (`DocumentRepositoryService.loadDocumentFile:1462-1485`; `DocumentRepositoryController.java:256-274`).

Verified by `FileSecurityTests` (9/9: anonymous 401, storage 401/200, authenticated download, raw/encoded traversal 400, non-UUID 400, missing 404) and `DocumentsApiTest` (12/12).

### 7.3 Gaps

- **No MIME/content validation** — only the filename extension. A PE/HTML/JS payload renamed `.pdf` is stored; serving is mitigated by `nosniff` + attachment, but internal users can still download and execute such files locally, and the server-side PDF/POI parsers consume attacker-controlled content. No antivirus/CDR scan exists (SEC-M12).
- **2 GB per file / 2.2 GB per request** and a 50-part limit are very large for a web ERP; an authenticated user can deliberately consume request workers, spool disk and bandwidth (SEC-H3 compound).
- **Storage accounting bypass:** `assertCanUpload` counts only `sales_attachments`, `lead_attachments`, `cpr_attachments`, `customer_attachments`, `followup_attachments`, `qform_attachments`, `marketing_expense_attachments`, `purchase_attachments` (`AttachmentStorageService.java:73-82`). Repository documents (`document_repository`, document versions) and generated PDFs are written to the same `uploads/` root via the same `store`/`storeBytes` path but never counted, so the 4 GB cap does not bound them (SEC-H3).
- **No physical deletion:** `DocumentRepositoryService.purgeDocument` deletes versions, document audit rows and the repository row only (`DocumentRepositoryService.java:690-695`); `SalesOrderService.deleteAttachment` deletes the row only (`SalesOrderService.java:988-995`). Files persist indefinitely as orphans; retention/privacy obligations are not met and disk usage only grows (SEC-H3/SEC-L3).
- **Attachment object-level authorization is absent** for non-document-repository files (marketing/q-form/expense attachments and module attachments). Any authenticated user who learns the 32-hex stored name can download it (SEC-M5). The name is unguessable in practice (128-bit), which is why this is Medium, not High.
- **Client-supplied display attribution:** `POST /v1/documents/upload` accepts `uploadedBy` and stores it as the display name (`DocumentRepositoryController.java:99-112`; `DocumentRepositoryService.java:213-242`). The numeric `uploadedById` is server-derived, so this is display spoofing only (SEC-L8).
- **Content-Disposition quoting:** document downloads build `filename="<documentName>"` from the original uploaded name, sanitized for path characters but not for quotes (`DocumentRepositoryController.java:263-265`). Tomcat rejects CR/LF in headers, so header splitting is not demonstrated; filename spoofing is possible (SEC-L7).
- **Soft vs permanent delete:** module records use soft delete with restore; documents have soft delete/archive plus an ADMIN-only permanent delete. Permanent delete erases the document's audit trail (`DocumentAuditService.deleteByDocument:101-103`) while the central `audit_logs` remains (SEC-L2).
- **Orphan/reconciliation:** `DocumentReconciliationService` detects missing/duplicate/orphan rows against disk, but reconciliation is a manual/endpoint-triggered maintenance action (`POST /v1/documents/reconcile`, `DOCUMENT_CREATE`) and does not delete files.

### 7.4 File-security control classification

| Control | Status |
|---|---|
| Extension allow-list (server) | Implemented and verified |
| Server-generated storage names | Implemented and verified |
| Empty file / size rejection | Implemented and verified |
| Path traversal defense | Implemented and verified |
| Auth required for download | Implemented and verified |
| Document visibility on download | Implemented and verified |
| Attachment-level object authorization | Partially implemented (documents only) |
| MIME/content validation | Not found in inspected code |
| Malware scanning | Not found in inspected code |
| Physical file deletion / retention | Partially implemented (none on delete) |
| Storage cap for all stored files | Partially implemented (attachments only) |
| Duplicate-file handling | Partially implemented (UUID names; no content dedupe) |
| Inline execution prevention | Implemented (`nosniff` + disposition policy) |

---

## 8. Database and data protection

### 8.1 Configuration

- JDBC URL default: `jdbc:mysql://localhost:3306/erp_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC` (`application.properties:27`). **TLS is disabled by default** (SEC-M7). `createDatabaseIfNotExist` is not present.
- Username/password: `${ERP_DATABASE_USERNAME}` / `${ERP_DATABASE_PASSWORD}` with **no defaults** (`:28-29`); `.env` is loaded optionally and is git-ignored (`spring.config.import=optional:file:.env[.properties]`, `:9`). A local `erp-backend/.env` exists and was **not read**.
- `ddl-auto=${ERP_DDL_AUTO:validate}` (`:36`) — schema drift fails startup rather than silently altering it. No Flyway/Liquibase dependency or migration directory was found; schema changes are manual SQL under `erp-backend/docs/` (e.g., `schema_baseline.sql`, `documents_migration.sql`), applied by an operator.
- `open-in-view=false`, `show-sql=false` (`:37-39`).
- Dedicated application user script exists: `erp-backend/docs/mysql-app-user.sql` (`erp_app`, DML + optional DDL, no admin grants). Whether the deployed instance uses it is **Not verified**.
- Two large SQL dumps sit in `erp-backend/` (`erp_db_backup_20260813_111459.sql`, `erp_db_backup_leadreset_20260813_122242.sql`) but are **not tracked** by Git (verified by `git ls-files`); `.gitignore` excludes `*.sql`-adjacent runtime data patterns. They still contain business data/password hashes on disk and must be protected operationally.

### 8.2 Secrets

- No production JWT secret or DB password is hardcoded in the current `application.properties`; `JwtService` fails fast on missing/weak secrets (`JwtService.java:33-52`).
- The only committed JWT key is the fixed **test-only** key in `src/test/resources/application.properties:25`, shadowing production config on the test classpath (SEC-L11).
- **Historic exposure:** `git log -S "app.jwt.secret=" -- erp-backend/src/main/resources/application.properties` shows the value was introduced in the initial commit (`d7c31fb`) and later removed by the hardening work. The old key and DB password remain retrievable from Git history and must be treated as compromised; rotation is a deployment action (SEC-M10). Values are intentionally not reproduced here.
- Frontend build-time variables inspected: only `VITE_API_URL`, map tile/geocode/route URLs, `VITE_GOOGLE_MAPS_API_KEY`, CAD poll interval, purchase API base. The Google Maps key is by design client-visible and must be referrer/API restricted (`erp-react/.env.example`); no server secret is exposed through `VITE_*`.

### 8.3 Data handling

- `User.password` is BCrypt and `UserResponse` never includes it; no controller returns a `User` entity (verified by grep for `ApiResponse<User>`/`ResponseEntity<User>`).
- Audit entities store `old_value`/`new_value` JSON snapshots of business records (`AuditLog.java:88-102`). These can contain pricing, customer and commercial terms — cross-module audit reads are a data-exposure concern (SEC-M4).
- Soft delete (`status`, `archived_at`) preserves records; there are no scheduled purge jobs for business records found in the inspected scope.
- No column encryption, no encryption-at-rest configuration, and no backup configuration were found in the repository. These are deployment/infrastructure concerns and are **Not verified**.

### 8.4 SQL safety

Covered in §6.2: parameterized queries, hard-coded native SQL, whitelisted sort fields; `InputValidationSecurityTests` passed. No dynamic table/column names from user input were found.

### 8.5 Classification

| Control | Status |
|---|---|
| Secrets externalized, no production defaults | Implemented; rotation pending |
| Test vs production secret separation | Implemented (test key is test-scope only) |
| DB TLS | Not enabled by default |
| Least-privilege DB user | Script exists; deployment Not verified |
| Parameterized queries | Implemented and verified (inspected paths) |
| Schema validation | Implemented; MySQL runtime verification pending |
| Migration tooling | Not found in inspected code |
| Encryption at rest / backups | Not found in inspected code / Not verified |
| PII/password exposure through APIs | Not found for `User`; audit snapshots may contain business data |

---

## 9. Frontend security

| Area | Finding | Status |
|---|---|---|
| Route protection | Single `ProtectedRoute` wraps all app routes; redirects to `/signin` when no usable token/refresh token | Implemented; client-side only |
| Role-based routing | No role checks in route files; all authenticated users can open all modules | Not found in inspected code (backend still authoritative) |
| Auth state | `localStorage` keys `authToken`, `refreshToken`, `authUser`; auth-state event for listeners | Implemented |
| Token exposure | Access and refresh tokens readable by any same-origin JS; XSS = account takeover | Accepted risk, documented (SEC-M6) |
| API auth header | Axios request interceptor attaches Bearer token; proactive refresh 60 s before expiry; single-flight refresh; replay once on 401 | Implemented |
| 401 handling | Refresh once, then `clearAuth()` + redirect to `/signin`; auth-endpoint 401s are not looped | Implemented |
| 403 handling | Surfaced to the global error UI without logging the user out | Implemented |
| HTML injection | `MarketingMapPage.jsx` interpolates trip/stop fields into `dangerouslySetInnerHTML` **without escaping** (`:1078-1085`, `:1155`, `:1159`) | Confirmed risk (SEC-M1) |
| Other HTML rendering | `QuotationPrint.jsx` renders `buildSalesPrintHtml(...)`; that builder escapes every interpolated value with `esc()` (`salesPrintUtils.js:7-13`, 31 uses). `prClipboard.js` writes to a detached `<textarea>` (not rendered) | Inspected; no issue found in print builder |
| `eval`/`new Function` | None found | — |
| Client-side validation | Present extensively (forms, Zod/resolvers); not a security boundary | — |
| Secrets in bundle | Only public config/`VITE_*`; Google Maps key must be referrer-restricted | Implemented with deployment caveat |
| External content | Google Fonts stylesheet only; `/src/main.jsx` module script; no third-party scripts | Inspected |
| Error pages | 400/401/403/404/408/429/5xx/network pages exist | Implemented |
| Dependencies | `npm audit`: 6 advisories (5 high, 1 moderate) | Confirmed (SEC-H4) |

**XSS specifics (SEC-M1):** `trip.planNo`, `startingLocation`, `endingLocation`, `marketer`, `status` and stop `companyName`/`address`/`status` come from the backend (travel plans/stops, editable by marketing users). They are concatenated into HTML strings and injected. CSP `script-src 'self'` (where applied) blocks inline `<script>` and inline event handlers in modern browsers, which prevents straightforward token theft, but the SPA's CSP is not in this repository and Vite dev serves no CSP. Stored HTML/UI spoofing is possible regardless; with a weakened/missing CSP, stored XSS and token exfiltration follow. This is Medium (conditional), not a confirmed end-to-end exploit.

---

## 10. Audit logging and monitoring

### 10.1 What exists

- **Security event stream** (`SECURITY` logger; `logback-spring.xml` routes it at INFO in all profiles): login success/failure/blocked, register blocked, JWT rejection categories (`MISSING`, `MALFORMED`, `EXPIRED`, `BAD_SIGNATURE`, `UNSUPPORTED_ALGORITHM`, `USER_DISABLED`, `USER_LOCKED`, `ACCOUNT_EXPIRED`, `USER_NOT_FOUND`, `SUBJECT_MISMATCH`, `INVALID`), unauthenticated access, access denied, role changes, refresh issued/revoked/reuse/invalid. Emails and IPs are masked; tokens are never logged (`SecurityAuditLogger.java:22-109`).
- **Business audit log** (`audit_logs`): `userId`, `username`, module, entity type/id/display id, action enum, old/new JSON, description, IP, request id, timestamps (`AuditLog.java`). Written via `AuditService`/`AuditPort` from production, purchase, sales, CPR and document flows; purchase uses a post-commit writer (`PurchaseCentralAuditWriter`).
- **Document audit** (`document_audit`): create/update/view/download/delete/restore/visibility events, written even for file access (`DocumentRepositoryService.loadDocumentFile` calls `recordAccess`).
- **Read API:** `GET /v1/audit`, `/audit/{id}`, `/audit/entity/{type}/{id}`, `/audit/user/{id}`, `/audit/module/{module}`, `/audit/stats` — **read-only; no create/update/delete endpoints** (`AuditController.java`). Pagination capped at 100 (`AuditService.java:236`), sort field whitelisted.
- **Request logging:** one line per request with method/path/status/duration; query strings stripped; WARN for 4xx, ERROR for 5xx (`ApiRequestLoggingFilter`). A correlation id is put in MDC and returned as `X-Request-Id`.
- **Purchase timeline:** `purchase_timeline` records actor/action per procurement document, with an audit-failure isolation test (`PurchaseAuditFailureIsolationTests`).

### 10.2 Gaps

- **Over-exposure (SEC-M4):** `GET /v1/audit` requires only `PRODUCTION_VIEW`, which every `USER` holds. Any authenticated internal user (and, given open registration, any self-registered account) can read every module's audit history, including old/new value snapshots. There is no role gate (e.g., ADMIN-only) and no per-module scoping.
- **Audit deletion:** document permanent delete removes that document's document-audit rows (`DocumentAuditService.deleteByDocument`). Central `audit_logs` rows are not deleted by any API found.
- **Immutability:** enforced by the absence of write APIs, not by DB permissions/triggers. A DB-level actor or compromised application credential can update/delete rows.
- **Sensitive content in audit:** snapshots are not redacted; they may contain commercial terms/customer data. Log storage must be protected accordingly.
- **Coverage gaps:** authentication and document/production/purchase flows are covered; no audit entries were found for user enable/disable (no endpoint exists) or for document settings changes; `roleChanged` is logged to the SECURITY stream, not `audit_logs`.
- **No alerting/monitoring configuration** (e.g., SIEM, alert rules) exists in the repository. `SECURITY` log filtering/alerting is a deployment task.

---

## 11. Configuration and dependency security

### 11.1 Profiles and startup

- `application.properties` is environment-driven; no `application-prod.properties` was found. `prod` profile changes logging to JSON and raises the root level to WARN (`logback-spring.xml`).
- `DataSeeder` is excluded from `prod`/`production` (`@Profile("!prod & !production")`) but **runs by default** and creates users including an ADMIN with a hardcoded default password (`DataSeeder.java:31-42,142-170`; value redacted here). Any deployment that forgets `SPRING_PROFILES_ACTIVE=prod` inherits those accounts (SEC-M8).
- HSTS is off by default; TLS termination is a proxy concern. No HTTP→HTTPS redirect in the app.
- Server port `8080`, context path `/v1`; management endpoints under `/actuator`. Ports/management exposure are otherwise standard.

### 11.2 Dependency versions (backend)

`pom.xml`: Spring Boot **3.4.13** (Spring Framework 6.2.x, Tomcat 10.1.x), Java 21, JJWT 0.12.6, PDFBox 2.0.32, Apache POI **5.4.1**, flying-saucer 9.3.1, MySQL connector managed by Boot, H2 test-scope, ArchUnit 1.4.2, REST Assured 5.5.6.

No OWASP Dependency-Check/Snyk/Trivy plugin or CI step exists (`pom.xml`, `.github/workflows/ci.yml`). Backend CVE status is therefore **Not verified** — no scanner was available offline and no dependency install/upgrade was performed.

### 11.3 Dependency audit (frontend, executed)

`npm audit --json` was executed on 2026-10-17 against the committed `package-lock.json` (network-dependent, read-only). Result: **6 vulnerabilities — 5 high, 1 moderate, 0 critical**.

| Package | Installed | Advisory | npm severity | Fix |
|---|---|---|---|---|
| `xlsx` | 0.18.5 | Prototype pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9) | High | **No npm fix available** (`fixAvailable: false`) |
| `axios` | 1.19.0 | Multiple advisories incl. ReDoS, header injection, redirect SSRF, prototype-pollution gadgets; affected `<1.20.0` | High (aggregate) | Available (`^1.20.0`) |
| `nanoid` | 3.3.16 | Infinite loop when `size=0` (GHSA-2v37-7h3g-55p8) | High | Available |
| `source-map-js` | 1.2.1 | Event-loop DoS (GHSA-68fv-2mgg-jv7q) | High | Available |
| `brace-expansion` | 5.0.9 | Recursion/CPU DoS advisories | High (aggregate) | Available |
| `dompurify` | 3.4.12 | XSS via `IN_PLACE` hook (GHSA-55q2-fjhq-7xh7) | Moderate | Available |

Most `axios` advisories target the Node HTTP adapter (`createConnection`, `NO_PROXY`, HTTP/2, proxy bypass); this SPA uses the browser XHR/fetch adapter, which reduces but does not eliminate relevance (prototype-pollution gadgets and redirect handling still apply). `xlsx` is used in the browser to parse uploaded spreadsheets, so its ReDoS/prototype-pollution advisories are reachable with attacker-supplied files. Dependency upgrades were deliberately not performed (audit scope).

### 11.4 Git-tracked sensitive files

- Tracked: `.env.example`, `erp-backend/.env.example` (placeholders only), migration SQL under `docs/`, `scripts/*.sql`. No `.env` value, private key, or cloud access key was found in tracked files by targeted `git grep`.
- Untracked/local: `erp-backend/.env`, `.env`, `erp_db_backup_*.sql` (not tracked; present on disk).
- Historical: the initial commit contains the removed JWT secret/DB credential line (see §8.2; value redacted).

### 11.5 CI

`.github/workflows/ci.yml` builds the frontend, runs the contract suite and (reported, non-gating) Vitest suite, and runs the backend tests on an isolated profile with a minimum executed-test-count check. It does **not** run `npm audit` or any dependency/container/secret scanner (SEC-M11).

---

## 12. Existing security tests and verification evidence

### 12.1 Executed during this audit

**Command 1 — backend security suite (isolated H2, test profile, no MySQL):**

```
./mvnw -o -Dtest='AuthSecurityTests,JwtSecurityTests,ExpiredJwtSecurityTests,
FileSecurityTests,FileStorageSecurityTests,CorsSecurityTests,RateLimitTests,
RefreshTokenSecurityTests,RefreshTokenCleanupTests,AuthorizationSecurityTests,
InputValidationSecurityTests,ActuatorSecurityTests,SalesDocumentAuthorityContractTests,
DocumentsApiTest,DocumentReferenceApiTest,CrmApiTest' -DfailIfNoTests=false test
```

Result: **BUILD SUCCESS; Tests run: 95, Failures: 0, Errors: 0, Skipped: 0** (exit 0, 2026-10-17).

| Test class | Tests | Purpose (from source) |
|---|---|---|
| `ActuatorSecurityTests` | 5 | `/health` public; `/leads` 401 anonymous/200 with token; Micrometer metrics registered |
| `AuthorizationSecurityTests` | 7 | Role change requires auth/ADMIN, self-demotion blocked, invalid role 400, financial settings ADMIN-only, `/me` identity |
| `AuthSecurityTests` | 8 | Registration with `role: ADMIN/MANAGER` still yields USER; duplicate email 409; weak password 400; valid/invalid login |
| `CorsSecurityTests` | 3 | Allowed origin preflight OK; disallowed/wildcard origin rejected |
| `CrmApiTest` | 7 | CRM API contract/persistence under security |
| `DocumentReferenceApiTest` | 5 | Reference-existing-document endpoint requires auth and reuse rules |
| `DocumentsApiTest` (security pkg) | 12 | Document auth, lifecycle+audit, DOCUMENT_EDIT/DELETE gates, maintenance jobs, visibility body validation, scope isolation, settings ADMIN-only |
| `ExpiredJwtSecurityTests` | 1 | Expired token → 401 |
| `FileSecurityTests` | 9 | Anonymous file/storage 401; authenticated download; raw/encoded traversal 400; non-UUID 400; missing 404 |
| `FileStorageSecurityTests` | 7 | exe/html/js rejected; no extension rejected; PDF accepted; traversal name neutralized; oversize/empty rejected |
| `InputValidationSecurityTests` | 7 | SQLi in search/sort neutralized; bad date 400; pagination clamped; invalid body 400; unknown endpoint 404; missing token 401 |
| `JwtSecurityTests` | 9 | Missing/malformed/garbage/wrong-key/modified token → 401; disabled/locked/unknown user token rejected |
| `RateLimitTests` | 2 | Login brute force 429; registration throttled |
| `RefreshTokenCleanupTests` | 3 | Expired/revoked token cleanup |
| `RefreshTokenSecurityTests` | 6 | Login returns both tokens; rotation; reuse revokes family; logout revokes; garbage 401; missing token 400 |
| `SalesDocumentAuthorityContractTests` | 4 | Bulk/permanent delete routes require `SALES_DELETE`; single-record delete same authority; state changes stay on `SALES_CREATE`; plain USER refused |

**Command 2 — frontend permission contract test:**

```
node --test tests/sales-delete-permissions.test.js
```

Result: **28 tests, 28 pass, 0 fail.** It asserts the frontend `hasSalesDelete` mirror against `RolePermissions.java`, that all eight Sales modules' delete entry points are gated, and that the scanner is non-vacuous.

**Command 3 — architecture-boundary suite:**

```
./mvnw -o -Dtest='ModuleBoundaryTests,ProductionSalesBoundaryTests,SourceHygieneTests,PurchaseIngressBoundaryTests' test
```

Result: **33 tests, 32 pass, 1 failure** — `ModuleBoundaryTests.outside_does_not_depend_on_crm_internals` (14 violations, all from `service/DashboardService` depending on `crm.repository.LeadRepository`/`CustomerRepository` and `crm.entity.LeadStage`/`LeadStatus`). The other 32 tests (production–sales boundary, purchase ingress, source hygiene) pass. This is an in-progress CRM modularization violation in the working tree, not a security control failure; it is recorded as a limitation of the current tree.

**Command 4 — dependency audit:**

```
npm audit --json
```

Result: 6 vulnerabilities (5 high, 1 moderate), detailed in §11.3.

**Environment observation:** the H2 schema creation logged a non-fatal warning for `purchase_timeline` index `idx_ptl_created` (`Column "created_at" not found`) while the security suite still passed. The test schema is created with `ddl-auto=create-drop` and index-creation failures are logged rather than fatal. This does not affect the security results, but it means the H2 test schema is not a perfect mirror of MySQL for that table.

### 12.2 Present but **not executed** (and why)

| Test group | Files | Why not run |
|---|---|---|
| Live REST Assured suites | `api/BaseApiTest.java`, `api/sales/SalesApiTest.java`, `api/auth/AuthApiTest.java`, `api/documents/DocumentsApiTest.java`, `api/administration/AdministrationApiTest.java`, `api/users/UserApiTest.java`, `api/purchase/PurchaseApiTest.java`, `api/finance/FinanceApiTest.java`, `api/inventory/InventoryApiTest.java`, `api/marketing/MarketingApiTest.java`, `api/engineering/EngineeringApiTest.java`, `api/production/ProductionApiTest.java`, `api/sales/SalesDeleteAuthorityLiveApiTest.java`, `api/documents/DocumentsPaginationLiveApiTest.java` | Gated by `ERP_API_TEST_ENABLED=true` and a running backend; they report 0 tests without it. Running them would require starting the application and using a disposable database — outside this read-only audit. |
| Full backend suite (~693 tests baseline per CI) | all 120 test classes | Not run; the audit ran the security-relevant subset. No claim is made about the rest. |
| Full frontend suites | `tests/**` (contract), `src/**` (Vitest) | Only the security-relevant contract test was run. |
| Maven dependency CVE scan | — | No scanner configured/available offline. **Not verified.** |
| Application boot on MySQL | — | Requires credentials/shared DB; prohibited by scope. **Not verified.** |

---

## 13. Confirmed security findings and gaps

Severity reflects **demonstrated** impact and the preconditions stated. No Critical finding was confirmed. "Conditional" means the impact depends on a deployment factor (CSP, network position, availability of an identifier).

### SEC-H1 — Public self-registration grants internal ERP access

- **Severity:** High
- **Module/component:** Authentication / registration
- **Evidence:** `SecurityConfig.java:66-68` (`/auth/register` `permitAll`); `AuthController.java:39-43`; `AuthService.java:96-113` (always `UserRole.USER`, line 122); `RolePermissions.java:51-79` (`USER` holds SALES_VIEW/CREATE/EDIT, PURCHASE_VIEW/CREATE/EDIT, PRODUCTION_VIEW/CREATE/EDIT, CRM_VIEW/CREATE/EDIT, CPR_VIEW/CREATE/EDIT, MARKETING_VIEW/CREATE/EDIT/DELETE, DOCUMENT_VIEW/CREATE, NOTIFICATION_VIEW); `CustomUserDetailsService.java:29-40`.
- **Existing behavior:** anyone who can reach the API can create an account and immediately receive those authorities; registration is rate limited (5/hour/IP) but not verified, approved, or invite-only.
- **Impact:** unauthorized access to customer/lead PII, pricing, sales/purchase/production data and document metadata; ability to create/modify records; combined with SEC-H3, ability to consume disk. The "USER is low privilege" assumption does not hold in this permission model.
- **Preconditions:** network reachability of `/v1/auth/register` (public internet or any network path); no email verification exists.
- **Remediation:** make registration invite-only/admin-approved or remove it entirely (accounts created by ADMIN); if self-service is required, assign a role with no business authorities until approved, verify email, and notify admins.
- **Verification:** attempt registration from an unauthenticated client, then `GET /v1/leads` and `GET /v1/documents` with the issued token; both should be denied after the fix.

### SEC-H2 — Marketing expense approval lacks role and ownership checks (self-approval possible)

- **Severity:** High
- **Module/component:** Marketing / expense trips
- **Evidence:** `ExpenseTripController.java:21` (class `@PreAuthorize("isAuthenticated()")`), `:82-95` (`approve`, `reject`, `correction` mappings with no method annotation); `ExpenseTripService.java:156-166` (`approve` only checks `"Submitted"`), `:168-190` (`reject`, `requestCorrection` likewise); contrast with CRUD methods that call `assertCanAccess` (`:68-137,196-231,358-364`).
- **Existing behavior:** any authenticated user can approve, reject or request correction on any submitted trip by ID, including their own submission; `approvedBy` is set to the caller's name.
- **Impact:** financial-control bypass — self-approved reimbursements and tampering with other marketers' expense records; audit trail records the caller as approver, so the fraud is at least attributable, but not prevented.
- **Preconditions:** valid account (trivially obtained via SEC-H1) and a submitted trip ID (sequential; discoverable from list/summary endpoints).
- **Remediation:** require `@PreAuthorize("hasAnyAuthority('ADMIN','MARKETING_APPROVE')")`-style authority (a new permission is appropriate), enforce `approver != submitter`, and add ownership/role checks in `approve`/`reject`/`requestCorrection`; add negative tests.
- **Verification:** as a plain USER, submit a trip, then call approve on it — expect 403; as a MANAGER, approve another user's trip — expect 200; as the submitter with MANAGER role, expect 403.

### SEC-H3 — Document uploads bypass the 4 GB pool and files are never deleted

- **Severity:** High
- **Module/component:** Documents / all attachment modules / storage
- **Evidence:** `FileStorageService.java:62-72` (single `store` path, calls `assertCanUpload`); `AttachmentStorageService.java:59` (4 GB), `:73-82` (counts only eight attachment tables), `:147-158` (limit check); `DocumentRepositoryService.java:213-217` (document upload stores the file), `:676-695` (permanent delete purges DB rows only), `:1337` (generated PDFs); `SalesOrderService.java:988-995` (attachment row delete only, no file removal); `DocumentRepositoryService` generated/record documents also use the same root.
- **Existing behavior:** every stored document adds bytes to `uploads/` but the ledger/pool never sees them, so `assertCanUpload` always compares against attachment-only totals. Deletes never remove files. `DocumentReconciliationService` reports orphans but does not purge them.
- **Impact:** authenticated (and, via SEC-H1, anonymous-then-registered) disk exhaustion with 2 GB files; indefinite retention of deleted business documents (privacy/retention breach); backup growth.
- **Preconditions:** account with `DOCUMENT_CREATE` (all USERs) or any attachment-upload permission; valid multipart request.
- **Remediation:** include document/version/generated files in the storage accounting (or enforce a separate quota), delete physical files on permanent delete (with a tombstone/audit record), add a retention/orphan-purge job with dry-run reporting, and lower the per-file limit to the product requirement.
- **Verification:** upload documents until the claimed cap is exceeded and compare `GET /v1/files/storage` with `du -sh uploads/`; permanently delete a document and confirm its file is removed and the audit retains a deletion record.

### SEC-H4 — Vulnerable frontend dependencies (xlsx unfixable on npm; axios and others outdated)

- **Severity:** High
- **Module/component:** Frontend dependency tree
- **Evidence:** `package.json` (`axios ^1.19.0`, `xlsx ^0.18.5`), `package-lock.json` (axios 1.19.0, xlsx 0.18.5, nanoid 3.3.16, source-map-js 1.2.1, brace-expansion 5.0.9, dompurify 3.4.12); `npm audit` output (2026-10-17): 6 vulnerabilities, 5 high, 1 moderate.
- **Existing behavior:** spreadsheet parsing in the browser uses `xlsx@0.18.5`, which has prototype-pollution and ReDoS advisories and no npm-published fix; `axios` is below the fixed 1.20.0 line for multiple advisories.
- **Impact:** a crafted uploaded spreadsheet can hang the browser tab (ReDoS) or pollute prototypes; axios advisories are mostly Node-adapter-specific but include gadget/redirect issues. Client-side impact, not server compromise.
- **Preconditions:** user opens/parses a malicious spreadsheet; for axios, a malicious response/redirect or prototype pollution already present.
- **Remediation:** replace `xlsx` with the vendor's patched distribution (SheetJS ≥0.20.2 is not on npm) or a maintained parser; upgrade `axios` to ≥1.20.0 and the transitive packages (`npm audit fix` after review); add `npm audit --audit-level=high` to CI.
- **Verification:** rerun `npm audit` after upgrades and exercise spreadsheet import with a large/brace-heavy file.

### SEC-M1 — Stored HTML injection in Marketing map popups

- **Severity:** Medium (conditional on CSP at the hosting layer)
- **Evidence:** `src/components/Marketing/MarketingMapPage.jsx:1078-1085` (trip fields interpolated), `:1155`, `:1159` (stop `companyName`/`address`/`status` interpolated) into `dangerouslySetInnerHTML`; no escaping helper in the file (contrast `salesPrintUtils.js:7-13`).
- **Impact:** stored HTML/UI spoofing; with a missing/weakened CSP, script execution in the ERP origin and theft of `localStorage` tokens (SEC-M6).
- **Preconditions:** ability to create/edit travel plans or stops (marketing USER can) and a victim opening the map page.
- **Remediation:** render popups as React elements with text interpolation (preferred), or escape every value; never concatenate backend strings into HTML.
- **Verification:** create a trip/stop with `<img src=x onerror=alert(1)>` in the name and open `/marketing/map`; no alert/DOM injection should occur.

### SEC-M2 — Actuator exposure (Prometheus public; metrics/mappings to any JWT)

- **Severity:** Medium
- **Evidence:** `application.properties:354` (exposes `health,info,metrics,mappings,prometheus`); `SecurityConfig.java:72-77` (health/info/**prometheus** `permitAll`, other actuator authenticated); comment at `application.properties:349-352` still says Prometheus is deliberately not exposed.
- **Impact:** anonymous access to operational metrics (request rates, JVM/DB pool, error counts) and authenticated access for any USER to `metrics` and full route `mappings` — useful reconnaissance; metrics can reveal load/weak points.
- **Preconditions:** network access to `/v1/actuator/*`.
- **Remediation:** remove `prometheus` from the public matcher (or from the exposure list); require ADMIN for `metrics`/`mappings` or disable them outside a management port; correct the stale comment.
- **Verification:** anonymous `GET /v1/actuator/prometheus` should be 401/404; `GET /v1/actuator/mappings` as USER should be 403.

### SEC-M3 — Trusting client-supplied `X-Forwarded-For` (rate-limit bypass, audit IP spoofing)

- **Severity:** Medium
- **Evidence:** `AuthRateLimitFilter.java:114-121`; `AuditContext.java:65-77`; `RestAuthenticationEntryPoint.java:42-48`; `RestAccessDeniedHandler.java:40-46`. No `server.forward-headers-strategy`/trusted-proxy configuration exists in `application.properties`.
- **Impact:** rotate the header to defeat per-IP login/registration throttles (email+IP throttle can also be defeated by varying the claimed IP) and to write false client IPs into security logs, audit rows and `audit_logs.ip_address`.
- **Preconditions:** direct access to the app or a proxy that forwards rather than overwrites the header.
- **Remediation:** configure the proxy to overwrite `X-Forwarded-For`, and use Spring's `ForwardedHeaderFilter`/`server.forward-headers-strategy=native` with a trusted-proxy allow-list; otherwise use `request.getRemoteAddr()` only.
- **Verification:** send 50 login attempts with a different `X-Forwarded-For` each time; expect 429 after the configured threshold.

### SEC-M4 — Central audit log readable by every USER across all modules

- **Severity:** Medium
- **Evidence:** `AuditController.java:21-22` (`PRODUCTION_VIEW`); `RolePermissions.java:65-70` (USER has `PRODUCTION_VIEW`); no role/module restriction in `AuditService.getAuditLogs` (`AuditService.java:224-282`); snapshots in `AuditLog.java:88-102`.
- **Impact:** any authenticated account (including self-registered) can enumerate all modules' create/update/delete history with before/after values — commercial terms, customer data, internal notes; aids targeted fraud/social engineering.
- **Preconditions:** authenticated account.
- **Remediation:** restrict to ADMIN (or a dedicated AUDIT_VIEW permission), scope non-admins to modules they can access, and redact sensitive fields in snapshots.
- **Verification:** as USER, `GET /v1/audit` should be 403; as ADMIN it should work.

### SEC-M5 — Module attachment downloads lack object-level authorization

- **Severity:** Medium (conditional on identifier knowledge)
- **Evidence:** `FileController.java:76-105` (authenticated + UUID-name only), `:112-129` (`enforceDocumentVisibility` checks only `document_repository`/versions). No checks against lead/customer/follow-up/CPR/marketing/q-form/expense attachment tables. Attachment URLs are returned to clients (`SalesOrderService.java:975-985` stores `/v1/files/{name}`).
- **Impact:** any authenticated user who obtains a stored name (shared link, logs, referrer, browser history, support screenshots) can download another team's/owner's attachment, bypassing the owner checks applied to marketing visits/expense trips/Q-forms.
- **Preconditions:** knowledge of the 32-hex stored filename; no enumeration is possible through the API.
- **Remediation:** resolve ownership for every attachment type before serving (a central attachment-owner resolver or per-module download endpoints), or store attachments under per-record authorized endpoints; keep `/files/{name}` only for files with a proven ownership lookup.
- **Verification:** create two users; upload an attachment as user A in an owned marketing record; as user B request `/v1/files/{name}` — expect 403.

### SEC-M6 — Access and refresh tokens in `localStorage`

- **Severity:** Medium (accepted design risk)
- **Evidence:** `tokenStorage.js:15-58` (both tokens + user in `localStorage`), `axiosInstance.js:44-50` (Bearer header). Documented in `SECURITY_AUDIT.md` and in the file header.
- **Impact:** any XSS (see SEC-M1) can exfiltrate both tokens; the refresh token is long-lived (7 days), enabling persistent access even after the access token expires.
- **Preconditions:** an XSS or malicious same-origin script.
- **Remediation:** move refresh tokens to `HttpOnly; Secure; SameSite=Strict` cookies, keep a short-lived access token in memory, re-enable CSRF for the cookie path (see `SECURITY_AUDIT.md` migration plan); at minimum, enforce a strong CSP at the hosting layer and reduce refresh lifetime.
- **Verification:** after migration, `document.cookie` must not expose tokens; an injected script cannot read them.

### SEC-M7 — Database connection TLS disabled by default

- **Severity:** Medium (deployment-dependent)
- **Evidence:** `application.properties:27` (`useSSL=false&allowPublicKeyRetrieval=true`).
- **Impact:** credentials and business data travel unencrypted between app and MySQL; exposure to network sniffing/MITM if the DB is not on the same trusted host.
- **Preconditions:** non-loopback DB traffic on an untrusted network.
- **Remediation:** default to `sslMode=REQUIRED`/`VERIFY_CA` with a configured truststore, and document the local-only exception in `.env.example`.
- **Verification:** inspect the effective JDBC URL and MySQL `SHOW STATUS LIKE 'Ssl_cipher'` in the deployed environment.

### SEC-M8 — Seeder creates an ADMIN with a known password outside the prod profile

- **Severity:** Medium (conditional on profile)
- **Evidence:** `DataSeeder.java:31-42` (`@Profile("!prod & !production")`, `DEFAULT_PASSWORD = "<redacted>"`, users seeded when `users` is empty, `:142-170`).
- **Impact:** a deployment started without an explicit prod profile on an empty database gets a known ADMIN credential; if the DB already has users, seeding is skipped (reducing but not removing the risk).
- **Preconditions:** non-prod profile active in a reachable environment, empty user table.
- **Remediation:** remove default credentials entirely; generate a random password and print it once, or require an env-provided bootstrap admin; make the seeder opt-in (`@Profile("demo")`) rather than opt-out.
- **Verification:** boot with the default profile against a fresh DB and confirm no known-password account exists.

### SEC-M9 — Partial request-validation coverage

- **Severity:** Medium
- **Evidence:** 334 `@RequestBody` vs 184 `@Valid`; 31 of 220 DTO files contain validation annotations; `QuotationRequest.java` and `TravelPlanRequest.java` have none; controllers pass bodies to services (`@RequestBody(required=false)` in CPR actions).
- **Impact:** malformed/oversized values reach persistence/business logic; inconsistent 400 vs 500 behavior; potential data-integrity issues. No injection bypass was demonstrated.
- **Preconditions:** crafted API requests by an authenticated user (or anonymous for auth endpoints).
- **Remediation:** add constraints to all create/update DTOs, `@Valid` on every body, and `@Validated` on controllers; add a contract test that fails when a `@RequestBody` lacks validation.
- **Verification:** send an empty/oversized quotation payload and expect 400 with field messages, not 500.

### SEC-M10 — Historic JWT secret and DB credential remain in Git history

- **Severity:** Medium
- **Evidence:** `git log -S "app.jwt.secret=" -- erp-backend/src/main/resources/application.properties` → initial commit `d7c31fb`; current file has no default (`application.properties:42`). The prior `SECURITY_AUDIT.md` §5 records the same exposure and required rotation.
- **Impact:** anyone with repository history can recover the old signing key; if any deployment still uses it, tokens can be forged. The old DB password likewise remains exposed.
- **Preconditions:** access to Git history and a deployment still using the old values.
- **Remediation:** confirm rotation of the JWT key and DB password in every environment; consider history rewrite only with explicit operational approval; never reuse the values.
- **Verification:** decode a token issued by the deployed app and confirm it fails verification with the historical key; check `SHOW GRANTS`/password age for the DB user.

### SEC-M11 — No dependency scanning in CI; backend CVE status unverified

- **Severity:** Medium (process)
- **Evidence:** `.github/workflows/ci.yml` has no audit/scan step; `pom.xml` has no OWASP/Snyk plugin; `npm audit` is not run in CI.
- **Impact:** vulnerable dependencies can be merged unnoticed (demonstrated by the 6 current npm findings).
- **Remediation:** add `npm audit --audit-level=high` and OWASP Dependency-Check (with an NVD cache) to CI; fail high/critical; add Dependabot/Renovate.
- **Verification:** a deliberately vulnerable dependency should fail the pipeline.

### SEC-M12 — No content-type (MIME) validation or malware scanning on uploads

- **Severity:** Medium
- **Evidence:** `FileStorageService.java:78-83` validates only the extension; no magic-byte/content inspection, no AV/scan service, `zip` and Office formats allowed (`application.properties:100`).
- **Impact:** malicious files can be stored and distributed internally; office/PDF parsers process untrusted content (bounded by size caps and processing-job limits); no detection of malware.
- **Remediation:** validate magic bytes against the allow-listed types, reject mismatches, scan with an AV/CDR service (or ClamAV sidecar), and quarantine before making files available.
- **Verification:** upload a PE/HTML payload renamed `.pdf`; it should be rejected or quarantined, not stored as a valid document.

### SEC-L1 — Logout does not revoke the access token; STOMP ignores disabled state

- **Severity:** Low
- **Evidence:** `RefreshTokenService.revoke` only revokes the refresh token (`:146-158`); the access JWT remains valid until `exp` (≤30 min). `StompJwtInterceptor.java:91-96` validates signature/subject but does not check `enabled`/`locked`.
- **Impact:** a stolen/copied access token still works briefly after logout; a disabled user with an unexpired token can still open a WebSocket and receive notifications.
- **Remediation:** check account state in the STOMP interceptor; consider a short-lived token denylist or reduce access lifetime; document the residual window.
- **Verification:** logout, then call a protected endpoint with the old access token — currently 200 until expiry.

### SEC-L2 — Document permanent delete removes the document's audit trail

- **Severity:** Low
- **Evidence:** `DocumentRepositoryService.purgeDocument:690-695` calls `auditService.deleteByDocument(id)`; `DocumentAuditService.deleteByDocument:101-103`.
- **Impact:** an ADMIN can erase the document-level history of a record while the central `audit_logs` entry for the deletion remains. Weakens forensic completeness.
- **Remediation:** retain document audit rows (soft-delete the row, keep audit) or write an immutable tombstone to the central audit log including the purged audit summary.

### SEC-L3 — Physical files are not deleted on attachment/document deletion

- **Severity:** Low (distinct from SEC-H3's capacity impact: retention/privacy)
- **Evidence:** `SalesOrderService.deleteAttachment:988-995`; `DocumentRepositoryService.purgeDocument:690-695`.
- **Impact:** deleted files remain on disk indefinitely; data-retention and erasure obligations are not met.
- **Remediation:** delete the blob after a successful DB transaction (or mark for asynchronous garbage collection with an audited grace period).

### SEC-L4 — WebSocket handshake public with wildcard origins

- **Severity:** Low
- **Evidence:** `SecurityConfig.java:81` (`/ws/**` permitAll); `WebSocketConfig.java:50-53` (`setAllowedOriginPatterns("*")`); `StompJwtInterceptor` requires JWT on CONNECT.
- **Impact:** unauthenticated cross-origin connection attempts and connection floods; no cookie-based CSWSH because auth is a STOMP header.
- **Remediation:** restrict allowed origins to the configured frontend origins and reject CONNECT for disabled accounts.

### SEC-L5 — Minimal password policy, no reset/MFA/lockout

- **Severity:** Low
- **Evidence:** `RegisterRequest.java:12` (min 8); no reset/MFA endpoints (grep); `locked` state exists but nothing sets it automatically (`setLocked` only in tests).
- **Impact:** weak user passwords; no self-service recovery; no second factor for ADMIN accounts.
- **Remediation:** password policy (length + breach list), admin-driven reset with single-use hashed tokens, MFA for ADMIN, automatic lock after repeated failures (in addition to throttling).

### SEC-L6 — No role-based frontend routes; all modules visible to all users

- **Severity:** Low
- **Evidence:** `App.jsx:223` single `ProtectedRoute`; no role checks in route files; `AppLayout.jsx` does not filter navigation.
- **Impact:** users see modules/actions they cannot use (403); confusing and reveals module structure. Backend enforcement prevents actual access.
- **Remediation:** add permission-aware route/menu guards mirroring `RolePermissions`, while keeping the backend authoritative.

### SEC-L7 — Content-Disposition filename built from unsanitized document name

- **Severity:** Low
- **Evidence:** `DocumentRepositoryController.java:263-265` (`filename="` + `file.documentName()`); `DocumentRepositoryService.java:234` stores `file.getOriginalFilename()` unmodified (only the storage name is sanitized). Tomcat rejects CR/LF in header values, so header splitting is not demonstrated.
- **Impact:** quote/filename spoofing in downloads; potential response-splitting attempts blocked by the container.
- **Remediation:** RFC 6266/5987 encode the filename and strip quotes/control characters.

### SEC-L8 — Client-supplied `uploadedBy` display attribution

- **Severity:** Low
- **Evidence:** `DocumentRepositoryController.java:99-112`; `DocumentRepositoryService.java:213-242` (`entry.setUploadedBy(uploadedBy != null ? uploadedBy : currentUserName())`). `uploadedById` is server-derived.
- **Impact:** misleading uploader display name in repository/audit UI.
- **Remediation:** always derive the display name from `AuditContext`.

### SEC-L9 — Business error messages echo identifiers

- **Severity:** Low
- **Evidence:** `GlobalExceptionHandler.java:41-45` (`IllegalArgumentException` message returned), `:29-38` (not-found message includes the requested value).
- **Impact:** minor information disclosure (IDs, stored names) to authenticated callers; no stack traces/SQL.
- **Remediation:** return generic messages for file paths/IDs and log detail server-side.

### SEC-L10 — CSP/HSTS not enforced at the SPA layer; HSTS off by default

- **Severity:** Low
- **Evidence:** `SecurityConfig.java:90-110` sets headers on API responses; `index.html` has no CSP meta; `app.security.hsts=${ERP_SECURITY_HSTS:false}` (`application.properties:151`).
- **Impact:** protection depends entirely on the reverse proxy/hosting configuration, which is not in the repository; a missing proxy CSP leaves SEC-M1 exploitable.
- **Remediation:** configure CSP/HSTS at the proxy or via a meta tag as defense in depth; document the requirement in the deployment guide.

### SEC-L11 — Fixed test JWT secret committed

- **Severity:** Low (test-only)
- **Evidence:** `src/test/resources/application.properties:25`; file comment states it is test-only and never used at runtime.
- **Impact:** none at runtime; a developer running a test profile with a production DB could issue test-signed tokens.
- **Remediation:** keep test config strictly test-scope; add a guard that refuses the test secret when a non-test profile is active.

### SEC-L12 — Commented-out duplicate SecurityConfig block

- **Severity:** Low (maintainability/defense in depth)
- **Evidence:** `SecurityConfig.java:200-339` contains a full commented copy of the class.
- **Impact:** review/merge errors can silently diverge from the active chain; increases the chance of a future misconfiguration.
- **Remediation:** delete the dead block; rely on version control.

### SEC-L13 — Rate limiting is per-instance only

- **Severity:** Low
- **Evidence:** `RateLimiter.java:14-22` (in-memory map), `:96-104` (sweep).
- **Impact:** horizontal scaling multiplies the effective limit; restart clears counters.
- **Remediation:** shared store (Redis) or edge limiter; document the single-instance assumption.

### Informational

- **CORS allows `X-Actor-*` headers that no backend code reads** (`SecurityConfig.java:162-166`; grep of backend for `X-Actor` finds only this line). Harmless now; remove to reduce surface and avoid future accidental trust.
- **Class-level vs method-level `@PreAuthorize`:** method annotations replace (do not combine with) class annotations. E.g., `DocumentRepositoryController.create` requires `DOCUMENT_CREATE`, not `DOCUMENT_VIEW`+`DOCUMENT_CREATE`. This is a design nuance to keep in mind when adding gates.
- **Idempotency:** no idempotency keys on conversion/bulk endpoints; duplicate submissions can duplicate business records.
- **H2 schema warning:** `idx_ptl_created` on `purchase_timeline` fails under H2 (`created_at` not found), non-fatally. Test-schema fidelity issue only.
- **Architecture test failure:** `ModuleBoundaryTests.outside_does_not_depend_on_crm_internals` fails with 14 violations from `DashboardService` → CRM repositories/entities. Pre-existing in the working tree; not a security control failure but means the architecture suite is red.
- **Prior report:** `SECURITY_AUDIT.md` (2026-08-18) documents earlier fixes. Its claims about no hardcoded secrets, authenticated `/files/**`, role-safe registration, BCrypt, refresh tokens and rate limiting were re-checked against current code and remain accurate. Its "59 security tests" count is superseded by the 95 executed here.

---

## 14. Severity-ranked remediation roadmap

### P0 — before any public exposure

| # | Action | Finding |
|---|---|---|
| 1 | Close or gate public registration; give unapproved accounts no business authorities | SEC-H1 |
| 2 | Add role + ownership checks to expense approve/reject/correction; forbid self-approval | SEC-H2 |
| 3 | Include documents/generated PDFs in storage accounting; delete blobs on permanent delete; add orphan purge; lower per-file cap | SEC-H3, SEC-L3 |
| 4 | Upgrade/replace `xlsx`; upgrade `axios` ≥1.20.0; `npm audit fix` for transitive; add CI audit gate | SEC-H4, SEC-M11 |

### P1 — next hardening sprint

| # | Action | Finding |
|---|---|---|
| 5 | Escape or React-render map popups; enforce SPA CSP at the proxy | SEC-M1, SEC-L10 |
| 6 | Restrict Prometheus/metrics/mappings (ADMIN or management port) | SEC-M2 |
| 7 | Trust `X-Forwarded-For` only from a configured proxy | SEC-M3 |
| 8 | Restrict `/audit` to ADMIN/audit permission; scope/redact snapshots | SEC-M4 |
| 9 | Add attachment ownership resolution for `/files/{name}` | SEC-M5 |
| 10 | Move refresh tokens to HttpOnly cookies (or accept and document with strict CSP) | SEC-M6 |
| 11 | Enable DB TLS by default; document local exception | SEC-M7 |
| 12 | Make demo seeding opt-in and remove the known ADMIN password | SEC-M8 |
| 13 | Complete DTO validation coverage; add a guard test | SEC-M9 |
| 14 | Confirm rotation of the historical JWT key/DB password in all environments | SEC-M10 |
| 15 | Validate file magic bytes; add AV/CDR scanning | SEC-M12 |

### P2 — defense in depth / hygiene

| # | Action | Finding |
|---|---|---|
| 16 | Revoke or shorten access tokens on logout; check account state in STOMP | SEC-L1 |
| 17 | Retain document audit on permanent delete (tombstone) | SEC-L2 |
| 18 | Restrict WS origins; rate-limit WS handshakes | SEC-L4 |
| 19 | Password policy, admin reset flow, MFA for ADMIN, auto-lock | SEC-L5 |
| 20 | Permission-aware frontend routes/menu | SEC-L6 |
| 21 | RFC 5987 filename encoding | SEC-L7 |
| 22 | Derive `uploadedBy` server-side | SEC-L8 |
| 23 | Generic messages for identifier-bearing errors | SEC-L9 |
| 24 | Remove test secret risk in non-test profiles | SEC-L11 |
| 25 | Delete commented-out SecurityConfig block | SEC-L12 |
| 26 | Shared rate limiter for multi-instance | SEC-L13 |
| 27 | Remove unused `X-Actor-*` CORS headers; add idempotency keys | Informational |

### P3 — verification and operations

- Add `npm audit` and OWASP Dependency-Check to CI; schedule monthly review.
- Enable the environment-gated live API suites against a disposable DB in CI.
- Fix the `ModuleBoundaryTests` CRM violation and the H2 `purchase_timeline` index warning.
- Configure proxy TLS, HSTS, CSP, log shipping and alerts for the `SECURITY` stream.
- Define audit-log retention and DB-level immutability (restricted grants/triggers).

---

## 15. Items requiring manual verification

These cannot be established from the repository alone:

1. **Deployment profile and seeding:** is `SPRING_PROFILES_ACTIVE=prod` set in every environment? Does any environment still contain an account still using the seeded default password?
2. **Secret rotation:** has the historical JWT key and DB password actually been rotated in deployed environments? Is `erp_app` (not `root`) in use, with least-privilege grants?
3. **TLS chain:** is the app reachable only through an HTTPS proxy? Is `ERP_SECURITY_HSTS=true` set? Does the proxy overwrite `X-Forwarded-For`?
4. **SPA headers:** does the hosting layer send CSP/HSTS/Referrer-Policy for the HTML shell (the backend headers do not cover it)?
5. **MySQL schema:** does `ddl-auto=validate` pass against the real schema? Are all documented migrations applied? (Boot was not attempted.)
6. **Database encryption/backups:** are backups encrypted and access-controlled? Is storage encrypted at rest?
7. **Google Maps key:** is `VITE_GOOGLE_MAPS_API_KEY` restricted by HTTP referrer/API?
8. **Registered accounts:** what roles exist in production, and are there unused/dormant accounts? (No DB access was performed.)
9. **Malware handling:** is there an external AV/CDR gateway for uploads?
10. **Live 401/403 and deletion guards:** run the environment-gated REST Assured suites (`ERP_API_TEST_ENABLED=true`) against a disposable environment, including `SalesDeleteAuthorityLiveApiTest` and `DocumentsPaginationLiveApiTest`.
11. **Audit retention/immutability:** are DB grants restricted so the application user cannot delete `audit_logs`? Is log storage append-only?
12. **Backend dependency CVEs:** run OWASP Dependency-Check/Snyk against `pom.xml`; no local scanner result exists.

---

## 16. Limitations and unverified areas

- **No application runtime.** No Spring Boot process, MySQL connection, reverse proxy, or browser session was started. Headers, actuator behavior, MySQL validation and TLS were reviewed from configuration/source only. "Runtime verification pending" is used accordingly.
- **No writes.** No uploads, deletes, seeders, migrations, or database writes were performed. File-storage behavior is inferred from code paths; the tests that were run use isolated H2 and `target/test-uploads`.
- **Test coverage is partial.** The 95 tests executed cover authentication, JWT, refresh tokens, authorization, CORS, rate limits, files, document APIs and validation. The full ~693-test backend suite and the full frontend suites were not run. One architecture test fails in the current tree.
- **Endpoint matrix is representative, not exhaustive.** All 77 controllers and their class-level gates/permission sets were inventoried, and 691 method annotations counted; individual method→authority mappings for all 1,022 endpoints were not transcribed. Where a method annotation could weaken a class gate, it was inspected for the sensitive cases (documents, users, audit, expenses, files).
- **No SAST/DAST.** No static analyzer, fuzzer, or dynamic scanner was run. SQL injection conclusions rest on query construction review plus the executed negative tests, not on exhaustive fuzzing.
- **No backend CVE scan.** Maven dependency vulnerabilities are **Not verified**; the frontend audit is verified as of 2026-10-17 and is registry-dependent.
- **Git history was not exhaustively scanned.** A targeted `git log -S` confirmed the historical secret line; no full-history entropy/secret scan was performed, and no secret values are reproduced in this report.
- **Local `.env` files were not read** (by design). Their presence is recorded; their values are unknown to this audit.
- **Architecture failure** (`ModuleBoundaryTests`) is reported as found; it was not repaired because this task is read-only.
- **H2 test schema** is not identical to MySQL (e.g., the `purchase_timeline` index warning), so test-level schema conclusions do not fully transfer.

---

## 17. File-by-file evidence index

### Backend — security core

| File | Relevant lines | What it establishes |
|---|---|---|
| `erp-backend/src/main/java/com/vishatech/erp/config/SecurityConfig.java` | 26-128, 137-171, 174-193, 200-340 | Filter chain, public paths, CSRF off, CORS allow-list, headers, BCrypt, method security; dead commented duplicate |
| `.../security/JwtService.java` | 33-82 | HS256 key validation, minimal claims, signature/expiry verification |
| `.../security/JwtAuthenticationFilter.java` | 59-140 | Bearer parsing, account-state enforcement, categorized rejection logging, never logs token |
| `.../security/CustomUserDetailsService.java` | 24-47 | Role + permission authorities derived server-side |
| `.../security/RolePermissions.java` | 17-71 | Role→permission map (source of the USER privilege breadth) |
| `.../security/Permission.java` | 1-72 | 36 permissions |
| `.../entity/UserRole.java` | 1-8 | ADMIN/MANAGER/USER |
| `.../service/AuthService.java` | 64-127 | Login throttle, failure handling, registration always USER |
| `.../service/RefreshTokenService.java` | 70-207 | Issue/rotate/reuse-detect/revoke, SHA-256 hash, cleanup |
| `.../entity/RefreshToken.java` | 1-120 | Hash-only storage, family, revocation fields |
| `.../controller/AuthController.java` | 34-65 | Login/register/refresh/logout/me |
| `.../dto/LoginRequest.java`, `dto/RegisterRequest.java` | all | Validation; no role field; min-8 password |
| `.../security/AuthRateLimitFilter.java` | 63-123 | Endpoint scoping, IP extraction, 429 response |
| `.../security/RateLimiter.java` | 24-104 | In-memory fixed window, per-instance caveat |
| `.../security/RestAuthenticationEntryPoint.java` | 30-48 | JSON 401 |
| `.../security/RestAccessDeniedHandler.java` | 28-48 | JSON 403 |
| `.../security/SecurityAuditLogger.java` | 22-150 | Masked security events, no token logging |
| `.../exception/GlobalExceptionHandler.java` | 29-198 | Status mapping, generic 500, no stack traces |
| `.../util/AuditContext.java` | 24-77 | Actor from SecurityContext; XFF trust |
| `.../config/StompJwtInterceptor.java` | 75-117 | STOMP JWT auth; no account-state check |
| `.../config/WebSocketConfig.java` | 50-55 | Wildcard WS origins |
| `.../config/ApiRequestLoggingFilter.java` | 88-128 | One-line request log, query strings stripped |

### Backend — files, documents, audit, data

| File | Relevant lines | What it establishes |
|---|---|---|
| `.../service/FileStorageService.java` | 62-101, 130-147, 300-337 | Empty/size/ext validation, UUID names, traversal containment, safe stored-name check |
| `.../controller/FileController.java` | 43-129, 135-146 | Authenticated serving, inline allow-list, nosniff/no-store, document visibility enforcement, storage stats |
| `.../service/AttachmentStorageService.java` | 59, 70-79, 147-158 | 4 GB pool, counted tables, upload gate |
| `.../service/AttachmentStorageLedgerListener.java` | all | Ledger deltas on attachment insert/delete |
| `.../service/DocumentRepositoryService.java` | 213-242, 676-695, 918-951, 1462-1485 | Upload, permanent delete/purge, version upload, permission-checked file load |
| `.../service/DocumentPermissionService.java` | 48-144 | Visibility, owner/admin delete, permanent delete ADMIN |
| `.../service/DocumentModuleScope.java` | 1-131 | Module scoping for document lists |
| `.../controller/DocumentRepositoryController.java` | 40-77, 117-135, 168-178, 253-274 | Gate model, upload params, delete endpoints, filename header |
| `.../service/DocumentAuditService.java` | 101-103 | Document audit deletion |
| `.../controller/production/AuditController.java` | 21-138 | Read-only audit API, `PRODUCTION_VIEW` gate |
| `.../service/production/AuditService.java` | 100-282 | Audit writes/reads, pagination cap, sort whitelist |
| `.../entity/production/AuditLog.java` | 30-107 | Immutable-by-convention audit record, snapshots |
| `.../config/DataSeeder.java` | 31-42, 150-170 | Demo profile guard and known ADMIN password |
| `.../entity/User.java` | 34-53 | Account states, BCrypt hash column |
| `.../controller/UserController.java` | 27-87 | ADMIN-only role change, self-change blocked |
| `.../controller/LocationController.java` | 283-292 | Manual ADMIN check for master-data mutations |
| `.../service/ExpenseTripService.java` | 68-231, 355-364 | Owner checks on CRUD; missing on approvals |
| `.../controller/ExpenseTripController.java` | 21, 82-95 | `isAuthenticated()`-only approval endpoints |
| `.../service/MarketingVisitService.java` | 955-1020 | Owner/role checks |
| `.../service/TravelPlanService.java`, `TravelScheduleService.java` | 244-260, 753-770, 439-453 | Owner/role checks and approvals |
| `.../service/ProcessingJobService.java` | 398 | Job owner check |
| `.../repository/AttachmentStorageUsageRepository.java` | 46-63 | Parameterized native queries |
| `.../service/SalesOrderService.java` | 400-412, 975-995 | Soft delete, attachment URL, row-only delete |
| `.../controller/SalesOrderController.java` | 177-209, 349-355 | `SALES_DELETE` gates |
| `.../controller/SalesContractController.java` | 127-131 | `SALES_APPROVE` gate |
| `.../config/ErpApplication.java` / `ErpApplication.java` | 1 | Boot entry |
| `erp-backend/src/main/resources/application.properties` | 9, 24-45, 73-100, 144, 151, 354 | Env config, no secret defaults, upload limits/types, CORS, HSTS, actuator exposure |
| `erp-backend/src/main/resources/logback-spring.xml` | 60-104 | SECURITY logger routing, prod JSON |
| `erp-backend/src/test/resources/application.properties` | 1-65 | Isolated H2, test-only JWT key |
| `erp-backend/pom.xml` | 9-24, 70-163 | Boot 3.4.13, Java 21, JJWT, POI 5.4.1, no audit plugin |
| `erp-backend/.env.example` | all | Placeholders, no defaults, rotation instructions |

### Frontend

| File | Relevant lines | What it establishes |
|---|---|---|
| `src/services/tokenStorage.js` | 1-12, 15-58, 87-105 | localStorage tokens, auth-state event, session semantics |
| `src/api/axiosInstance.js` | 20-32, 44-140, 148-200 | Bearer header, proactive/silent refresh, 401 replay, 403 handling |
| `src/components/Auth/ProtectedRoute.jsx` | 8-14 | Authentication-only route guard |
| `src/App.jsx` | 210-361 | Public vs protected route tree |
| `src/components/Common/CurrentUserContext.jsx` | 26-40 | Role-derived UI capabilities |
| `src/utils/salesPermissions.js` | all | Frontend mirror of SALES_DELETE |
| `src/components/Marketing/MarketingMapPage.jsx` | 1078-1085, 1155, 1159 | Unescaped HTML injection |
| `src/pages/sales/QuotationPrint.jsx` | 28-44, 84-86 | Print HTML + `window.open` document.write |
| `src/utils/salesPrintUtils.js` | 7-13 (+31 uses) | Escaping in print builder |
| `src/components/Layout/AppLayout.jsx` | 299, 479-495 | No role-filtered navigation |
| `index.html` | all | Fonts only; no CSP meta |
| `vitest.config.js`, `package.json`, `package-lock.json` | all | Test setup and dependency versions |
| `tests/sales-delete-permissions.test.js` | all | Executed permission contract test |

### Tests

| File | Purpose | Executed |
|---|---|---|
| `erp-backend/src/test/java/com/vishatech/erp/security/AuthSecurityTests.java` | Registration role safety, duplicate, weak password, login | Yes (8) |
| `.../security/JwtSecurityTests.java` | Missing/malformed/tampered/wrong-key/disabled/locked tokens | Yes (9) |
| `.../security/ExpiredJwtSecurityTests.java` | Expired token | Yes (1) |
| `.../security/RefreshTokenSecurityTests.java`, `RefreshTokenCleanupTests.java` | Rotation, reuse, logout, cleanup | Yes (6+3) |
| `.../security/AuthorizationSecurityTests.java` | Role change/settings ADMIN gates | Yes (7) |
| `.../security/CorsSecurityTests.java` | Origin allow-list | Yes (3) |
| `.../security/RateLimitTests.java` | Login/registration 429 | Yes (2) |
| `.../security/FileSecurityTests.java`, `FileStorageSecurityTests.java` | File auth/traversal/upload validation | Yes (9+7) |
| `.../security/InputValidationSecurityTests.java` | SQLi, dates, pagination, 404, 401 | Yes (7) |
| `.../security/DocumentsApiTest.java`, `DocumentReferenceApiTest.java` | Document auth/lifecycle/authority/scope | Yes (12+5) |
| `.../security/SalesDocumentAuthorityContractTests.java` | Delete authority contract | Yes (4) |
| `.../ActuatorSecurityTests.java` | Public health, protected endpoint, metrics | Yes (5) |
| `.../security/CrmApiTest.java` | CRM API under security | Yes (7) |
| `.../architecture/ModuleBoundaryTests.java` | Module dependency rules | Yes — **1 failure** |
| `.../architecture/ProductionSalesBoundaryTests.java`, `PurchaseIngressBoundaryTests.java`, `SourceHygieneTests.java` | Boundaries/source hygiene | Yes (7+3+1, all pass) |
| `.../api/**` live suites (incl. `SalesDeleteAuthorityLiveApiTest`, `DocumentsPaginationLiveApiTest`) | Live REST Assured 401/403/delete guards | No — env-gated |
| `erp-react/tests/sales-delete-permissions.test.js` | Frontend/backend delete permission mirror | Yes (28) |
| `erp-react/src/**/*.test.js(x)`, `tests/**` | Frontend unit/contract suites | No (except above) |

---

## 18. Final security assessment

**Strengths (verified in code and, where stated, by executed tests):**

- Authentication is modern and correctly implemented: BCrypt, strong env-only HMAC key, short-lived JWTs, rotating hashed refresh tokens with reuse detection, account-state enforcement on every HTTP request, and no token/password logging.
- Authorization is pervasive and server-side: 691 method annotations over 1,022 endpoints, a coherent role→permission model, ADMIN-only role changes and settings, `SALES_DELETE`/`SALES_APPROVE`, and `DOCUMENT_*` gates. The frontend mirrors permissions for UX but is not the enforcement point.
- File handling is defensive: authenticated, UUID-only names, path containment, extension allow-list, `nosniff`, `no-store`, strict inline types, document visibility, and audit entries for accesses.
- The API resists common injection/IDOR patterns in the inspected paths: parameterized queries, whitelisted sort fields, DTO binding, company-wide data by design, owner checks where ownership exists.
- Error handling and security logging are disciplined: generic 500s, JSON 401/403, masked security events, query strings stripped from logs.
- Test culture exists: the targeted security suite runs green on isolated H2 (95/95), and frontend permission contracts are enforced (28/28).

**Weaknesses that define the current posture:**

- The permission model makes `USER` an internal power user, while registration is public. That single combination (SEC-H1) turns "anyone on the network" into "an ERP insider" and amplifies every other gap.
- Secondary workflows are less rigorous than the core Sales/CRM paths: expense approvals have no role check (SEC-H2) and attachments have no object-level check (SEC-M5).
- Storage controls are incomplete: the 4 GB pool does not cover documents, and deletion never removes blobs (SEC-H3).
- Operational secrecy and exposure need work: DB TLS off by default, Prometheus public, audit log over-exposed, XFF trusted, historical secret in Git (SEC-M7/M2/M4/M3/M10).
- The dependency tree is not clean and the backend is unscanned (SEC-H4/M11).

**Bottom line:** this is not a "secure by checklist" system, but it is not a naive one either — the authentication and authorization core is genuinely implemented and tested. It is **not safe for direct public exposure** until P0 items (registration, expense approvals, storage, vulnerable dependencies) are closed. After P0 and the high-value P1 items, the residual risk is the accepted localStorage token model, operational TLS/proxy hardening, and the usual dependency/maintenance discipline. No claim of complete security is made; the areas listed in §15 and §16 remain unverified.
