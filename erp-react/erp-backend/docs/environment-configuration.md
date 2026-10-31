# Environment configuration — secrets, required variables and production rules

This document is the deployment contract for environment configuration: which
variables exist, which are mandatory, how secrets are supplied, and what was
verified before this was written. Companions:
[database-deployment.md](database-deployment.md) (schema),
[file-storage-deployment.md](file-storage-deployment.md) (upload paths),
[upload_pipeline.md](upload_pipeline.md) (size limits).

## 1. Rules

1. **No secret has a default.** `ERP_JWT_SECRET`, `ERP_DATABASE_USERNAME` and
   `ERP_DATABASE_PASSWORD` are `${…}` placeholders with no fallback in
   `application.properties`. If they are missing the application **refuses to
   start** — `JwtService` throws `app.jwt.secret is not configured…` and Spring
   reports `Could not resolve placeholder 'ERP_JWT_SECRET'`.
2. **Real secrets live only in ignored files** (`.env`, `erp-backend/.env`) or
   in the deployment platform's secret store. `.gitignore` carries `.env`,
   `.env.*`, `!.env.example` and an explicit `erp-backend/.env` safety net.
   Only `*.env.example` is tracked, and it contains placeholders only.
3. **`spring.config.import=optional:file:.env[.properties]` is a convenience for
   development only.** It is resolved *relative to the process working
   directory* and is optional: with no `.env` present the application starts
   from OS environment variables alone. A production deployment must therefore
   supply `ERP_*` through the service manager / container environment — never by
   copying a developer's `.env` onto the server.
4. **Never connect to MySQL as root.** Use the dedicated application user
   created by [mysql-app-user.sql](mysql-app-user.sql); its password is a secret
   like any other. The JDBC URL must not carry `createDatabaseIfNotExist=true`.
5. **Do not commit, print or paste secret values** — not in code, docs, scripts,
   tickets or logs. `.env.example` values must always read as placeholders
   (`change-me-…`, `your_…`).

## 2. Mandatory variables

| Property | Variable | Notes |
|---|---|---|
| `app.jwt.secret` | `ERP_JWT_SECRET` | Base64 HMAC key, ≥ 32 bytes. Generate: `openssl rand -base64 64`. Startup fails if missing or weak. |
| `spring.datasource.username` | `ERP_DATABASE_USERNAME` | The dedicated application user (`erp_app`), never `root`. |
| `spring.datasource.password` | `ERP_DATABASE_PASSWORD` | Password of that user. No default, no fallback. |

Everything else has a safe default and may be omitted.

### How a Windows laptop fills these in

`setup.bat` (wraps `scripts/setup.ps1`) checks Java/Node/npm, asks for this
laptop's MySQL host, port, database, user and password (input hidden), verifies
`erp_db` **read-only** and writes the three mandatory values plus
`ERP_DATABASE_HOST/PORT/NAME` into `erp-backend/.env`. It never creates or
migrates a database, and the password is never echoed or logged.

`start-all.bat` runs `scripts/preflight.ps1` before starting anything. That
preflight:

- refuses to continue when `.env` is missing or still holds a placeholder
  password, printing exactly which file to create and which keys to set;
- **generates a new JWT secret once** if `ERP_JWT_SECRET` is empty, writing it
  to the local `.env` without printing it (the app itself still refuses to start
  on an empty secret, and the value must not be shared between installations);
- resolves `ERP_DATABASE_HOST/PORT/NAME` (or the full `ERP_DATABASE_URL` when
  set) and TCP-checks that MySQL answers there before the backend starts;
- counts the existing tables in `erp_db` with a read-only query, so a missing or
  empty database stops with instructions instead of being initialised;
- reports a busy 8080/5173 with the PID lookup command instead of moving ports.

## 3. Verified behaviour

All four checks below were executed against the packaged jar
(`java -jar target/erp-backend-1.0.0.jar`) from a working directory containing
**no `.env` file**:

| Check | Result |
|---|---|
| Start with `ERP_JWT_SECRET` unset | Startup aborts: `Could not resolve placeholder 'ERP_JWT_SECRET'` — fail-fast confirmed, no `.env` silently loaded. |
| Start with `ERP_*` env vars only (no `.env` anywhere) | Application starts and serves requests. |
| Same run, least-privilege DB user | Connected as `erp_probe` to a scratch schema using exactly the grant set from `mysql-app-user.sql` — MySQL root was **not** used at runtime. |
| Application-level smoke test | Seeded admin login returned a token; `GET /v1/files/storage` returned `200`; 136 tables created by the non-root user under `ddl-auto=update`. |

(The pre-existing root→`erp_db` connections observed during that run belong to
the separately running development backend, not to this process.)

## 4. Required variables for a production deployment

Minimum viable production environment:

```bash
# --- secrets (mandatory) ---
ERP_JWT_SECRET=$(openssl rand -base64 64)     # generate once, store in the secret store
ERP_DATABASE_USERNAME=erp_app
ERP_DATABASE_PASSWORD=<from the secret store>

# --- database (an existing, already populated erp_db — never initialised here) ---
ERP_DATABASE_HOST=db-host
ERP_DATABASE_PORT=3306
ERP_DATABASE_NAME=erp_db
# ERP_DATABASE_URL overrides the three values above when a deployment needs a full URL
ERP_DDL_AUTO=validate                          # validate in production; migrations run separately

# --- server ---
ERP_PORT=8080
ERP_BASE_URL=https://erp.example.com           # absolute origin behind the TLS terminator
ERP_CORS_ALLOWED_ORIGINS=https://erp.example.com
ERP_SECURITY_HSTS=true                         # only once HTTPS terminates in front of the app

# --- storage (one external volume) ---
ERP_UPLOAD_DIR=/var/lib/erp/uploads
ERP_UPLOAD_TEMP_DIR=/var/lib/erp/upload-spool
```

## 5. All environment variables

Defaults are exactly those in `application.properties`. Grouped by area.

### Server, security, CORS

| Property | Variable | Default |
|---|---|---|
| `server.port` | `ERP_PORT` | `8080` |
| `app.base-url` | `ERP_BASE_URL` | `http://localhost:8080` |
| `app.cors.allowed-origins` | `ERP_CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173` |
| `app.security.hsts` | `ERP_SECURITY_HSTS` | `false` |
| `app.security.hsts-max-age` | `ERP_SECURITY_HSTS_MAX_AGE` | `31536000` |
| `app.jwt.expiration-ms` | `ERP_JWT_EXPIRATION_MS` | `1800000` (30 min) |
| `app.jwt.refresh-expiration-ms` | `ERP_JWT_REFRESH_EXPIRATION_MS` | `604800000` (7 days) |
| `management.metrics.tags.env` | `ERP_METRICS_ENV` | `local` |

### Database

| Property | Variable | Default |
|---|---|---|
| `spring.datasource.url` (host) | `ERP_DATABASE_HOST` | `localhost` |
| `spring.datasource.url` (port) | `ERP_DATABASE_PORT` | `3306` |
| `spring.datasource.url` (schema) | `ERP_DATABASE_NAME` | `erp_db` — the database is expected to exist already |
| `spring.datasource.url` (full override) | `ERP_DATABASE_URL` | `jdbc:mysql://${ERP_DATABASE_HOST}:${ERP_DATABASE_PORT}/${ERP_DATABASE_NAME}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC`; wins over host/port/name. Keep `createDatabaseIfNotExist` out of it. |
| `spring.datasource.username` | `ERP_DATABASE_USERNAME` | **mandatory** |
| `spring.datasource.password` | `ERP_DATABASE_PASSWORD` | **mandatory** |
| `spring.jpa.hibernate.ddl-auto` | `ERP_DDL_AUTO` | `validate` |

### Connection pool and request threads (100-user target)

| Property | Variable | Default |
|---|---|---|
| `spring.datasource.hikari.maximum-pool-size` | `ERP_DB_POOL_MAX` | `50` — starting point, validate under staging load |
| `spring.datasource.hikari.minimum-idle` | `ERP_DB_POOL_MIN_IDLE` | `10` |
| `spring.datasource.hikari.connection-timeout` | `ERP_DB_POOL_CONNECTION_TIMEOUT_MS` | `12000` |
| `spring.datasource.hikari.idle-timeout` | `ERP_DB_POOL_IDLE_TIMEOUT_MS` | `300000` |
| `spring.datasource.hikari.max-lifetime` | `ERP_DB_POOL_MAX_LIFETIME_MS` | `1500000` (25 min) |
| `spring.datasource.hikari.keepalive-time` | `ERP_DB_POOL_KEEPALIVE_MS` | `300000` |
| `spring.datasource.hikari.leak-detection-threshold` | `ERP_DB_LEAK_DETECTION_MS` | `60000` (0 disables) |
| `server.tomcat.threads.max` | `ERP_TOMCAT_MAX_THREADS` | `200` |
| `server.tomcat.threads.min-spare` | `ERP_TOMCAT_MIN_SPARE_THREADS` | `25` |
| `server.tomcat.accept-count` | `ERP_TOMCAT_ACCEPT_COUNT` | `200` |
| `server.tomcat.max-connections` | `ERP_TOMCAT_MAX_CONNECTIONS` | `8192` |
| `spring.lifecycle.timeout-per-shutdown-phase` | `ERP_SHUTDOWN_TIMEOUT` | `30s` (`server.shutdown=graceful` is always on) |

MySQL must allow at least `ERP_DB_POOL_MAX + headroom` connections
(`max_connections` ≥ 120 for a pool of 50). A pending Hikari connection count
above zero during the staging test means the pool or the database is saturated —
raise neither without measuring.

### Storage

| Property | Variable | Default |
|---|---|---|
| `app.upload.dir` | `ERP_UPLOAD_DIR` | `uploads` (set an absolute path in production) |
| `app.storage.models` | `ERP_MODEL_STORAGE_DIR` | `${app.upload.dir}/models` |
| `app.storage.drawings` | `ERP_DRAWINGS_STORAGE_DIR` | `${app.upload.dir}/drawings` |
| `app.cad.worker.preview-dir` | `ERP_CAD_WORKER_PREVIEW_DIR` | `${app.upload.dir}/cad-previews` |
| `spring.servlet.multipart.location` | `ERP_UPLOAD_TEMP_DIR` | `${java.io.tmpdir}/erp-upload-spool` |
| `app.attachments.pool-bytes` | `ERP_ATTACHMENT_POOL_BYTES` | `4294967296` (4 GB) — shared across all attachment modules |
| `app.upload.max-concurrent` | `ERP_MAX_CONCURRENT_UPLOADS` | `4` |
| `app.upload.acquire-timeout-ms` | `ERP_UPLOAD_ACQUIRE_TIMEOUT_MS` | `30000` (then HTTP 429 + Retry-After) |
| `app.upload.min-free-bytes` | `ERP_UPLOAD_MIN_FREE_BYTES` | `5368709120` (5 GB reserve; below it HTTP 507) |
| `management.health.diskspace.path` | — | `${app.upload.dir}` |
| `management.health.diskspace.threshold` | `ERP_DISK_MIN_FREE_BYTES` | `5368709120` |

### Upload limits and allowed types

| Property | Variable | Default |
|---|---|---|
| `spring.servlet.multipart.max-file-size` | `ERP_MAX_FILE_SIZE` | `2GB` |
| `spring.servlet.multipart.max-request-size` | `ERP_MAX_REQUEST_SIZE` | `2200MB` |
| `spring.servlet.multipart.file-size-threshold` | `ERP_UPLOAD_DISK_THRESHOLD` | `0B` |
| `server.tomcat.max-swallow-size` | `ERP_MAX_SWALLOW_SIZE` | `2MB` |
| `server.tomcat.max-part-count` | `ERP_MAX_PART_COUNT` | `50` |
| `app.upload.allowed-extensions` | `ERP_UPLOAD_ALLOWED_EXTENSIONS` | `pdf,doc,docx,xls,xlsx,csv,txt,png,jpg,jpeg,gif,webp,zip,step,stp,iges,igs,stl,obj,glb,gltf` |
| `app.upload.lead-import-max-bytes` | `ERP_LEAD_IMPORT_MAX_BYTES` | `20971520` |
| `app.notification.list-default-size` | `ERP_NOTIFICATION_LIST_SIZE` | `100` |
| `app.notification.list-max-size` | `ERP_NOTIFICATION_LIST_MAX_SIZE` | `500` |
| `app.notification.sweep-batch-size` | `ERP_NOTIFICATION_SWEEP_BATCH_SIZE` | `200` |

### Rate limiting

| Property | Variable | Default |
|---|---|---|
| `app.rate-limit.login.max-per-ip` | `ERP_RATE_LIMIT_LOGIN_IP` | `20` |
| `app.rate-limit.login.max-per-email-ip` | `ERP_RATE_LIMIT_LOGIN_EMAIL_IP` | `10` |
| `app.rate-limit.login.window-minutes` | `ERP_RATE_LIMIT_LOGIN_WINDOW` | `15` |
| `app.rate-limit.refresh.max-per-ip` | `ERP_RATE_LIMIT_REFRESH_IP` | `60` |
| `app.rate-limit.refresh.window-minutes` | `ERP_RATE_LIMIT_REFRESH_WINDOW` | `15` |
| `app.rate-limit.register.max-per-ip` | `ERP_RATE_LIMIT_REGISTER_IP` | `5` |
| `app.rate-limit.register.window-minutes` | `ERP_RATE_LIMIT_REGISTER_WINDOW` | `60` |

### CAD conversion engines

| Property | Variable | Default |
|---|---|---|
| `app.cad-convert.enabled` | `ERP_CAD_CONVERT_ENABLED` | `true` |
| `app.cad-convert.cadmpeg-enabled` | `ERP_CADMPEG_ENABLED` | `true` |
| `app.cad-convert.cadmpeg-path` | `ERP_CADMPEG_PATH` | (empty) |
| `app.cad-convert.cadmpeg-timeout-seconds` | `ERP_CADMPEG_TIMEOUT` | `300` |
| `app.cad-convert.freecad-enabled` | `ERP_FREECAD_ENABLED` | `false` |
| `app.cad-convert.freecad-command` | `ERP_FREECAD_COMMAND` | (empty) |
| `app.cad-convert.freecad-timeout-seconds` | `ERP_FREECAD_TIMEOUT` | `240` |
| `app.cad-convert.sat-enabled` | `ERP_SAT_ENABLED` | `true` |
| `app.cad-convert.sat-node-path` | `ERP_SAT_NODE_PATH` | (empty) |
| `app.cad-convert.sat-tessellator-script` | `ERP_SAT_TESSELLATOR_SCRIPT` | (empty) |
| `app.cad-convert.sat-occt-module` | `ERP_SAT_OCCT_MODULE` | (empty) |
| `app.cad-convert.sat-timeout-seconds` | `ERP_SAT_TIMEOUT` | `300` |

### CAD worker

| Property | Variable | Default |
|---|---|---|
| `erp.cad.worker.mode` — read **directly from the environment**, not through `application.properties`: `true`/`1` starts this JVM as the isolated worker (no HTTP port); unset starts the normal ERP. Both processes need the same `ERP_UPLOAD_DIR`. | `ERP_CAD_WORKER_MODE` | (unset → normal ERP process) |
| `app.cad.worker.enabled` | `ERP_CAD_WORKER_ENABLED` | `true` |
| `app.cad.worker.max-concurrent-jobs` | `ERP_CAD_WORKER_MAX_CONCURRENT` | `1` |
| `app.cad.worker.max-file-bytes` | `ERP_CAD_WORKER_MAX_FILE_BYTES` | `209715200` |
| `app.cad.worker.timeout-seconds` | `ERP_CAD_WORKER_TIMEOUT_SECONDS` | `420` |
| `app.cad.worker.max-queued-jobs` | `ERP_CAD_WORKER_MAX_QUEUED` | `50` |
| `app.cad.worker.poll-interval-ms` | `ERP_CAD_WORKER_POLL_MS` | `2000` |
| `app.cad.worker.recovery-interval-ms` | `ERP_CAD_WORKER_RECOVERY_MS` | `30000` |
| `app.cad.worker.housekeep-interval-ms` | `ERP_CAD_WORKER_HOUSEKEEP_MS` | `900000` |
| `app.cad.worker.stale-timeout-seconds` | `ERP_CAD_WORKER_STALE_TIMEOUT_SECONDS` | `600` |
| `app.cad.worker.heartbeat-stale-seconds` | `ERP_CAD_WORKER_HEARTBEAT_STALE_SECONDS` | `60` |
| `app.cad.worker.allowed-file-types` | `ERP_CAD_WORKER_FILE_TYPES` | `sldprt,sldasm,sat` |
| `app.cad.worker.temp-root` | `ERP_CAD_WORKER_TEMP_ROOT` | (empty → `${java.io.tmpdir}/cad-jobs`) |
| `app.cad.worker.preview-retention-hours` | `ERP_CAD_WORKER_PREVIEW_RETENTION_HOURS` | `168` |
| `app.cad.worker.job-retention-days` | `ERP_CAD_WORKER_JOB_RETENTION_DAYS` | `30` |
| `app.cad.worker.temp-retention-hours` | `ERP_CAD_WORKER_TEMP_RETENTION_HOURS` | `24` |

### Background processing jobs

| Property | Variable | Default |
|---|---|---|
| `app.processing-jobs.concurrency` | `ERP_PROCESSING_JOBS_CONCURRENCY` | `2` |
| `app.processing-jobs.queue-capacity` | `ERP_PROCESSING_JOBS_QUEUE_CAPACITY` | `25` |
| `app.processing-jobs.dispatch-interval-ms` | `ERP_PROCESSING_JOBS_DISPATCH_INTERVAL_MS` | `5000` |
| `app.processing-jobs.dispatch-batch-size` | `ERP_PROCESSING_JOBS_DISPATCH_BATCH_SIZE` | `10` |
| `app.processing-jobs.housekeep-interval-ms` | `ERP_PROCESSING_JOBS_HOUSEKEEP_INTERVAL_MS` | `900000` |
| `app.processing-jobs.max-attempts` | `ERP_PROCESSING_JOBS_MAX_ATTEMPTS` | `2` |
| `app.processing-jobs.stale-timeout-ms` | `ERP_PROCESSING_JOBS_STALE_TIMEOUT_MS` | `600000` |
| `app.processing-jobs.retention-hours` | `ERP_PROCESSING_JOBS_RETENTION_HOURS` | `24` |
| `app.processing-jobs.max-files` | `ERP_PROCESSING_JOBS_MAX_FILES` | `25` |
| `app.processing-jobs.max-file-bytes` | `ERP_PROCESSING_JOBS_MAX_FILE_BYTES` | `104857600` |
| `app.processing-jobs.max-total-bytes` | `ERP_PROCESSING_JOBS_MAX_TOTAL_BYTES` | `314572800` |

### Notifications, exchange rates

| Property | Variable | Default |
|---|---|---|
| `app.notification.reminder-interval-ms` | `ERP_NOTIFICATION_REMINDER_INTERVAL_MS` | `300000` |
| `app.notification.reminder-batch-size` | `ERP_NOTIFICATION_REMINDER_BATCH_SIZE` | `200` |
| `exchange.api.url` | `ERP_EXCHANGE_API_URL` | `https://open.er-api.com/v6/latest/{base}` |

## 6. Frontend variables (root `.env`)

| Variable | Purpose | Default in `.env.example` |
|---|---|---|
| `VITE_API_URL` | Browser-side API base | `/v1` (same-origin proxy) |
| `ERP_PROXY_TARGET` | Vite dev-server proxy target | `http://localhost:8080` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps / Places / Directions | `your_api_key_here` |

These are bundled into the browser build — treat the Maps key as public (restrict
it by HTTP referrer in Google Cloud Console), never put a server secret there.

**Development ports are fixed, not variables.** The backend binds `8080`
(`ERP_PORT` can override it for a deliberate deployment), and the Vite dev
server is pinned to `5173` with `strictPort: true` in `vite.config.js`. If 5173
is busy the dev server refuses to start rather than moving to 5174; free the port
(see the README) instead of changing the port.

## 7. Remaining security risks (reported, not fixed here)

1. **The old local MySQL root password is still in Git history** — the literal
   value was removed from `scripts/e2e-revision-test.sh` (it now reads
   `ERP_DB_USERNAME` / `ERP_DB_PASSWORD` from the environment) and the ad-hoc
   `scripts/final-followup-db.cjs` that also contained it was deleted, but earlier
   commits still carry it. Rotate that MySQL password as a deliberate action;
   this audit did not change any database account.
2. **History still contains the old secret** — the development JWT secret had a
   copy in `erp-backend/src/test/resources/application.properties`; the copy was
   replaced (tests re-run, 449 passing), but the value remains in earlier commits.
   Rotating it in the deployment secret store is a manual, deliberate action and
   was **not** performed here.
3. **Developer `.env` uses MySQL root with `createDatabaseIfNotExist=true`** —
   convenient locally, non-compliant with §1 rule 4. Production must use
   `erp_app` and a URL that cannot create schemas.
4. **Root `.env` may hold a Google Maps key** if one is added later; keep it
   restricted by referrer and expect it to be visible to any user of the build.
