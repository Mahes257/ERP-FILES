# Cross-Laptop Startup Diagnostic Report

**Project:** VishakTech ERP — React 19 + Vite 8 frontend, Spring Boot 3.4.13 backend, MySQL 8
**Repository root:** `C:/Users/Mahes/Desktop/Sri/erp-react` (`git rev-parse --show-toplevel`)
**Branch / HEAD:** `main` @ `93a76c3` ("Upload complete ERP source code", 2026-10-13)
**Audit date:** 2026-10-17
**Scope:** read-only investigation. No source, configuration, database, dependency or Git state was modified. The only files created are this report and `UNWANTED_TEMP_FILES_INVENTORY.md`.

> **Important limitation up front:** no log, screenshot, error message or environment dump from the second laptop was available. Therefore **no failure on the other laptop is "confirmed" in this report.** What is confirmed is the set of machine-specific prerequisites the project depends on and does not provision — the original laptop satisfies all of them; a fresh machine satisfies none. The ranked causes in §6 are evidence-backed hypotheses, each with the exact check needed to confirm it in minutes.

---

## 1. Executive summary

The application itself is healthy **on this laptop**: the backend is currently listening on `:8080`, MySQL 8.0 (`MySQL80`) is listening on `:3306`, a 97 MB runnable jar exists, the frontend lockfile is in sync, `node_modules` is installed, and the previous backend log ends with successful `HTTP 200` API calls.

The repository, however, **cannot bootstrap a new machine by itself**:

| # | Machine-specific dependency | Present on this laptop | Shipped in Git? | Fatal if missing? |
|---|---|---|---|---|
| 1 | `erp-backend/.env` (DB user/password, JWT secret) | Yes (640 B) | **No — git-ignored** (`.gitignore:45`) | **Yes** — context startup aborts |
| 2 | MySQL 8 server + database `erp_db` + 137 tables | Yes (service running, schema present) | **No** — no Flyway/Liquibase; `ddl-auto=validate` | **Yes** — startup aborts on schema validation |
| 3 | `node_modules/` | Yes (373 MB, 21,340 files) | **No — git-ignored** (`.gitignore:17`) | **Yes** — frontend cannot start |
| 4 | JDK 21+ | Yes (JDK 24 via `JAVA_HOME`, JDK 21 on `PATH`) | N/A | **Yes** — `release 21` compile failure |
| 5 | Node.js ≥ 22.12 (Vite 8 / Vitest 5 engines) | Yes (24.16.0) | N/A — no `engines`, no `.nvmrc` | **Yes** — Vite/Vitest refuse to run |
| 6 | Uncommitted work (243 changed files, 9,243 insertions) | Yes | **No** — not committed | Behaviour differs; may not compile if partially copied |
| 7 | Local database *data* (dumps ignored, `uploads/` ignored) | Yes (264 MB / 335 files) | **No** | No (empty app) but documents appear lost |
| 8 | Maven distribution cache | Yes (`~/.m2/wrapper/.../apache-maven-3.9.9`) | Wrapper is tracked, dist is not | Only first run needs network |

**Most likely explanation (High confidence, not yet confirmed):** the project was moved to the other laptop without the git-ignored runtime inputs — at minimum `.env`, `node_modules`, and/or the MySQL database — so the backend aborts on unresolved `${ERP_DATABASE_*}`/`${ERP_JWT_SECRET}` placeholders, or aborts one step later on `Schema-validation: missing table [...]`, while the frontend fails with `vite: not found` or a proxy `ECONNREFUSED` to `127.0.0.1:8080`.

**Second most likely (Medium-High):** the other laptop has a different Java/Node toolchain (JDK 17, JDK 8, or Node 18/20) and the build or dev server fails on version requirements that this laptop happens to satisfy.

**Third (Medium):** a hard-coded path from a *previous* machine is still committed — `start-dev.bat:2` points at `C:\Users\srima\OneDrive\Desktop\sri\erp-react`, which does not exist on either of the current machines.

No claim is made that the cross-laptop issue is solved.

---

## 2. Current project architecture

```
erp-react/                        (git repo root)
├── src/                          React 19 SPA (Vite 8, React Router 7, MUI-free custom CSS)
│   └── api/axiosInstance.js      baseURL = import.meta.env.VITE_API_URL || '/v1'
├── vite.config.js                dev server + same-origin proxy '/v1' → ERP_PROXY_TARGET (default http://localhost:8080)
├── .env                          LOCAL ONLY: VITE_API_URL=/v1, ERP_PROXY_TARGET=http://localhost:8080
├── .env.example                  tracked template
├── package.json / package-lock.json   lockfileVersion 3, 348 lock entries
├── start-all.bat                 Windows launcher (backend window + CAD worker + Vite :5174)
├── start-all.sh                   Bash launcher (same flow; logs discarded)
├── start-dev.bat                  LEFTOVER: hard-coded path from another machine
└── erp-backend/
    ├── pom.xml                   Spring Boot 3.4.13, java.version 21
    ├── mvnw / mvnw.cmd / .mvn/   Maven Wrapper 3.9.9 (jar + properties tracked)
    ├── .env                      LOCAL ONLY: ERP_PORT, ERP_BASE_URL, ERP_DATABASE_*, ERP_JWT_SECRET, ERP_UPLOAD_DIR
    ├── .env.example              tracked template (placeholders only)
    ├── src/main/resources/application.properties
    │     :9   spring.config.import=optional:file:.env[.properties]   ← relative to process CWD
    │     :15  server.port=${ERP_PORT:8080}
    │     :16  server.servlet.context-path=/v1
    │     :27  spring.datasource.url=${ERP_DATABASE_URL:jdbc:mysql://localhost:3306/erp_db?...}
    │     :28  spring.datasource.username=${ERP_DATABASE_USERNAME}    ← no default
    │     :29  spring.datasource.password=${ERP_DATABASE_PASSWORD}    ← no default
    │     :36  spring.jpa.hibernate.ddl-auto=${ERP_DDL_AUTO:validate}
    │     :46  app.jwt.secret=${ERP_JWT_SECRET}                       ← no default
    │     :55  app.upload.dir=${ERP_UPLOAD_DIR:uploads}               ← relative to CWD
    ├── docs/schema_baseline.sql  TRACKED, 137 CREATE TABLE statements (fresh-DB source of truth)
    ├── docs/mysql-app-user.sql   TRACKED, creates erp_db + least-privilege erp_app user
    ├── uploads/                  264 MB, 335 files, 4 subdirs — LOCAL USER DATA
    ├── target/                   152 MB build output incl. 97 MB jar
    └── erp_db_*.sql              ≈1.5 MB of LOCAL DB dumps (git-ignored)
```

Runtime topology:

```
Browser → Vite dev server (:5174 via start scripts, :5173 by default)
        → proxy '/v1' → Spring Boot (:8080, context path /v1)
        → HikariCP → MySQL 8 (:3306, erp_db)
        → file storage: <CWD>/uploads (+ drawings/models/processing-jobs/cad-previews)
Optional: CAD worker JVM (same jar, --erp.cad.worker.mode=true, no port)
```

Health endpoints: `/v1/actuator/health` (used by both start scripts) and the application `HealthController` (`/health`, i.e. `/v1/health` under the context path). Frontend calls only `/v1/...`, so there is **no browser-side CORS dependency** in development — but direct cross-origin calls are still restricted to `http://localhost:5173-5176` and `127.0.0.1:5173-5174` (`application.properties:144`).

---

## 3. Original laptop vs other laptop

### 3.1 Original laptop — measured in this session

| Item | Value | Evidence |
|---|---|---|
| OS / shell | Windows, Git Bash (MINGW) | `pwd` → `/c/Users/Mahes/...` |
| `java` on `PATH` | OpenJDK **21.0.12.1** (Microsoft) | `java -version` |
| `JAVA_HOME` | `C:\Program Files\Java\jdk-24` (JDK **24**) | `echo $JAVA_HOME`, `$JAVA_HOME/bin/java -version` |
| Maven used by wrapper | Apache Maven **3.9.9**, Java **24** runtime | `./mvnw -v` |
| System `mvn` | not installed (`mvn: command not found`) | wrapper is mandatory and present |
| Node / npm | **24.16.0** / **11.13.0** | `node -v`, `npm -v` |
| MySQL | **8.0**, service `MySQL80` **Running**, binary `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe` | `Get-Service`, `Get-CimInstance Win32_Service` |
| Ports | `:3306` LISTENING (PID 6028), `:8080` LISTENING (PID 41448) | `netstat -ano` |
| Running backend | `java.exe … com.vishatech.erp.ErpApplication` (spawned by `spring-boot:run`, temp argfile) | `Get-CimInstance Win32_Process` |
| Frontend | Vite 8.2.0 installed; `dist/` built 2026-10-17 14:38 | `node_modules/vite/package.json`, `ls -ld dist` |
| Dependencies | `node_modules` present (240 top-level packages) | `ls node_modules` |
| Backend build | `target/erp-backend-1.0.0.jar` 97 MB (2026-10-14) | `ls -lh erp-backend/target` |
| Env files | `.env`, `erp-backend/.env`, `.env.ui-test` present (all git-ignored) | `git check-ignore -v` |
| DB schema | 137-table baseline tracked; backend validates at startup | `docs/schema_baseline.sql`, successful `/v1` 200s in `backend-8080.log` |
| Upload storage | `erp-backend/uploads` 264 MB / 335 files; root `uploads/drawings` empty | `du`, `find` |
| Git state | 188 modified, 47 renamed+modified, 9 deleted, 1 added, 129 untracked, 1 renamed | `git status --porcelain` |
| Line endings | `core.autocrlf=true`, `.gitattributes` `* text=auto eol=lf`; scripts are LF | `git config`, `grep -c $'\r'` |

### 3.2 Other laptop — **not provided**

No information was supplied. The following are unknown and required (commands in §12): OS version, JDK version and `JAVA_HOME`, Node/npm version, whether MySQL is installed/running, whether `erp_db` exists and has tables, whether `.env` files were copied or typed, whether `node_modules` exists, the exact console/browser error text, and how the project was transferred (Git clone vs. zip/OneDrive copy).

Because of this, this report separates **confirmed facts about the repository** from **hypotheses about the failure**.

---

## 4. Environment compatibility matrix

| Component | Required by project | Evidence | Local | Fresh-machine risk | Failure symptom if wrong |
|---|---|---|---|---|---|
| JDK | **21+** (`<java.version>21</java.version>`) | `pom.xml:24`; CI `java-version: '21'` | 24 (wrapper), 21 (PATH) | JDK 17 or 8 installed | `error: invalid target release: 21` / `release version 21 not supported` |
| `JAVA_HOME` | Must point at the JDK the wrapper should use | `mvnw` script | JDK 24 | Points to removed/other JDK | `JAVA_HOME is not defined correctly` / `UnsupportedClassVersionError` |
| Maven | Wrapper 3.9.9 (no system Maven needed) | `.mvn/wrapper/maven-wrapper.properties` | cached in `~/.m2/wrapper` | No cache and no network | `Could not transfer artifact …` / wrapper download failure |
| Node.js | **^20.19.0 or ≥22.12.0** (Vite 8); **^22.12 / ^24 / ≥26** (Vitest 5) | `node_modules/vite/package.json engines`, `node_modules/vitest/package.json engines` | 24.16.0 | Node 18, or Node 20 < 20.19, or Node 22 < 22.12 | `You are using Node.js 18.x. Vite requires Node.js version 20.19+ or 22.12+` |
| npm | Lockfile v3 → npm 7+; use `npm ci` | `package-lock.json`, CI runs `npm ci` | 11.13.0 | `npm install` mutating the tree; old npm | lockfile/shrinkwrap errors; nondeterministic install |
| MySQL | **8.x** | `docs/database-deployment.md` §2 | 8.0 running | Not installed / not started / 5.7 | `Communications link failure` / `Connection refused` |
| DB schema | `erp_db` with **all** mapped tables | `ddl-auto=validate`; `schema_baseline.sql` 137 tables | present | Empty or partial DB | `Schema-validation: missing table [attachment_storage_usage]` |
| DB credentials | `erp_app` user + password in env | `application.properties:28-29` (no defaults) | in `.env` | Missing `.env`; user not created | `Could not resolve placeholder 'ERP_DATABASE_USERNAME'` / `Access denied for user 'erp_app'@'localhost'` |
| JWT secret | `ERP_JWT_SECRET`, ≥32 bytes | `application.properties:46` (no default) | in `.env` | Missing | `Could not resolve placeholder 'ERP_JWT_SECRET'`; `JwtService` startup exception |
| Env loading | `spring.config.import=optional:file:.env[.properties]` **relative to CWD** | `application.properties:9`; `docs/environment-configuration.md` §1.3 | backend launched from `erp-backend/` | Backend launched from repo root or IDE with root CWD | Placeholders unresolved even though `.env` exists one directory away |
| Ports | backend `8080`, frontend `5173–5176` | `application.properties:15`; `start-all.*` use `5174` | 8080 busy (the app), 5174 free | Another process on 8080 | `Web server failed to start. Port 8080 was already in use.` |
| Proxy target | `http://localhost:8080` | `vite.config.js:9,26-28`; `.env` | matches | `.env` absent → default still correct; wrong `ERP_PROXY_TARGET` → refused | Proxy `ECONNREFUSED 127.0.0.1:8080` |
| Storage | `<CWD>/uploads` (+ models/drawings) | `application.properties:55,66-67`; `FileStorageService` `Files.createDirectories` | `erp-backend/uploads` | Different CWD → new empty folder | Files “disappear”; new uploads land elsewhere |
| Optional keys | `VITE_GOOGLE_MAPS_API_KEY`, CAD engine paths | `.env.example`, `application.properties:198-253` | not set | not set | Map/CAD features fail; **not** a startup failure |

---

## 5. Confirmed startup failures

### 5.1 On this laptop

**None observed.** Positive evidence:

* Port `8080` is held by `com.vishatech.erp.ErpApplication` (PID 41448) and has been serving requests.
* `backend-8080.log` (146 KB, 2026-10-15) ends with successful module API calls, e.g. `GET /v1/marketing/dashboard/active-trips -> 200`.
* `target/erp-backend-1.0.0.jar` (97 MB) exists; `target/classes` contains 1,032 class files.
* 119 verification logs under `tmp/` and 14 under the parent `tmp/` contain **zero** occurrences of `APPLICATION FAILED TO START`, `Could not resolve placeholder`, `Schema-validation`, `Communications link failure`, `Port 8080 was already in use`, or `Access denied for user`.

### 5.2 On the other laptop

**Not captured.** No logs were supplied. This report therefore does not assert a specific observed error; it lists the exact failure modes the code will produce, quoted from the project's own documentation and Spring/Hibernate behaviour, so they can be matched against whatever the other laptop shows.

### 5.3 Documented failure modes (for matching)

| Stage | Trigger | Expected message | Source of the text |
|---|---|---|---|
| Backend context refresh | Missing `ERP_DATABASE_USERNAME` / `ERP_DATABASE_PASSWORD` / `ERP_JWT_SECRET` | `Could not resolve placeholder 'ERP_DATABASE_USERNAME' in value "${ERP_DATABASE_USERNAME}"` | `application.properties:28-29,46`; documented in `docs/environment-configuration.md` §1 |
| Backend context refresh | `.env` not on the process CWD | same as above, even though the file exists in `erp-backend/` | `application.properties:9` (relative import) |
| Backend context refresh | MySQL down / wrong host / wrong port | `com.mysql.cj.jdbc.exceptions.CommunicationsException: Communications link failure` (Hikari `Connection refused`) | JDBC URL default `localhost:3306` |
| Backend context refresh | DB exists, schema missing/drifted | `Schema-validation: missing table [attachment_storage_usage]` | quoted from `docs/database-deployment.md` |
| Backend context refresh | User/password wrong or user lacks grants | `java.sql.SQLException: Access denied for user 'erp_app'@'localhost'` | `mysql-app-user.sql` grants |
| Backend web server | Another process owns 8080 | `Web server failed to start. Port 8080 was already in use.` | `server.port` fixed at 8080 |
| Backend compile | JDK < 21 | `error: invalid target release: 21` | `pom.xml:24` |
| Backend compile | Clone at HEAD lacks working-tree refactors | `package com.vishatech.erp.crm.entity does not exist` (and similar) | see §6 R6 |
| Frontend install | No `node_modules` | `sh: vite: not found` / `'vite' is not recognized as an internal or external command` | `package.json:7` |
| Frontend dev server | Node below engine range | `You are using Node.js … Vite requires Node.js version 20.19+ or 22.12+` | installed `vite` engines |
| Browser / proxy | Backend not listening | `http proxy error: /v1/... ECONNREFUSED 127.0.0.1:8080` and failed XHRs | `vite.config.js:26-28` |
| Launcher | `start-dev.bat` used | `The system cannot find the path specified.` | `start-dev.bat:2` hard-coded path |

**Meaning of `ECONNREFUSED`:** the TCP connect was actively rejected. In this project it means the **Vite proxy could not reach `127.0.0.1:8080`** — i.e. the Spring Boot process is not running, is still starting, crashed, or is bound elsewhere. It is **not** a CORS error and **not** a database error; those produce different symptoms (CORS: browser blocks with no request reaching the server; DB: backend logs a Hikari exception while the port still accepts connections). Check `netstat -ano | findstr :8080` and the backend window first.

---

## 6. Root-cause analysis (ranked)

Each item is marked **[CONFIRMED CONDITION]**, **[LIKELY]**, or **[UNVERIFIED]**. "Confirmed condition" means the machine-specific dependency is proven from the repository — not that it caused the reported failure, which cannot be proven without the other laptop's evidence.

### R1 — Git-ignored `.env` files are required at startup **[CONFIRMED CONDITION — highest priority]**

1. **Exact error:** `Could not resolve placeholder 'ERP_DATABASE_USERNAME'` (or `'ERP_DATABASE_PASSWORD'`, `'ERP_JWT_SECRET'`).
2. **Stage:** Spring context refresh, before the web server starts.
3. **Component:** backend configuration.
4. **Files:** `application.properties:9` (optional relative import), `:28-29` (no defaults), `:46` (no default); `.gitignore:41` (`.env`), `:42` (`.env.*`), `:45` (`erp-backend/.env`); `.env.example` / `erp-backend/.env.example` are the only tracked variants.
5. **Evidence:** both real `.env` files exist locally and are ignored:
   * `erp-backend/.env` — keys `ERP_PORT, ERP_BASE_URL, ERP_DATABASE_URL, ERP_DATABASE_USERNAME, ERP_DATABASE_PASSWORD, ERP_JWT_SECRET, ERP_UPLOAD_DIR, ERP_EXCHANGE_API_URL`
   * `.env` — `VITE_API_URL=/v1`, `ERP_PROXY_TARGET=http://localhost:8080`
   `git check-ignore -v` confirms `.gitignore:41` and `:45`. `docs/environment-configuration.md` §1.2-1.3 states secrets live only in ignored files and that a missing `.env` is *optional* only in the sense that the file is not required — the **variables** still are.
6. **Why the other laptop:** a `git clone` (or `git archive`) produces **no** `.env`. Even a zip copy can omit hidden files depending on the tool.
7. **Why this laptop:** `.env` files were created manually and remain on disk; `spring-boot:run` is launched from `erp-backend/`, so the relative import resolves.
8. **Confidence:** **High** that a missing `.env` blocks startup. Whether it is *the* reported failure is unverified.
9. **Minimal fix:** copy `erp-backend/.env.example` → `erp-backend/.env` on the new laptop and fill the four mandatory values; copy `.env.example` → `.env` for the frontend (defaults are already correct). Never commit the filled files.
10. **Verification:** in `erp-backend`, `./mvnw -v` then `./mvnw spring-boot:run`; the placeholder error must disappear. A successful start then requires R2 to be satisfied.

### R2 — The database is not created by the application; `ddl-auto=validate` requires an existing schema **[CONFIRMED CONDITION]**

1. **Exact error:** `Schema-validation: missing table [attachment_storage_usage]` (any mapped table can be named).
2. **Stage:** Hibernate `SessionFactory` initialization during context refresh.
3. **Component:** MySQL / JPA.
4. **Files:** `application.properties:36` (`ddl-auto=${ERP_DDL_AUTO:validate}`, no `create`/`update` default); no Flyway or Liquibase dependency in `pom.xml`; `docs/database-deployment.md` §1-§3; `docs/schema_baseline.sql` (137 `CREATE TABLE`); `docs/mysql-app-user.sql`.
5. **Evidence:** grep for `flyway|liquibase` in `pom.xml` → none. `docs/database-deployment.md` explicitly states the app never creates or alters the schema and that every mapped table must exist. The database name is `erp_db` (`application.properties:27`) and is **not** auto-created (`createDatabaseIfNotExist` removed by design, per the comment at `:25-26`).
6. **Why the other laptop:** a new MySQL install has no `erp_db`; even after `CREATE DATABASE`, the 137 tables are absent unless `schema_baseline.sql` was imported.
7. **Why this laptop:** the schema was created earlier and validated on every start (the running backend proves validation passes here).
8. **Confidence:** **High** as a blocker on a fresh machine.
9. **Minimal fix:** run `mysql-app-user.sql` (after setting a real password) and then `schema_baseline.sql` against `erp_db`; do **not** switch to `ERP_DDL_AUTO=update` on a shared DB.
10. **Verification:** `SHOW TABLES;` returns ~137 rows; start the backend and confirm no `Schema-validation` line.

### R3 — `node_modules` is absent from Git; frontend cannot start without installation **[CONFIRMED CONDITION]**

1. **Exact error:** `sh: vite: not found` (Git Bash) / `'vite' is not recognized…` (cmd) when running `npm run dev`.
2. **Stage:** frontend start.
3. **Component:** Vite/React.
4. **Files:** `.gitignore:17` (`node_modules/`); `package.json:7` (`"dev": "vite"`); `package-lock.json` tracked and **in sync** (verified programmatically: every `dependencies`/`devDependencies` spec matches the lock root; 348 package entries, lockfileVersion 3).
5. **Evidence:** `node_modules` is 373 MB / 21,340 files locally and ignored; lockfile and `package.json` agree, so a reproducible `npm ci` is possible.
6. **Why the other laptop:** clone has no `node_modules`; if the user never ran an install (or ran `npm ci` in the wrong directory), Vite is missing.
7. **Why this laptop:** dependencies were installed at some point and persist.
8. **Confidence:** **High** if no install was run.
9. **Minimal fix:** from the repo root, `npm ci` (preferred; requires Node ≥ 22.12 for the dev/test toolchain). Do not copy `node_modules` between machines.
10. **Verification:** `npx vite --version` prints `8.2.0`; `npm run dev` binds a port.

### R4 — Java toolchain mismatch (`java.version` 21) **[LIKELY]**

1. **Exact error:** `error: invalid target release: 21` or `release version 21 not supported`.
2. **Stage:** Maven compile.
3. **Component:** JDK.
4. **Files:** `pom.xml:24` (`<java.version>21</java.version>`); CI `java-version: '21'`; Lombok annotation processor is declared explicitly and the comment notes JDK 21 and 24 both work.
5. **Evidence:** this laptop has **two** JDKs: `PATH` → 21.0.12.1, `JAVA_HOME` → `jdk-24`; the wrapper uses `JAVA_HOME` (Maven reports Java 24). That mismatch alone proves the toolchain is environment-driven, not project-pinned.
6. **Why the other laptop:** only JDK 17/8 installed, or `JAVA_HOME` unset/pointing at a JRE.
7. **Why this laptop:** both JDK 21 and 24 are installed; either satisfies the target.
8. **Confidence:** **Medium-High** (common on Windows dev machines).
9. **Minimal fix:** install JDK 21 (Temurin or Microsoft), set `JAVA_HOME` to it, reopen the terminal, keep `%JAVA_HOME%\bin` on `PATH`.
10. **Verification:** `./mvnw -v` reports `Java version: 21` and `./mvnw -q -DskipTests compile` succeeds.

### R5 — Node.js version below the Vite/Vitest engine range **[LIKELY]**

1. **Exact error:** `You are using Node.js 18.x. Vite requires Node.js version 20.19+ or 22.12+.` (or a Vitest engine error).
2. **Stage:** frontend dev server / tests.
3. **Component:** Node.
4. **Files:** `package.json` (no `engines` field, no `.nvmrc`); installed `vite@8.2.0` engines `^20.19.0 || >=22.12.0`; `vitest@5.0.4` engines `^22.12.0 || ^24.0.0 || >=26.0.0`.
5. **Evidence:** engine strings read from `node_modules/*/package.json`; CI pins Node 22 (`ci.yml`, `node-version: '22'`).
6. **Why the other laptop:** Node 18 LTS or Node 20.11 installed; the project gives no early warning because `engines` is absent.
7. **Why this laptop:** Node 24.16.0 satisfies both.
8. **Confidence:** **Medium**.
9. **Minimal fix:** install Node 22.12+ or 24 LTS; use `npm ci`.
10. **Verification:** `node -v`, then `npm run dev` starts without an engine error.

### R6 — The working build depends on 243 uncommitted file changes **[CONFIRMED CONDITION; effect on the other laptop depends on transfer method]**

1. **Exact error:** if a *partial* copy was made (tracked files only from the working tree, or old commit + some new files): `package com.vishatech.erp.crm.entity does not exist`, `cannot find symbol`, duplicate-class errors. If a clean clone at HEAD was made: it compiles, but is the 2026-10-13 codebase (no CRM/Production/Dashboard modularisation).
2. **Stage:** compile (partial copy) or normal run with missing features (clean clone).
3. **Component:** whole backend.
4. **Files:** `git status`: 188 modified, 47 renamed+modified, 9 deleted, 1 added, 129 untracked, 1 renamed; `git diff --stat` → **243 files changed, 9,243 insertions(+), 4,234 deletions(-)**.
5. **Evidence (examples):** deleted `controller/DashboardController.java`, `entity/ProductionTracker.java`, `service/QualityInspectionService.java`; renames `controller/ContactController.java → crm/controller/ContactController.java`; 129 untracked files (tests, migrations, reports).
6. **Why the other laptop:** `git clone`/`git pull` transfers **only committed** state. Anything copied file-by-file can easily mix old and new packages.
7. **Why this laptop:** the running jar/classes were built from the working tree, so all refactors are present.
8. **Confidence:** **High** that the two machines do not run identical code; whether that produces a *startup error* is unverified (a clean clone should still start, just older).
9. **Minimal fix:** commit and push the intended work (or transfer a full archive of the working tree) and have the other laptop use that exact revision. This is a Git decision for the owner; nothing was staged or committed here.
10. **Verification:** compare `git rev-parse HEAD` and `git status --porcelain | wc -l` on both machines — they must match, and the second should be clean.

### R7 — MySQL not installed, not running, or on a non-default port **[LIKELY]**

1. **Exact error:** `Communications link failure` / `Connection refused: connect`.
2. **Stage:** Hikari pool initialisation.
3. **Component:** MySQL.
4. **Files:** `application.properties:27` (default `localhost:3306/erp_db`); `start-all.bat:34` exits with `[ERROR] MySQL is not running on port 3306.` if nothing listens.
5. **Evidence:** MySQL 8.0 service is running here; the other laptop's status is unknown.
6. **Why the other laptop:** MySQL not installed, service stopped, or listening only on a named pipe / different port.
7. **Why this laptop:** `MySQL80` is Running and `:3306` is LISTENING (PID 6028).
8. **Confidence:** **High** if MySQL was never installed there.
9. **Minimal fix:** install MySQL 8, start the service, create `erp_db` + `erp_app`, import the baseline.
10. **Verification:** `Get-Service MySQL80`, `netstat -ano | findstr :3306`, then start the backend.

### R8 — Port 8080 already occupied **[LIKELY, conditional]**

1. **Exact error:** `Web server failed to start. Port 8080 was already in use.`
2. **Stage:** embedded Tomcat start, after the context is otherwise healthy.
3. **Component:** backend.
4. **Files:** `application.properties:15` (`server.port=${ERP_PORT:8080}`); `.env` sets `ERP_PORT=8080`; `start-all.bat:80-84` skips starting if 8080 is listening (so a stale/foreign process would be silently reused).
5. **Evidence:** 8080 is occupied on this laptop by the ERP itself; on another laptop any other service (Docker, another Spring app, IIS) can take it.
6. **Why the other laptop:** foreign listener, or a previous backend instance left running.
7. **Why this laptop:** the listener *is* the ERP.
8. **Confidence:** **Medium**.
9. **Minimal fix:** stop the other process, or set `ERP_PORT=8081` **and** `ERP_PROXY_TARGET=http://localhost:8081` together.
10. **Verification:** `netstat -ano | findstr :8080` and match the PID to its process name.

### R9 — `start-dev.bat` contains a hard-coded path from a different machine **[CONFIRMED CONDITION]**

1. **Exact error:** `The system cannot find the path specified.`
2. **Stage:** launcher, before any build.
3. **Component:** developer script.
4. **File:** `start-dev.bat:2` →
   `cd /d C:\Users\srima\OneDrive\Desktop\sri\erp-react`
   and a log path under `…\sri\.freebuff\preview-ec4bb5d4-….log`.
5. **Evidence:** file is **tracked** (present since `Initial ERP project`), 191 bytes, LF line endings; the user `srima` does not exist on this machine (`C:\Users\Mahes`).
6. **Why the other laptop:** it cannot have `C:\Users\srima\...` either.
7. **Why this laptop:** the file is never used here — `start-all.bat` / `start-all.sh` are used instead, so the defect is invisible locally.
8. **Confidence:** **High** that this file fails everywhere except the machine it was written on; whether it was used on the other laptop is unverified.
9. **Minimal fix:** do not use it; later, delete it or make it path-relative (`cd /d "%~dp0"`). Not changed in this task.
10. **Verification:** `type start-dev.bat`.

### R10 — `start-all.sh` hides backend failures and its port checks are broken on Windows **[CONFIRMED CONDITION; masking effect]**

1. **Exact error:** none from the script itself — it prints `[WARN] ERP backend did not report healthy within 120 seconds. Continuing anyway…`, then starts Vite, and the browser shows proxy `ECONNREFUSED`.
2. **Stage:** launcher.
3. **Component:** developer script.
4. **Files:** `start-all.sh:83` (`./mvnw spring-boot:run &>/dev/null &`), `:120` (CAD worker likewise), `:53` and `:81` (`netstat -tlnp`), `:148` (`npm run dev -- --port 5174`).
5. **Evidence:** running `netstat -tlnp` in this Git Bash prints only the Windows `netstat` help text (exit 0, no data), because `-t`/`-l`/`-p` are not supported together on Windows. Therefore the `:3306` and `:8080` checks never detect a listener, the "MySQL may not be running" warning always appears, and a **second** backend may be launched into a port conflict — all with stdout/stderr sent to `/dev/null`.
6. **Why the other laptop:** same script, same masking; the real error never reaches the console.
7. **Why this laptop:** `start-all.bat` is used (visible backend window, working `netstat -an` checks), or the backend is already running.
8. **Confidence:** **High** for the script defects (reproduced); **Medium** that they obscured the other laptop's error.
9. **Minimal fix:** use `start-all.bat` on Windows, or run the backend in its own terminal to see the log; later, fix the checks and stop redirecting to `/dev/null`.
10. **Verification:** run `bash start-all.sh` and observe the permanent `[WARN] MySQL may not be running` despite MySQL running.

### R11 — Upload storage path is working-directory-dependent **[CONFIRMED CONDITION; data-visibility, not startup]**

1. **Exact error:** none; documents/attachments appear missing or writes land in a new folder.
2. **Stage:** runtime, first upload/download.
3. **Component:** file storage.
4. **Files:** `application.properties:55` (`app.upload.dir=${ERP_UPLOAD_DIR:uploads}`), `:66-67` (models/drawings under it); `FileStorageService` creates the directory with `Files.createDirectories`.
5. **Evidence:** `erp-backend/uploads` holds 264 MB / 335 files; a **second, empty** `uploads/drawings` exists at the repo root — proof the app has been started from both working directories.
6. **Why the other laptop:** if started from the repo root (or an IDE with root CWD), it creates `<root>/uploads` and sees **none** of the existing documents.
7. **Why this laptop:** normally started with CWD `erp-backend`, matching where the files are.
8. **Confidence:** **High** for the mechanism; impact is “existing attachments missing”, not a crash.
9. **Minimal fix:** always start the backend from `erp-backend/`, or set `ERP_UPLOAD_DIR` to one absolute path on each machine; copy the uploads folder only if the data is wanted.
10. **Verification:** `GET /v1/files/storage` and compare the reported directory with `ERP_UPLOAD_DIR`.

### R12 — Optional integration configuration (feature-level, not startup) **[UNVERIFIED impact]**

* `VITE_GOOGLE_MAPS_API_KEY` is absent from local `.env` (`.env.example` documents it) → Marketing map/geocoding features degrade.
* CAD engines (`FreeCAD`, `CADmpeg`, SAT/OCCT node modules) are configured with blank paths (`application.properties:198-253`); `tools/cad/sat/step-to-cadir.cjs` is required and tracked, but is resolved from CWD and its parents, so a different CWD can break SAT conversion. The CAD worker is started by both launchers; if it fails, the launchers only warn.
* These do not prevent login or the ERP UI from working.

### 6.1 Not the cause (explicitly checked)

* **CORS**: development traffic is same-origin through the Vite proxy (`vite.config.js:20-31`); the allowlist already includes `5173–5176` and `127.0.0.1` equivalents. A CORS misconfiguration would not produce `ECONNREFUSED`.
* **Frontend API base URL**: `.env` uses `VITE_API_URL=/v1`, a relative path — no machine name, IP or port is baked into the bundle (the built `dist/assets/mapConfig-*.js` also contains `/v1`).
* **Maven wrapper availability**: wrapper script **and** `maven-wrapper.jar` are tracked, so no system Maven is required.
* **Duplicate Spring beans / context conflicts**: no evidence; the context starts here.
* **`package-lock.json` drift**: verified in sync with `package.json`; `npm ci` is safe.
* **Line endings**: `mvnw`, `start-all.sh`, the `.bat` files and `ci.yml` are LF in the working tree; `.gitattributes` normalises text to LF and forces CRLF for `*.bat`/`*.cmd` on checkout, so CRLF is unlikely to be the cause on a Git clone (it can still bite a zip/OneDrive copy).

---

## 7. Backend and frontend connectivity findings

| Path | Value | Evidence |
|---|---|---|
| Backend listen port | `8080` (`ERP_PORT` override) | `application.properties:15`; `:8080` LISTENING |
| Context path | `/v1` | `application.properties:16` |
| Health | `http://localhost:8080/v1/actuator/health` | `start-all.sh:9`, `start-all.bat:28` |
| Frontend proxy | `'/v1' → ERP_PROXY_TARGET || http://localhost:8080`, `changeOrigin`, `ws: true` | `vite.config.js:26-30` |
| Frontend API base | `VITE_API_URL || '/v1'` (relative) | `src/api/axiosInstance.js:26` |
| Frontend port | Vite default `5173`; launchers force `5174`; no `strictPort` | `vite.config.js`, `start-all.*` |
| CORS allowlist | `localhost:5173-5176`, `127.0.0.1:5173-5174`, `4173` | `application.properties:144` |
| Auth | JWT bearer; `401` for missing/expired token, `403` for insufficient role | security layer (separate audit) |
| Wrong API host | Only if `ERP_PROXY_TARGET` is overridden in `.env`; default is correct | `.env` value verified |

`src/purchase/services/browserBadgeValidation.js:12` hard-codes `http://localhost:5173` while the launchers serve **5174**. This is a developer tooling inconsistency, not a startup blocker; it will misbehave whenever that helper is used.

---

## 8. Database setup requirements

1. **MySQL 8.x** installed and running on `localhost:3306` (service `MySQL80` here).
2. **Database** `erp_db`, `utf8mb4` / `utf8mb4_unicode_ci` (`mysql-app-user.sql`).
3. **Application user** `erp_app` with `SELECT, INSERT, UPDATE, DELETE, INDEX` (+ `CREATE, ALTER, REFERENCES` for the one-time baseline import) — never `root` at runtime.
4. **Schema**: import `erp-backend/docs/schema_baseline.sql` **once** into the empty database (137 tables). There is **no** Flyway/Liquibase; incremental `docs/*_migration.sql` scripts are for existing databases only.
5. **Configuration**: `ERP_DATABASE_URL`, `ERP_DATABASE_USERNAME`, `ERP_DATABASE_PASSWORD`, `ERP_JWT_SECRET` in `erp-backend/.env` (or OS environment). `ddl-auto` stays `validate`.
6. **Data**: none of the production data is in Git. `erp-backend/erp_db_backup_*.sql` (1.1 MB + 263 KB) and `erp-backend/erp_db_schema_latest.sql` (177 KB) are **ignored local dumps**, as is `uploads/` (264 MB). A fresh laptop gets an empty ERP; the default `DataSeeder` (`@Profile("!prod & !production")`, active by default) creates the initial users when the `users` table is empty.
7. **Do not** connect to or modify `erp_db` as part of diagnostics. Nothing in this audit connected to MySQL.

---

## 9. Missing configuration and file findings

| Finding | Impact | Evidence |
|---|---|---|
| Real `.env` files are not in Git | Backend refuses to start; frontend loses proxy override (default still works) | `.gitignore:41,42,45`; files present locally but ignored |
| `.env` is loaded relative to CWD | Starting from repo root or an IDE with root CWD silently skips `erp-backend/.env` and fails on placeholders | `application.properties:9`; `docs/environment-configuration.md` §1.3 |
| No schema migration tool | Every environment needs a manual baseline import; schema drift becomes a startup failure | no `flyway`/`liquibase` in `pom.xml`; `ddl-auto=validate` |
| No `engines` / `.nvmrc` | Node version problems surface only after `npm ci`/`npm run dev` | `package.json`; no `.nvmrc`/`.node-version` |
| README is the unmodified Vite template | A new developer has no pointer to `docs/database-deployment.md` or the env contract | `README.md` |
| `start-dev.bat` hard-coded to `C:\Users\srima\...` | Immediate failure if used; also leaks another machine's layout | `start-dev.bat:2`, tracked |
| `start-all.sh` discards backend logs and misuses `netstat` on Windows | Real failure hidden; duplicate backend attempts | `start-all.sh:53,81,83,120`; reproduced `netstat -tlnp` behaviour |
| Upload directory is CWD-relative | Existing files “missing” when launched elsewhere; two upload roots already exist | `application.properties:55`; `uploads/drawings` vs `erp-backend/uploads` |
| `archunit_store/` not ignored | Untracked generated directory appears in every `git status` | `erp-backend/archunit_store`; `.gitignore` has no rule |
| Database dumps ignored but required for *data* | New laptop has schema but no business data/users | `.gitignore:77-78`; `erp_db_*.sql` present locally |
| `package-lock.json` and wrapper jar **are** tracked | Good: reproducible install/build is possible | `git ls-files` checks |

---

## 10. Ranked recommended fixes (no changes applied)

Priority is “unblocks a fresh machine fastest”, not security severity.

| Rank | Fix | Effort | Why first |
|---|---|---|---|
| 1 | On the other laptop, confirm how the project arrived (clone vs copy). If clone: copy `erp-backend/.env.example` → `.env` and fill DB user/password + JWT secret; copy `.env.example` → `.env`. | 5 min | R1 is fatal and invisible in Git |
| 2 | Install MySQL 8, start it, run `mysql-app-user.sql` (with a real password) and `schema_baseline.sql`. | 20 min | R2 is the next fatal gate |
| 3 | Install Node 22.12+ (or 24) and run `npm ci` from the repo root. | 10 min | R3/R5 |
| 4 | Install JDK 21, set `JAVA_HOME`, reopen the shell; `./mvnw -v` must report 21+. | 10 min | R4 |
| 5 | Start with `start-all.bat` (not `start-dev.bat`, not `start-all.sh` on Windows) so backend errors stay visible. | 1 min | R9/R10 |
| 6 | Make both machines run the **same revision**: commit/push the 243 pending changes, or transfer a full working-tree archive; verify HEAD + clean status on both. | owner decision | R6 |
| 7 | If existing documents are needed, copy `erp-backend/uploads` and set one absolute `ERP_UPLOAD_DIR`; otherwise accept an empty document store. | 5 min | R11 |
| 8 | Later hardening: add `engines` + `.nvmrc`, a root `SETUP.md` (or README section), ignore `archunit_store/`, fix `start-dev.bat`, remove `/dev/null` redirection, make `.env` loading CWD-independent. | small | prevents recurrence |

No secrets or machine-specific absolute paths should be added to tracked files while doing this; the tracked `.env.example` files are the correct templates.

---

## 11. Safe step-by-step startup procedure for another Windows laptop

```powershell
# 0) Prerequisites (install once): JDK 21, Node 22.12+ or 24, MySQL 8, Git
java -version                 # expect 21.x or newer
echo %JAVA_HOME%              # must point at that JDK
node -v                       # expect v22.12+ or v24.x
npm -v
Get-Service MySQL80           # Status: Running

# 1) Get the code (same revision on both machines)
git clone <repo-url> erp-react
cd erp-react
git log -1 --oneline

# 2) Database (one time, empty DB only)
#    Edit docs/mysql-app-user.sql: replace the placeholder password.
mysql -u root -p < erp-backend\docs\mysql-app-user.sql
mysql -u erp_app -p erp_db < erp-backend\docs\schema_baseline.sql
mysql -u erp_app -p erp_db -e "SHOW TABLES;"      # expect ~137 tables

# 3) Backend configuration (never commit these files)
copy erp-backend\.env.example erp-backend\.env
notepad erp-backend\.env
#   ERP_DATABASE_USERNAME=erp_app
#   ERP_DATABASE_PASSWORD=<the password you set>
#   ERP_JWT_SECRET=<generate: openssl rand -base64 64>
copy .env.example .env
notepad .env            # VITE_API_URL=/v1 ; ERP_PROXY_TARGET=http://localhost:8080

# 4) Frontend dependencies (reproducible install)
npm ci

# 5) Start everything (visible backend window)
start-all.bat
#   Backend: http://localhost:8080/v1/actuator/health  -> {"status":"UP"}
#   Frontend: http://localhost:5174

# 6) If the backend window shows an error, start it manually to read the full log:
cd erp-backend
.\mvnw.cmd spring-boot:run
```

Startup order matters only in one direction: **backend before browser use**. The Vite server can start first, but every API call will fail until `:8080` is listening. The health check in `start-all.bat` already waits up to 120 s.

Expected ports: MySQL `3306`, backend `8080` (context `/v1`), frontend `5174` (or `5173` if started with plain `npm run dev`).

---

## 12. Commands to collect the missing diagnostic information

Run these **on the other laptop** and share the output (redact secrets; do not paste `.env` contents).

```powershell
# Toolchain
java -version 2>&1
echo %JAVA_HOME%
where java
node -v
npm -v
where node

# Project state
cd <project-root>
git rev-parse --show-toplevel
git rev-parse --short HEAD
git status --porcelain | Measure-Object -Line
dir node_modules            # exists?
dir erp-backend\.env        # exists?  (do NOT print contents)
dir package-lock.json
dir erp-backend\mvnw.cmd

# Ports / services
Get-Service MySQL80
netstat -ano | findstr ":3306"
netstat -ano | findstr ":8080"

# Database (read-only)
mysql -u erp_app -p -e "SELECT VERSION();"
mysql -u erp_app -p -e "SHOW DATABASES;"
mysql -u erp_app -p erp_db -e "SHOW TABLES;"    # ~137 expected
mysql -u erp_app -p erp_db -e "SELECT COUNT(*) FROM users;"

# Backend, with logs visible
cd erp-backend
.\mvnw.cmd -v
.\mvnw.cmd spring-boot:run
#   copy the first 40 lines after "APPLICATION FAILED TO START" or the first stack trace

# Frontend
cd ..
npm ci
npm run dev
#   copy the Vite banner and any proxy error line
```

Browser side: open DevTools → Network, reload, and report the failing request URL, status (`failed`, `500`, `401`, `404`), and the Console error. A `net::ERR_CONNECTION_REFUSED` on `/v1/...` points at the backend, not at React.

Also useful: the exact wording of whatever error the other laptop shows, and whether the app was transferred by `git clone`, zip, or OneDrive sync.

---

## 13. Verification status and limitations

### Performed (read-only)

* Repository discovery, `git rev-parse`, branch/HEAD, full `git status` and `git diff --stat`.
* Toolchain probing: `java -version`, `JAVA_HOME`, `$JAVA_HOME/bin/java -version`, `node -v`, `npm -v`, `./mvnw -v`, `netstat -tlnp` reproduction, `netstat -ano` listener check.
* Process inspection of the running backend (PID 41448) and MySQL (PID 6028); Windows service query for `MySQL80` and its binary path.
* Configuration reads: `application.properties` (secrets masked), `vite.config.js`, `package.json`, `package-lock.json`, `.gitignore`, `.gitattributes`, both `.env.example` files, `.env` **key names and non-secret values only**, `start-all.sh`, `start-all.bat`, `start-dev.bat`, `tmp-run-8099.sh`, `docs/database-deployment.md`, `docs/environment-configuration.md`, `docs/mysql-app-user.sql` (password masked).
* Dependency/toolchain compatibility: engine fields of installed `vite`, `vitest`, `@vitejs/plugin-react`; lockfile ↔ `package.json` sync check.
* Log scan: 119 logs in `tmp/`, 14 in parent `tmp/`, `backend-8080.log`, `.freebuff/backend-8080.err.log` for startup-failure patterns.
* Disk inventory: directory sizes, file counts, tracked/ignored status (see `UNWANTED_TEMP_FILES_INVENTORY.md`).

### Not performed (by scope or safety)

* Starting a second backend, stopping the running one, or restarting MySQL.
* Any connection to MySQL (no `SHOW TABLES`, no queries) — database safety rule.
* `npm install` / `npm ci` / `mvn package` / any dependency or build mutation.
* Any Git write operation (no stage, commit, checkout, clean).
* Any file deletion, move, or edit of application/config files.
* Reproducing the other laptop's failure — impossible without its environment or logs.

### Therefore

* Causes R1, R2, R3, R6, R9, R10, R11 are **confirmed as machine-specific conditions in the repository**; their role in the reported failure is **not confirmed**.
* R4, R5, R7, R8 are **likely** based on typical Windows setups and the project's hard requirements.
* R12 is **unverified** and feature-level only.
* The cross-laptop problem is **not solved** by this report. It identifies what to check and why, with exact commands, so the actual error can be confirmed in one pass.
