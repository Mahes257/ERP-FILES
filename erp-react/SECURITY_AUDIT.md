# ERP Security Audit & Hardening Report

**Project:** VishakTech ERP (`erp-react/erp-backend` — Spring Boot 3.4, JWT auth, MySQL; `erp-react/src` — React + Axios)

**Date:** 2026-08-18

**Scope:** Security hardening only. No new business features, no architecture rewrites, no message brokers, no database migration, no auth-mechanism replacement.

---

## 1. Methodology

Every finding below was verified against the actual source code (no assumptions):

- `config/SecurityConfig.java`, `security/JwtService.java`, `security/JwtAuthenticationFilter.java`, `security/CustomUserDetailsService.java`
- `service/AuthService.java`, `controller/AuthController.java`, `controller/UserController.java`, `controller/FileController.java`, `controller/SettingsController.java`
- `entity/User.java`, `entity/UserRole.java`, `dto/RegisterRequest.java`, `dto/AuthResponse.java`
- `service/FileStorageService.java`, `service/AttachmentStorageService.java`, all attachment-producing services
- `exception/GlobalExceptionHandler.java`
- `src/main/resources/application.properties`, `erp-backend/.env.example`
- Frontend: `src/api/axiosInstance.js`, `src/services/authService.js`, `src/pages/SignIn.jsx`, `src/components/Auth/ProtectedRoute.jsx`, all attachment components, `src/utils/attachmentStorage.js`
- `pom.xml` (dependency versions cross-checked against public CVE data)

---

## 2. Vulnerabilities found (pre-fix) and their severity

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | **Public registration role escalation** — `POST /auth/register` accepted `role` from the request body; any anonymous caller could register as `ADMIN`. | **CRITICAL** | ✅ Fixed |
| 2 | **Committed JWT secret & DB credentials** — hardcoded fallbacks in `application.properties` (`app.jwt.secret=…`, `root` / `<redacted-local-mysql-password>`). | **CRITICAL** | ✅ Fixed (no defaults; must rotate) |
| 3 | **MySQL `root` used by the application** + `createDatabaseIfNotExist=true`. | **HIGH** | ✅ Fixed (documented `erp_app` user; URL cleaned) |
| 4 | **`/files/**` public** — any stored file downloadable without authentication; `/files/storage` public too. | **HIGH** | ✅ Fixed |
| 5 | **CORS `allowedOriginPatterns("*")` + credentials.** | **HIGH** | ✅ Fixed |
| 6 | **Generic 500 leaked `ex.getMessage()`** (class names / SQL / paths). | **MEDIUM** | ✅ Fixed |
| 7 | **No rate limiting** on login/register — unbounded brute force. | **HIGH** | ✅ Fixed |
| 8 | **24 h access token, no revocation**; disabled users' tokens kept working until expiry. | **HIGH** | ✅ Fixed (30 min + refresh tokens; filter rejects disabled/locked) |
| 9 | **JWT filter swallowed all exceptions silently** — no security logging. | **MEDIUM** | ✅ Fixed |
| 10 | **No account-state support** beyond `enabled`. | **MEDIUM** | ✅ Fixed (`locked`, `accountExpired`, `credentialsExpired`) |
| 11 | **Uploads: no extension allowlist, 2 GB per-file limit** (in-memory parsing DoS risk). | **MEDIUM** | ✅ Fixed (allowlist, 200 MB default) |
| 12 | **Files served `inline` with probed content type** — stored-XSS vector (HTML/SVG). | **MEDIUM** | ✅ Fixed (`nosniff`, disposition policy) |
| 13 | **`ddl-auto=update` in production.** | **MEDIUM** | ⚠️ Documented (kept for this release; Flyway plan in §14) |
| 14 | **No HTTP security headers** (CSP, Referrer-Policy, explicit HSTS/frame). | **LOW** | ✅ Fixed |
| 15 | **No automated tests at all** (empty `src/test`). | **HIGH** (process) | ✅ Fixed (59 security tests, all green) |
| 16 | **Dependency CVEs** — Spring Boot 3.4.1 (Spring Framework 6.2.1 / Tomcat 10.1.x CVEs), Apache POI 5.2.5 (CVE-2025-31672). | **HIGH** | ✅ Fixed (3.4.13, POI 5.4.1) |
| 17 | **JWT in `localStorage` (XSS-exfiltratable).** | **MEDIUM** (accepted) | ✅ Documented + mitigations (Option A retained) |
| 18 | **`DataSeeder` default password `Admin@123`** for seeded users. | **MEDIUM** | ⚠️ Documented (demo data; must not ship) |
| 19 | **Raw SQL dumps next to source.** | **LOW** | ⚠️ Documented (do not commit) |
| 20 | **CSRF disabled.** | INFO | ✅ Documented decision (Bearer-token auth; §12) |

**Verified-good pre-existing (not changed):** minimal JWT payload (no passwords/business data), JJWT signature+algorithm enforcement, BCrypt hashing, parameterized JPA queries (no SQL concatenation of user input), no `userId`-from-request data-access patterns (company-wide data model), path-traversal guard in `FileStorageService`.

---

## 3. Security decisions (explicit)

| Topic | Decision |
|---|---|
| Registration | Public registration **always creates `USER`**; the `role` field was removed from `RegisterRequest` (extra JSON fields are ignored by Jackson, so `{"role":"ADMIN"}` submissions simply produce a USER account). Role elevation only via ADMIN-only `PATCH /users/{id}/role` (which refuses self-demotion and validates roles). |
| Secrets | No hardcoded fallbacks for `app.jwt.secret` / DB credentials — **fail-fast startup** when missing. Documented rotation requirements (§5). |
| MySQL | Dedicated `erp_app` user with least privilege (`docs/mysql-app-user.sql`). `createDatabaseIfNotExist` removed from the default URL. |
| Files | `/files/**` requires authentication. Frontend fetches files through the authenticated Axios client as blobs (no bare URLs). Serving: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, safe preview types inline, everything else `attachment`. Uploads: extension allowlist (`app.upload.allowed-extensions`), server-generated UUID names, 200 MB per-file default, path-traversal defense in depth. |
| CORS | `app.cors.allowed-origins` (comma-separated, env-configurable). No wildcard patterns with credentials. |
| CSRF | **Disabled and stays disabled.** Auth is a JWT in the `Authorization` header (stateless, no cookies) — there is no ambient credential a cross-site request could abuse. **If the app ever moves to cookie-based auth, CSRF protection must be re-enabled.** |
| JWT storage (React) | **Option A retained**: Bearer header + `localStorage`. XSS implications documented in §11. Cookie migration documented as a future option — the project is deliberately NOT left half-migrated. |
| JWT lifetime | Access token **30 min** (`ERP_JWT_EXPIRATION_MS`), refresh token **7 days** (`ERP_JWT_REFRESH_EXPIRATION_MS`). Refresh tokens: random 256-bit values, **SHA-256 hashed at rest**, **rotated on every use**, **revoked on logout**, **reuse detection revokes the whole family**. |
| Account states | `locked`, `accountExpired`, `credentialsExpired` added to `User` (defaults `false`), mapped into Spring `UserDetails`, and enforced by the JWT filter on every request. |
| Rate limiting | In-memory fixed-window limiter on `/auth/login`, `/auth/register`, `/auth/refresh` (per IP) + per email+IP on login; 429 + `Retry-After`; no permanent lockouts. Per-instance only — document the multi-instance caveat (§19). |
| DB migrations | `ddl-auto=update` kept for this release (it adds the new `refresh_tokens` table + account-state columns without breaking the running app) — **documented as unsafe for production**; Flyway/Liquibase plan in §14. |
| Dependencies | Spring Boot **3.4.1 → 3.4.13** (final 3.4.x; includes Spring Framework 6.2.x fixes for CVE-2025-22228/22243 and Tomcat 10.1.50). Apache POI **5.2.5 → 5.4.1** (fixes CVE-2025-31672). Both compatible patch bumps for the code's usage. |
| HTTPS | Documented in §15. TLS is terminated by the reverse proxy; the app never serves secrets over HTTP in production. |

---

## 4. What was implemented (summary)

1. **Registration**: `RegisterRequest` no longer has `role`; `AuthService.register` always assigns `USER`. New ADMIN-only `PATCH /users/{id}/role` (with `@PreAuthorize("hasRole('ADMIN')")`, self-demotion blocked, role validated).
2. **Secrets**: `application.properties` has no default for `ERP_JWT_SECRET` / `ERP_DATABASE_USERNAME` / `ERP_DATABASE_PASSWORD`; `JwtService` validates the secret (≥256-bit HMAC key) at startup. `.env.example` updated with placeholders and generation instructions.
3. **MySQL**: `docs/mysql-app-user.sql` (dedicated `erp_app` user, DML + optional DDL grants, no administrative privileges). Default JDBC URL no longer creates the database.
4. **Files**: `/files/**` moved from `permitAll` to authenticated. `FileStorageService` hardened (extension allowlist, size check, filename sanitization, UUID names). `FileController` validates names, sets `nosniff`, `no-store`, and inline/attachment disposition by content type.
5. **CORS**: restricted to configured origins (no wildcard + credentials).
6. **JWT**: `JwtService` fails fast on weak/missing secret; filter classifies and logs failures (MISSING / MALFORMED / EXPIRED / BAD_SIGNATURE / USER_DISABLED / USER_LOCKED / ACCOUNT_EXPIRED / SUBJECT_MISMATCH / UNSUPPORTED_ALGORITHM) without ever logging tokens, and rejects disabled/locked/expired accounts even with a valid signature.
7. **Error handling**: consistent JSON 401 (`RestAuthenticationEntryPoint`) / 403 (`RestAccessDeniedHandler`); `GlobalExceptionHandler` no longer leaks exception text (generic 500 + server-side log), maps 429/405/415/type-mismatch/bad-date to proper statuses.
8. **Authorization**: `@EnableMethodSecurity`, `Permission` enum + `RolePermissions` role→permission map (future permission-based authorization), ADMIN-only settings + role-management enforced server-side.
9. **Security logging**: dedicated `SECURITY` logger (`SecurityAuditLogger`) for login success/failure, JWT rejections, access denials, role changes, refresh-token reuse/revocation, rate-limit blocks. Passwords/tokens/secrets never logged.
10. **Rate limiting**: `RateLimiter` + `AuthRateLimitFilter` (IP-level) + email+IP check in `AuthService`.
11. **Refresh tokens**: `refresh_tokens` table (hash-only storage, family lineage), `/auth/refresh` (rotation + reuse detection), `/auth/logout` (revocation), cleanup of expired rows. Access token shortened to 30 min.
12. **Account states**: `User.locked/accountExpired/credentialsExpired` + `UserDetails` mapping + filter enforcement.
13. **Headers**: CSP, Referrer-Policy (strict-origin-when-cross-origin), frame-options DENY, HSTS (enabled via env for HTTPS deployments; only emitted on secure requests), `nosniff` on file responses.
14. **Dependencies**: Boot 3.4.13, POI 5.4.1, H2 (test scope only).
15. **Tests**: 59 automated security tests (all green) — see §20.
16. **Frontend**: silent refresh interceptor (single-flight, replay-once), `/auth/logout` on sign-out, authenticated blob file access in all 4 attachment components, size constants updated to 200 MB.

---

## 5. Secret rotation — REQUIRED ACTION

The previously committed values are public knowledge and **must be rotated**:

1. **JWT signing key**: the old fallback in `application.properties` (and any token signed with it) is compromised. Generate a new one and update `erp-backend/.env`:
   ```bash
   openssl rand -base64 64
   ```
   Rotating invalidates every issued JWT — all users must log in again (expected, one-time).
2. **Database password**: `<redacted-local-mysql-password>` (root) was in source control. Set a strong password for the `erp_app` user and update `ERP_DATABASE_PASSWORD` in `.env`.
3. **`erp-backend/.env` action items** (your local, git-ignored file — I did not edit it):
   - `ERP_DATABASE_USERNAME=root` → `erp_app` (run `docs/mysql-app-user.sql` first)
   - remove `createDatabaseIfNotExist=true` from `ERP_DATABASE_URL`
   - `ERP_JWT_SECRET` → the newly generated value
4. **Default seed password**: `DataSeeder` creates users (incl. an ADMIN) with the known password `Admin@123`. In any environment other than local demo, either remove the seeder or force a password change before first use.
5. **Do not commit** the SQL dumps (`erp_db_backup_*.sql`) sitting next to the backend — they contain password hashes and business data. Add `*.sql` (or the specific files) to `.gitignore` if this directory ever becomes a repository.

---

## 6. Authentication architecture (post-fix)

```
React (localStorage: accessToken + refreshToken)
   ↓  Axios request interceptor: Authorization: Bearer <accessToken>
HTTPS (reverse-proxy TLS)
   ↓  CORS (configured origins only)
Spring Security (stateless, CSRF n/a for Bearer)
   ↓  AuthRateLimitFilter (per-IP, 429)
   ↓  JwtAuthenticationFilter (signature, expiry, account state; classifies + logs failures)
   ↓  SecurityContext (principal = UserDetails; authorities = ROLE_<role>)
Controller → Service → Repository → MySQL
```

- **Login** → `POST /auth/login` → `AuthResponse { token, refreshToken, email, fullName, role }`.
- **Silent refresh** → `POST /auth/refresh` (rotates the refresh token; reuse of a rotated token revokes the family).
- **Logout** → `POST /auth/logout` revokes the refresh token; the frontend also clears local storage.

---

## 7. Authorization architecture

- Role-based today: `ADMIN / MANAGER / USER`, enforced server-side (`@PreAuthorize("hasRole('ADMIN')")` on `PATCH /users/{id}/role` and financial settings).
- `Permission` enum + `RolePermissions` map are the extension point for permission-based authorization (e.g. `@PreAuthorize("hasAuthority('SALES_APPROVE')")`) without redesigning roles.
- Identity always comes from `SecurityContextHolder` (JWT → `UserDetails` → DB). No `userId`/role/permission from the client is trusted.
- The ERP data model is **company-wide**: leads, quotations, invoices etc. are shared across employees — there is no per-user row ownership to bypass. Files are the boundary that existed and is now closed (authenticated-only, no anonymous access).

---

## 8–11. JWT, passwords, registration, files

- **JWT**: HS256, ≥256-bit key, minimal claims (`sub`, `iat`, `exp`); rejects expired/malformed/unsigned/unsupported-alg/bad-signature tokens; never logged. Access token 30 min.
- **Passwords**: BCrypt (strength 10), never stored/returned/logged in plaintext. No custom hashing. **Password reset does not exist in this ERP yet** — when added, the requirements are: random ≥256-bit single-use token, short expiry, stored hashed.
- **Registration**: always `USER`; role escalation impossible from the public API; automated tests prove it.
- **Files**: authenticated only; UUID storage names; extension allowlist; per-file size cap; `nosniff` + disposition policy; no path traversal; no user-controlled filenames on disk.

---

## 12. CSRF decision

**Disabled — correct for this architecture.** Authentication is a JWT in the `Authorization` header with stateless sessions: a cross-site request cannot piggyback on an ambient cookie, so CSRF does not apply. Re-enable CSRF if/when auth moves to cookies (see §21).

---

## 13. CORS changes

`allowedOriginPatterns("*")` + credentials → exact origin list from `ERP_CORS_ALLOWED_ORIGINS` (default: localhost dev origins). Same-origin deployments (Vite/nginx proxy) need no CORS at all. Production: set the real ERP frontend domain(s). Tests verify allowed origin passes and disallowed origins are rejected.

---

## 14. Database migration strategy

- **Keep `ddl-auto=update` for now** — it safely adds the new `refresh_tokens` table and account-state columns on the existing MySQL schema without downtime.
- **Production recommendation**: introduce **Flyway** with `baseline-on-migrate=true`:
  1. Capture the current schema as the Flyway baseline (V1).
  2. Set the migration user (DDL grants) separately from the app user (DML-only).
  3. Switch the app to `spring.jpa.hibernate.ddl-auto=validate` (or `none`) once all schema changes flow through migrations.
  4. Never run destructive migrations automatically; review them in review/CI.
- Hibernate `createDatabaseIfNotExist` is removed from the default URL; the app user cannot create databases.

---

## 15. HTTPS / TLS architecture

- TLS is terminated at the **reverse proxy / load balancer** (nginx / cloud LB) in front of the Spring Boot app. The app itself runs plain HTTP on a private network.
- The proxy forwards `X-Forwarded-For` (used for rate limiting and audit logs — **ensure the proxy is the only host allowed to set it**).
- Enable `ERP_SECURITY_HSTS=true` once HTTPS is in place (the header is only emitted for secure requests).
- Never expose `/v1/**` over plain HTTP in production. Consider HSTS `preload` + `includeSubDomains` only after confirming the whole domain is HTTPS.

---

## 16. Dependency changes

| Dependency | From | To | Reason |
|---|---|---|---|
| Spring Boot | 3.4.1 | **3.4.13** (final 3.4.x) | CVE-2025-22228 (multipart exfiltration), CVE-2025-22243 (`UriComponentsBuilder` ReDoS), Tomcat CVE-2024-50379 — all fixed in the 3.4.x line. Same minor → compatible. |
| Apache POI (poi, poi-ooxml, poi-scratchpad) | 5.2.5 | **5.4.1** | CVE-2025-31672 (OOXML improper input validation, fixed in 5.4.0). API-compatible with the passive text-reading usage. |
| H2 (added) | — | test scope | In-memory DB for the security test suite. Runtime stays MySQL-only. |
| JJWT 0.12.6, PDFBox 2.0.32, MySQL connector | unchanged | — | Current/no known applicable CVEs for this usage. |

---

## 17. Files modified / created

**Backend — modified**
- `pom.xml` (Boot 3.4.13, POI 5.4.1, H2 test dep)
- `src/main/resources/application.properties` (secrets externalized, upload limits, CORS, JWT lifetimes, rate limits, HSTS)
- `.env.example` (placeholders, erp_app, rotation/generation instructions)
- `config/SecurityConfig.java` (public paths, CORS, headers, 401/403 handlers, method security, filter order)
- `security/JwtService.java`, `security/JwtAuthenticationFilter.java`, `security/CustomUserDetailsService.java`
- `service/AuthService.java`, `service/FileStorageService.java`
- `controller/AuthController.java` (+refresh/logout), `controller/FileController.java`, `controller/UserController.java` (+role change)
- `entity/User.java` (account states), `dto/RegisterRequest.java`, `dto/AuthResponse.java`
- `exception/GlobalExceptionHandler.java`

**Backend — created**
- `security/SecurityAuditLogger.java`, `security/Permission.java`, `security/RolePermissions.java`
- `security/RateLimiter.java`, `security/AuthRateLimitFilter.java`
- `security/RestAuthenticationEntryPoint.java`, `security/RestAccessDeniedHandler.java`
- `entity/RefreshToken.java`, `repository/RefreshTokenRepository.java`, `service/RefreshTokenService.java`
- `dto/RefreshTokenRequest.java`, `dto/ChangeRoleRequest.java`, `exception/TooManyRequestsException.java`
- `docs/mysql-app-user.sql`

**Backend tests — created (all green)**
- `src/test/resources/application.properties`, `src/test/java/com/vishatech/erp/security/AbstractSecurityTest.java`
- `AuthSecurityTests`, `JwtSecurityTests`, `ExpiredJwtSecurityTests`, `FileSecurityTests`, `FileStorageSecurityTests`, `CorsSecurityTests`, `RateLimitTests`, `RefreshTokenSecurityTests`, `AuthorizationSecurityTests`, `InputValidationSecurityTests`

**Frontend — modified**
- `src/api/axiosInstance.js` (silent refresh, replay-once, 403 no longer logs you out)
- `src/services/authService.js`, `src/utils/attachmentStorage.js` (200 MB constant)
- `src/pages/SignIn.jsx`, `src/components/Auth/ProtectedRoute.jsx`, `src/components/Layout/AppLayout.jsx` (logout revokes server-side)
- `src/components/LeadDetail/Attachments.jsx`, `src/components/CprDetail/CprAttachments.jsx`, `src/components/SalesDetail/SalesAttachments.jsx`, `src/components/ClientDetail/ClientViewModal.jsx` (authenticated blob file access)

**Frontend — created**
- `src/services/tokenStorage.js`, `src/utils/fileAccess.js`

**Docs**
- `SECURITY_AUDIT.md` (this report)

---

## 18. Security tests (59, all passing)

1. ✅ Valid login / invalid login (401)
2. ✅ Missing JWT → 401; malformed / garbage / wrong-signature / modified / expired JWT → 401
3. ✅ Disabled user's still-valid token → 401; locked user → 401; unknown user token → 401
4. ✅ Public registration with `role: ADMIN`/`MANAGER` still creates USER; `/auth/me` confirms USER
5. ✅ Weak password rejected (400); duplicate email → 409
6. ✅ Files: no auth → 401; storage → 401/200; valid download with auth; path traversal (raw + URL-encoded) → 400; non-UUID names → 400; missing file → 404
7. ✅ Upload hardening: `.exe/.html/.js/.sh/.jsp`, no extension, oversize, empty → rejected; path-traversal filename neutralized
8. ✅ CORS: allowed origin preflight OK; disallowed/wildcard origin rejected
9. ✅ Brute-force login → 429; register throttled per IP → 429
10. ✅ Refresh tokens: rotation, reuse-of-rotated-token revokes family, logout revocation, garbage → 401
11. ✅ Authorization: role change requires ADMIN (403 for USER, 401 anonymous), admin cannot demote self, invalid role → 400, financial settings ADMIN-only
12. ✅ SQL injection in search/sort parameters neutralized; invalid date → 400; pagination clamped; unknown endpoint → 404

**Regression:** the whole suite runs against an in-memory H2 (MySQL compatibility mode); production runtime is untouched (MySQL only, H2 is test-scope).

---

## 19. Remaining risks (honest residual risk — NOT "100% secure")

1. **localStorage token exposure (accepted)**: XSS in the SPA can exfiltrate tokens. Mitigations: CSP at the hosting layer, no third-party scripts, no `dangerouslySetInnerHTML` with untrusted data, 30-min access tokens, rotating refresh tokens. Cookie-based migration documented in §21.
2. **Refresh tokens live in localStorage** (same XSS exposure class as before — not a regression, but a long-lived credential in JS). Rotation + family revocation + 7-day expiry limit the damage; a cookie-based refresh token is the recommended next step.
3. **Rate limiter is per-instance** — a multi-replica deployment needs a shared store (Redis) or an edge limiter (nginx `limit_req`). Single-instance is fine today.
4. **`ddl-auto=update`** remains enabled — safe additive changes only; must move to Flyway before risky schema changes.
5. **Uploaded content is not deep-scanned** — allowlisted extensions + size caps + safe serving (no inline execution of non-preview types) mitigate, but malware scanning is not performed.
6. **PDF/POI parsing** (SalesContract bulk upload) parses untrusted documents in memory; bounded by size (200 MB) and per-document row/text caps, but not sandboxed.
7. **Seed/demo data** with known passwords exists in `DataSeeder` — must be removed/rotated for any non-demo environment.
8. **No password-reset flow exists** in the ERP — when built, it must follow the requirements in §9 (secure, short-lived, single-use, hashed tokens).
9. **No account-disable admin UI** — the state fields and enforcement exist; an admin workflow to flip them is future work.
10. **Logs** contain emails + IPs (intended for incident investigation) — protect log storage as sensitive data.

---

## 20. Regression testing

- Backend: `./mvnw test` — 59/59 green (auth, files, CORS, rate limits, refresh, authorization, validation, injection resistance).
- Frontend: `npm run build` — clean; `eslint` on all touched files — clean.
- Manual checks performed: dev `.env` still has a valid base64 JWT secret (app boots unchanged once the DB user/secret are rotated per §5).
- Existing flows preserved: login shape is additive (`refreshToken` added), all existing endpoints/roles unchanged, `/auth/me`, `/users` list, settings ADMIN check intact.

---

## 21. Future recommendations

1. **Cookie-based auth migration plan (if desired)** — do it as one coherent release, not piecemeal:
   - Access token: `HttpOnly` + `Secure` + `SameSite=Strict` cookie, sent by the browser automatically.
   - Refresh token: separate `HttpOnly` `Secure` `SameSite=Strict` cookie with `Path=/v1/auth`.
   - Re-enable **CSRF protection** (the current rationale for disabling it no longer holds).
   - Axios: `withCredentials: true`; drop the Authorization-header interceptor.
   - Protected routes / logout / WebSocket (later) all flow through cookies automatically.
   - Keep the server-side hashed refresh-token store and rotation from this release.
   - Provide a one-time token on login to migrate existing localStorage sessions.
2. **WebSocket (future)**: authenticate the upgrade request with a short-lived ticket derived from the access token (never pass refresh tokens over WS); the current header-based auth does not apply to WS handshakes from browsers.
3. **Flyway + DML-only app user** (§14), then `ddl-auto=validate`.
4. **Shared rate limiting** (Redis or edge) when scaling out.
5. **Admin user-management UI** (disable/lock users, reset passwords, change roles) reusing the server-side endpoints and audit log added here.
6. **Dependency scanning in CI** (OWASP Dependency-Check / Snyk) so regressions are caught automatically.
7. **Alerting on the `SECURITY` log stream** (login bursts, JWT rejection spikes, refresh-reuse events).

**Bottom line:** the critical and high-severity findings are fixed with automated tests proving them. Remaining items are documented, accepted risks and deliberate future work — defense-in-depth is in place, the working ERP was not rewritten, and no business functionality was sacrificed.
