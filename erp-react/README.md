# VishakTech ERP

React/Vite frontend + Spring Boot backend + MySQL 8.

**Standard development ports** (do not change them):

| Service | Port | Notes |
|---|---|---|
| Spring Boot backend | **8080** | `server.port=${ERP_PORT:8080}` |
| Vite dev server | **5173** | pinned with `strictPort: true`; fails instead of moving ports |
| MySQL | 3306 | external service |

The browser calls relative `/v1` URLs; the Vite dev server proxies them to
`http://localhost:8080` (`ERP_PROXY_TARGET` overrides it for a deployment).

## Run it

On Windows: `setup.bat` once (prerequisite check, MySQL login prompt, local
`.env`, `npm ci`), then `start-all.bat` every day. Both are described below.

The manual steps (any OS) follow. New laptop / new database — the detailed procedure is
[erp-backend/docs/database-deployment.md](erp-backend/docs/database-deployment.md).
The database needs **one** schema file: `erp-backend/docs/database_setup.sql`.

```bash
# one-time: database + user + schema (see the guide for details)
mysql -u root -p < erp-backend/docs/mysql-app-user.sql
mysql -u erp_app -p erp_db < erp-backend/docs/database_setup.sql

# backend (port 8080) — copy erp-backend/.env.example to erp-backend/.env first
cd erp-backend && ./mvnw spring-boot:run

# frontend (port 5173), from the repository root
npm ci
npm run dev
```

`start-all.bat` (Windows) / `start-all.sh` start the backend, the CAD worker and
the frontend (5173) together and stop with a clear error if either port is busy.

## Set up on another Windows laptop (no Git needed)

The project runs from a copied folder or a ZIP. Transfer it **without** `.env`,
`node_modules`, `target`, `dist`, `uploads` or database dumps — see
[Create the portable ZIP](#create-the-portable-zip).

### Windows: one command first, one command every day

```bat
setup.bat        REM  first run only: checks Java/Node/npm/MySQL, asks for this
                 REM  laptop's MySQL login, writes erp-backend\.env, runs npm ci
start-all.bat    REM  every day: preflight + backend 8080 + CAD worker + frontend 5173
```

- `setup.bat -CheckOnly` inspects the machine and changes nothing.
- `setup.bat -Force` changes the MySQL login later; `-SkipInstall` skips `npm ci`.
- Nothing is guessed and nothing is created in MySQL: the wizard verifies that
  `erp_db` already exists (read-only `information_schema` count), and stops with
  instructions if it does not.
- The password prompt is hidden, the value goes only into the git-ignored
  `erp-backend\.env`, and a fresh JWT secret is generated once per installation
  (also never printed).
- `start-all.bat` runs the same checks first (config, JWT, MySQL reachability,
  busy ports) and refuses to start on a real problem instead of failing silently.

On macOS/Linux do the manual steps below; the scripts are Windows-only.

### If `erp_db` already has your data

Do **not** run `mysql-app-user.sql`, `database_setup.sql` or any migration on
that database. On the new laptop:

1. Confirm it is there (read-only):
   ```bat
   mysql -u <user> -p -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='erp_db';"
   ```
2. Use (or create) a MySQL login **on that laptop** with `SELECT, INSERT, UPDATE,
   DELETE, INDEX, CREATE, ALTER, REFERENCES` on `erp_db`. Never reuse this
   machine's password and never connect the app as `root`.
3. Configure the backend with that laptop's values, then continue from step 7:
   ```bat
   cd erp-backend
   copy .env.example .env
   ```
   Set `ERP_DATABASE_HOST`, `ERP_DATABASE_PORT`, `ERP_DATABASE_NAME=erp_db`,
   `ERP_DATABASE_USERNAME`, `ERP_DATABASE_PASSWORD` and a new `ERP_JWT_SECRET`.
   Leave `ddl-auto` at its `validate` default: the app then only *reads* the
   existing schema. Full details: [database-deployment.md §2b](erp-backend/docs/database-deployment.md#2b-existing-erp_db-on-another-laptop--connect-only-never-initialise).

### Fresh database (nothing installed yet)

1. **Install prerequisites:** JDK 21, Node.js 22 LTS (Vite 8 needs ≥ 20.19) and
   MySQL 8.x. Check with `java -version`, `node --version`, `mysql --version`.
2. **Extract** the ZIP into any folder, e.g. `C:\Projects\erp-react`. Avoid
   paths with unusual characters; the folder name does not matter.
3. **Start MySQL** (`services.msc` → `MySQL80` → Start) and confirm it listens
   on 3306.
4. **Create the database and user** (one-time, as MySQL administrator). Edit the
   placeholder password in `erp-backend\docs\mysql-app-user.sql` first, then:
   ```bat
   mysql -u root -p < erp-backend\docs\mysql-app-user.sql
   ```
5. **Create the schema** (one-time, the single setup file):
   ```bat
   mysql -u erp_app -p erp_db < erp-backend\docs\database_setup.sql
   ```
   Expect about 138 tables. Never run this file against an **existing** database
   that has data.
6. **Backend configuration** (one-time):
   ```bat
   cd erp-backend
   copy .env.example .env
   ```
   Edit `erp-backend\.env` and set `ERP_DATABASE_PASSWORD` to the password from
   step 4 and `ERP_JWT_SECRET` to a new random value
   (`openssl rand -base64 64`, or any long random string). `ERP_DATABASE_HOST`,
   `ERP_DATABASE_PORT` and `ERP_DATABASE_NAME` default to
   `localhost`/`3306`/`erp_db` — change them only if MySQL is elsewhere. Leave
   `ERP_PORT=8080` as provided.
7. **Frontend configuration** (optional, one-time): `copy .env.example .env` in
   the repository root. The defaults already point the proxy at
   `http://localhost:8080`; add `VITE_GOOGLE_MAPS_API_KEY` only if the map
   features are needed.
8. **Install frontend dependencies** (one-time, repeat after lockfile changes):
   ```bat
   npm ci
   ```
9. **Start the backend** (every start; first run downloads Maven dependencies):
   ```bat
   cd erp-backend
   mvnw.cmd spring-boot:run
   ```
   Wait for `Started ErpApplication` with no `Schema-validation` error.
10. **Start the frontend** (every start, second terminal in the repo root):
    ```bat
    npm run dev
    ```
11. **Verify:** `http://localhost:8080/v1/health` and
    `http://localhost:8080/v1/actuator/health` return `{"status":"UP"}`;
    `http://localhost:5173` loads the app; log in with a seeded account; the
    browser network tab shows `/v1/...` requests answered by the Vite proxy.
12. **One-time vs every start:** steps 1–8 are one-time per laptop (1–3 also
    once per machine). Steps 9–10 are needed for every run, with MySQL running.

### A port is busy — diagnose instead of switching ports

```bat
netstat -ano | findstr :8080
netstat -ano | findstr :5173
tasklist /FI "PID eq <pid>"
```

Stop only the process you recognise (`taskkill /PID <pid> /F`), or close the
other backend/frontend window. Do **not** start the ERP on 8081/5174: the Vite
proxy, the CORS allow-list and these instructions all assume 8080/5173, and
`strictPort` deliberately refuses to move.

## Create the portable ZIP

Run this in **PowerShell** on the machine that has the project. It copies only
the runnable project (no `.git`, dependencies, build output, uploads, logs or
secrets) and then compresses the staging folder.

```powershell
$src   = "C:\Users\Mahes\Desktop\Sri\erp-react"   # change to your project folder
$stage = Join-Path $env:TEMP "erp-portable"
$zip   = Join-Path (Split-Path $src) "erp-react-portable.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }

robocopy $src $stage /E `
  /XD .git node_modules dist target uploads tmp evidence .freebuff .tmp-clean archunit_store `
  /XF .env .env.ui-test *.log erp_db_backup_*.sql erp_db_schema*.sql tmp-release-status.txt

# robocopy: 0-7 = success, >= 8 = failure
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# Drop the root-level audit reports; keep README.md and everything under docs/.
Get-ChildItem $stage -File -Filter *.md |
  Where-Object { $_.Name -ne 'README.md' } |
  Remove-Item

Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force
"Created $zip"
```

`/XD`/`/XF` match those names at any depth, so the backend `.env`,
`erp-backend\uploads` and `erp-backend\target` are excluded too, while both
`.env.example` files, `package-lock.json`, the Maven wrapper and every SQL file
under `erp-backend\docs` stay in the ZIP. Preview the file list first with the
same command plus `/L`.

Never ZIP the working folder directly — it would include `.env` secrets, real
uploaded documents and database dumps. The receiving laptop installs
dependencies itself (`npm ci`, Maven downloads on first run); `node_modules`
and the Maven repository are deliberately not transferred.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
