# CAD conversion (SLDPRT / SLDASM / SAT) — production deployment

Browser-renderable formats (GLB, GLTF, OBJ, STL, STEP/STP, IGES/IGS, BREP) need
**nothing** from this document: they load entirely in the browser (three.js
loaders + the OCCT WASM Web Worker).

Proprietary formats (SLDPRT, SLDASM, SAT) cannot be decoded in a browser, so the
ERP converts them to GLB **on the server**, asynchronously, in an **isolated
worker process**. This document is the deployment guide for that worker.

```
Browser (React viewer)
   │  POST /v1/models/{id}/cad-conversion      (JWT, PRODUCTION_CREATE)
   │  GET  /v1/cad-conversion/{jobId}          (JWT, polling)
   ▼
Spring Boot ERP ──► database queue (cad_conversion_jobs)
   ▲                        │ atomic claim (QUEUED → PROCESSING)
   │                        ▼
   │              CAD worker process  ──► conversion engine ──► GLB
   │              (no port, no web)        (FreeCAD / SolidWorks COM)
   │                        │
   │                        ├── validates the GLB (magic, meshes, vertex data)
   │                        ├── publishes to CAD preview storage
   │                        └── models.conversion_status = READY
   │
   └──► GET /v1/models/{id}/3d   (JWT) ──► the converted GLB ──► three.js viewer
```

Nothing in this path is public: the worker binds no port, CORS is not involved,
clients never see a filesystem path, and the GLB is served **only** through the
existing JWT-protected model endpoint.

---

## 1. The external runtime dependency: cadmpeg

The worker is a complete, safe pipeline — but it is only as capable as the
conversion engine configured beside it.

For SLDPRT/SLDASM the engine is **cadmpeg** — the decoder behind the proven Mech
R&D pipeline:

```
cadmpeg convert <input.sldprt> -o <output>.cadir.json --allow-errors --force
   → CADIR (JSON)     holds the tessellation SolidWorks itself computed
   → CadirToGlbBuilder → GLB  → validated → published → authenticated /3d
```

**cadmpeg is an external binary and is NOT bundled with this repository.** It is a
Windows executable. Point the worker at it with `ERP_CADMPEG_PATH` (or
`app.cad-convert.cadmpeg-path`); when that is blank the engine looks in cadmpeg's
documented location (`%USERPROFILE%\.cargo\bin\cadmpeg.exe`) and then on `PATH`.

While it is missing, the engine reports itself **UNAVAILABLE** with exactly why,
and an SLDPRT conversion is refused (never attempted, never faked):

```json
{ "status": "UNSUPPORTED",
  "message": "3D conversion unavailable: cadmpeg is not installed on this server. Install cadmpeg and place it on PATH (or in %USERPROFILE%\\.cargo\\bin\\cadmpeg.exe), or point ERP_CADMPEG_PATH at the executable. Until then SLDPRT/SLDASM cannot be converted — export the model as STEP (.step/.stp) and upload the STEP file for a 3D preview." }
```

**No step of this pipeline ever fabricates geometry, and a job is never marked
READY on the strength of "a file exists".**

### SAT (ACIS): three external dependencies plus a repository file

SAT has no free tessellator of its own, so the engine chains **cadmpeg → Node.js
→ `occt-import-js`** and needs one file that ships with this repository:

| Requirement | Why | How it is found | Install |
|---|---|---|---|
| **cadmpeg** | decodes the ACIS SAT B-rep and writes a neutral STEP | `ERP_CADMPEG_PATH`, else `%USERPROFILE%\.cargo\bin\cadmpeg.exe`, else `PATH` | cadmpeg distribution (Windows-only binary) |
| **Node.js (with npm)** | runs the STEP→CADIR helper | `ERP_SAT_NODE_PATH`, else `node` on `PATH` | the same Node.js used to build the frontend |
| **`occt-import-js`** | the OpenCascade WASM kernel that tessellates the STEP | normal Node resolution from the helper (repo `node_modules`), else `ERP_SAT_OCCT_MODULE` | `npm install` at the repository root (`package.json` dependency) |
| **`tools/cad/sat/step-to-cadir.cjs`** | the STEP→CADIR helper itself | `ERP_SAT_TESLLATOR_SCRIPT`, else `<project>/tools/cad/sat/step-to-cadir.cjs` (resolved from the working directory and its `..`/`../..`) | **part of the source tree — a build never generates it, so it must be committed and present in every clone** |

`GET /v1/cad-conversion/health` reports the whole chain (`sat.available`) and
the engine reports a specific, actionable message for whichever link is
missing — it never falls back to a fake preview.

### Engine / OS compatibility matrix

| Engine (`app.cad*`) | SLDPRT / SLDASM | SAT | Windows | Linux | Docker |
|---|---|---|---|---|---|
| **cadmpeg** — `CadmpegConversionEngine` (preferred; no license required) | yes (SolidWorks container → CADIR → SolidWorks' own tessellation) | no | **yes** | **no** | only a Windows-based image |
| **SolidWorks local (COM)** — `SolidWorksLocalConversionEngine` | yes (licensed SolidWorks install) | no | yes | **no** | not practical |
| **FreeCAD** — `FreeCadConversionEngine` | only a build that genuinely ships a SolidWorks importer (probed at runtime; stock FreeCAD has **none**) | no | yes | yes (`FreeCADCmd`) | yes (custom image with FreeCAD) |
| **SAT (ACIS)** — `SatAcisConversionEngine` | — | **yes** (cadmpeg → neutral STEP → `occt-import-js` tessellation → GLB), auto-detected: available only when cadmpeg, Node, the helper script and `occt-import-js` are ALL present | yes (cadmpeg is Windows-only) | no | only a Windows-based image |

Registry preference for SLDPRT/SLDASM: **cadmpeg** (when the binary is present)
→ SolidWorks local (when detected) → FreeCAD (only with a real SolidWorks
importer) → otherwise an honest, engine-specific "unavailable" reason.

`ConversionProviderRegistry` resolves this per format at runtime, so the ERP
reports exactly what the machine in front of it can do — see §6.

---

## 2. Install the schema (once per environment)

`spring.jpa.hibernate.ddl-auto=validate` is the production default, so the two
queue tables must exist **before** a build containing this pipeline starts:

```bash
mysql -u <user> -p <database> < docs/cad_conversion.sql
```

Idempotent (`CREATE TABLE IF NOT EXISTS`); no data migration. It adds only
`cad_conversion_jobs` and `cad_worker_heartbeat` — the pre-existing model
conversion columns are reused unchanged.

---

## 3. Run the worker (same host)

```bash
# ERP (as usual — it never loads any CAD worker bean)
java -jar erp-backend-1.0.0.jar

# isolated CAD worker: no port, no web layer, same database
ERP_CAD_WORKER_MODE=true java -jar erp-backend-1.0.0.jar
# equivalent: java -jar erp-backend-1.0.0.jar --erp.cad.worker.mode=true
```

Both processes share only the database queue and the preview directory. Start
exactly one worker per host (its id defaults to the hostname), or give each one
`ERP_CAD_WORKER_ID`.

### Local development: the launcher starts it for you

`start-all.sh` / `start-all.bat` start the worker themselves (step 3 of the
launcher, using `--erp.cad.worker.mode=true`) once the ERP backend reports
healthy, so no developer has to open a second terminal for it. The launcher
skips the step when a worker is already running on this host, because one
worker per host is the supported shape — a second one would contend for the
same heartbeat row.

Confirm it the same way as any deployment (§6): `workerOnline: true` in
`GET /v1/cad-conversion/health`. The launcher runs the worker in the
background, so run the command above directly whenever you need its log.

In production this stays a process-manager concern — the systemd unit below
(or the compose service in §5) is the supported mechanism; nothing in the
worker's lifecycle depends on the launcher.

### systemd unit (example)

```ini
[Unit]
Description=ERP CAD conversion worker
After=network-online.target mysql.service
Wants=network-online.target
[Service]
WorkingDirectory=/opt/erp-backend          # .env lives here
Environment=ERP_CAD_WORKER_MODE=true
ExecStart=/usr/bin/java -jar /opt/erp-backend/erp-backend-1.0.0.jar
Restart=always
RestartSec=10
User=erp
# Hardening: the worker only needs to read model files and write previews/temp
NoNewPrivileges=true
PrivateTmp=false                            # keep ERP_CAD_WORKER_TEMP_ROOT usable
ProtectSystem=strict
ReadWritePaths=/var/lib/erp/uploads /var/tmp/cad-jobs
[Install]
WantedBy=multi-user.target
```

---

## 4. Split deployment: Linux ERP + Windows CAD worker

SolidWorks COM automation is Windows-only, so if SLDPRT must be converted with a
licensed SolidWorks installation:

* ERP (Spring Boot, MySQL, nginx) on the Linux server — **unchanged**.
* CAD worker on a **Windows** machine (cadmpeg itself is Windows-only, and so is
  SolidWorks COM), pointed at the
  **same database** (`ERP_DATABASE_URL`) and the **same storage**:
  * share the model/preview directory (SMB/NFS) and set `ERP_UPLOAD_DIR` +
    `ERP_CAD_WORKER_PREVIEW_DIR` to the mounted paths, **or**
  * run the worker on the Linux host and expose the Windows converter to it —
    unnecessary complexity; the shared-DB split above is the supported shape.
* The worker still opens no port. Only the ERP is reachable from the network.

Never expose the worker, and never install SolidWorks desktop automation on a
production server unless it is explicitly licensed and verified to be required.

---

## 5. Docker / Docker Compose (optional)

The ERP itself is not containerised in this repository, so this is guidance, not
a mandatory file: add a service for the worker when you containerise the backend.

```yaml
services:
  erp-backend:
    image: erp-backend:1.0.0
    environment:
      ERP_DATABASE_URL: jdbc:mysql://mysql:3306/erp_db?useSSL=false
      ERP_DATABASE_USERNAME: erp_app
      ERP_DATABASE_PASSWORD: ${ERP_DB_PASSWORD}
      ERP_UPLOAD_DIR: /data/uploads
    volumes: ["erp-data:/data"]
    depends_on: [mysql]
    # the only service published by the reverse proxy

  cad-worker:
    image: erp-cad-worker:1.0.0        # erp-backend image + FreeCAD, if used
    command: ["java", "-jar", "/app/erp-backend-1.0.0.jar"]
    environment:
      ERP_CAD_WORKER_MODE: "true"
      ERP_DATABASE_URL: jdbc:mysql://mysql:3306/erp_db?useSSL=false
      ERP_DATABASE_USERNAME: erp_app
      ERP_DATABASE_PASSWORD: ${ERP_DB_PASSWORD}
      ERP_UPLOAD_DIR: /data/uploads
      ERP_CAD_WORKER_TEMP_ROOT: /var/tmp/cad-jobs
      ERP_CAD_WORKER_MAX_CONCURRENT: "1"
    volumes: ["erp-data:/data"]
    depends_on: [mysql]
    restart: always
    # NOTE: no `ports:` mapping — the worker must not be reachable from outside.

  mysql:
    image: mysql:8
    volumes: ["mysql-data:/var/lib/mysql"]
```

`docker-compose.yml` for the worker image needs FreeCAD on PATH, e.g.:

```dockerfile
FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends freecad \
 && rm -rf /var/lib/apt/lists/*
COPY erp-backend-1.0.0.jar /app/
WORKDIR /app
ENTRYPOINT ["java","-jar","/app/erp-backend-1.0.0.jar"]
```

(Stock FreeCAD still cannot import SLDPRT — see §1. This image only becomes
useful for SLDPRT with a build that ships a SolidWorks importer.)

### Reverse proxy

Only the ERP is published; the worker is internal by construction.

```nginx
location /v1/ { proxy_pass http://erp-backend:8080/v1/; }
```

No `/cad-api` route, no converter port: those belonged to the old, unauthenticated
design and are not part of this architecture.

---

## 6. Verify a deployment

```bash
TOKEN=$(curl -s -X POST http://<erp>/v1/auth/login -H 'Content-Type: application/json' \
        -d '{"email":"...","password":"..."}' | jq -r .data.token)

curl -s http://<erp>/v1/cad-conversion/health -H "Authorization: Bearer $TOKEN" | jq
```

Expect:

* `workerOnline: true` (a worker process is alive and heartbeating) — the worker's
  only liveness signal, since it has no port;
* `engines.sldprt.available: true` **only** where an engine really exists, with
  the engine name and provider;
* per-engine auto-detection detail — `cadmpeg`, `sat`, `freecad` and `solidworks`
  entries, each reporting `installed` / `enabled` / `available` (plus
  `cadmpeg.version` and the SAT `dependencies` chain) as booleans and file
  NAMES only — never server paths. Availability is re-detected from configuration
  and the filesystem on every call, so installing or removing an engine only
  needs a worker/ERP restart — never a source change;
* `queuedJobs` / `activeJobs` for queue depth.

Then queue a real conversion:

```bash
curl -s -X POST http://<erp>/v1/models/<id>/cad-conversion -H "Authorization: Bearer $TOKEN" | jq
curl -s http://<erp>/v1/cad-conversion/<jobId> -H "Authorization: Bearer $TOKEN" | jq
```

`QUEUED → PROCESSING → COMPLETED` with `previewUrl`, or `FAILED`/`UNSUPPORTED`
with a safe, single-line reason.

---

## 7. Configuration reference (all env-overridable)

| Property | Env var | Default | Meaning |
|---|---|---|---|
| `app.cad-convert.enabled` | `ERP_CAD_CONVERT_ENABLED` | `true` | master switch for the server-side job pipeline |
| `app.cad.worker.enabled` | `ERP_CAD_WORKER_ENABLED` | `true` | worker process runs/claims jobs |
| `app.cad.worker.max-concurrent-jobs` | `ERP_CAD_WORKER_MAX_CONCURRENT` | `1` | CPU/RAM ceiling — raise only with capacity headroom |
| `app.cad.worker.max-file-bytes` | `ERP_CAD_WORKER_MAX_FILE_BYTES` | `209715200` (200 MB) | input size cap |
| `app.cad.worker.timeout-seconds` | `ERP_CAD_WORKER_TIMEOUT_SECONDS` | `420` | hard per-job wall clock (must exceed engine timeout: FreeCAD 240 s, SolidWorks 300 s) |
| `app.cad.worker.poll-interval-ms` | `ERP_CAD_WORKER_POLL_MS` | `2000` | claim + heartbeat cadence |
| `app.cad.worker.stale-timeout-seconds` | `ERP_CAD_WORKER_STALE_TIMEOUT_SECONDS` | `600` | PROCESSING older than this with a dead worker is re-queued |
| `app.cad.worker.heartbeat-stale-seconds` | `ERP_CAD_WORKER_HEARTBEAT_STALE_SECONDS` | `60` | age at which `workerOnline` flips to false |
| `app.cad.worker.max-queued-jobs` | `ERP_CAD_WORKER_MAX_QUEUED` | `50` | queue bound (excess submissions get 429) |
| `app.cad.worker.temp-root` | `ERP_CAD_WORKER_TEMP_ROOT` | `${java.io.tmpdir}/cad-jobs` | staging root; jobs isolated in `<root>/<jobId>/input|output` |
| `app.cad.worker.preview-dir` | `ERP_CAD_WORKER_PREVIEW_DIR` | `<app.upload.dir>/cad-previews` | controlled GLB storage (never a public directory) |
| `app.cad.worker.allowed-file-types` | `ERP_CAD_WORKER_FILE_TYPES` | `sldprt,sldasm,sat` | what the worker accepts |
| `app.cad.worker.preview-retention-hours` | `ERP_CAD_WORKER_PREVIEW_RETENTION_HOURS` | `168` | unreferenced GLBs older than this are deleted |
| `app.cad.worker.job-retention-days` | `ERP_CAD_WORKER_JOB_RETENTION_DAYS` | `30` | finished job rows |
| `app.cad.worker.temp-retention-hours` | `ERP_CAD_WORKER_TEMP_RETENTION_HOURS` | `24` | orphaned staging directories |
| `app.cad.worker.id` | `ERP_CAD_WORKER_ID` | hostname | worker identity (heartbeat row key) |

Engine configuration (documented inline in
`src/main/resources/application.properties`):

| Property | Env var | Default | Meaning |
|---|---|---|---|
| `app.cad-convert.cadmpeg-enabled` | `ERP_CADMPEG_ENABLED` | `true` | enable the cadmpeg engine |
| `app.cad-convert.cadmpeg-path` | `ERP_CADMPEG_PATH` | *(blank = auto-discover)* | full path or bare command name of the cadmpeg executable |
| `app.cad-convert.cadmpeg-timeout-seconds` | `ERP_CADMPEG_TIMEOUT` | `300` | per-conversion cadmpeg timeout (**must stay below** `app.cad.worker.timeout-seconds`, default 420) |
| `app.cad-convert.freecad-enabled` | `ERP_FREECAD_ENABLED` | `false` | optional fallback engine |
| `app.cad-convert.freecad-command` | `ERP_FREECAD_COMMAND` | *(blank)* | FreeCADCmd path (only useful with a SolidWorks importer) |
| `app.cad-convert.freecad-timeout-seconds` | `ERP_FREECAD_TIMEOUT` | `240` | FreeCAD timeout |
| `app.cad-convert.sat-enabled` | `ERP_SAT_ENABLED` | `true` | enable the SAT (ACIS) engine (auto-detects its full dependency chain) |
| `app.cad-convert.sat-node-path` | `ERP_SAT_NODE_PATH` | *(blank = `node` on PATH)* | Node.js used by the SAT tessellator |
| `app.cad-convert.sat-tessellator-script` | `ERP_SAT_TESSELLATOR_SCRIPT` | *(blank = `tools/cad/sat/step-to-cadir.cjs`)* | STEP→CADIR helper |
| `app.cad-convert.sat-occt-module` | `ERP_SAT_OCCT_MODULE` | *(blank = Node resolution)* | absolute `occt-import-js` package dir for packaged deployments |
| `app.cad-convert.sat-timeout-seconds` | `ERP_SAT_TIMEOUT` | `300` | per-step SAT timeout (**must stay below** `app.cad.worker.timeout-seconds`, default 420) |

---

## 8. Security properties (by construction)

* All four CAD endpoints require a JWT and the production authorities
  (`PRODUCTION_VIEW` / `PRODUCTION_CREATE`); there is no anonymous route.
* The worker binds no port and loads no web/security layer — it cannot be
  addressed from outside the host.
* Job ids are opaque UUIDs; staging paths use the **job id**, never a file name.
* Generated preview file names are sanitised to `[A-Za-z0-9._-]` with leading
  dots/underscores stripped — path traversal cannot survive.
* Engines are invoked through `ProcessBuilder` argument arrays, never a shell
  string, so a file name can never become a command.
* Every job is size-capped, time-capped, and its staging directory is deleted on
  success, failure and timeout; a crashed worker's leftovers are swept hourly.
* Failure messages are single-line and path-stripped before they reach a client.
* Clients receive only authenticated application URLs (`/v1/models/{id}/3d`) —
  never a filesystem path and never `localhost:<port>`.

---

## 9. Operations

| Question | How |
|---|---|
| Is the worker alive? | `GET /v1/cad-conversion/health` → `workerOnline`, `workerHeartbeatAgeSeconds` |
| Queue depth | same endpoint → `queuedJobs`, `activeJobs` |
| A stuck job | worker restart re-queues its own PROCESSING rows immediately; anything older than `stale-timeout-seconds` is re-queued by the sweep, and after `max_attempts` it is FAILED with a safe reason |
| Disk growth | staging honours `temp-retention-hours`; previews are deleted once unreferenced and past `preview-retention-hours`; job rows past `job-retention-days` |
| Slow engine | lower `max-concurrent-jobs` to 1; jobs queue rather than thrash |
| Cache | the same model + same file checksum reuses an existing READY GLB; re-uploading a file resets the projection so a stale preview is never shown |
