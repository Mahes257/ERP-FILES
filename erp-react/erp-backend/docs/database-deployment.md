# Database deployment — fresh install and migrations

How to stand up the ERP database on a new laptop (or any new environment) so the
backend starts cleanly under `spring.jpa.hibernate.ddl-auto=validate`.

A **new installation needs one schema file**: [`docs/database_setup.sql`](database_setup.sql).
The application **never** creates or alters the schema at runtime — production
defaults to `validate` (`spring.jpa.hibernate.ddl-auto=${ERP_DDL_AUTO:validate}`),
so **every mapped table must already exist** before the backend starts, otherwise
it fails fast with e.g.:

```
Schema-validation: missing table [attachment_storage_usage]
```

---

## 0. New laptop — quick start

Windows-friendly; the same commands work in Git Bash, PowerShell and
`cmd.exe` (`mvnw.cmd` instead of `./mvnw` in `cmd.exe`/PowerShell).

| Step | Command / action | Once per laptop | Every start |
|---|---|---|---|
| 1 | Install **MySQL 8.x** and start it (Windows service `MySQL80`, port 3306) | ✔ | service running |
| 2 | Create the database + least-privilege user — edit the password in `mysql-app-user.sql` first, then run as admin: `mysql -u root -p < erp-backend/docs/mysql-app-user.sql` | ✔ | — |
| 3 | Create the schema — **one file**: `mysql -u erp_app -p erp_db < erp-backend/docs/database_setup.sql` (Workbench: open it, select `erp_db`, execute all) | ✔ | — |

> **`erp_db` already contains your data?** Skip steps 2–3 entirely; follow
> section **2b** instead (connect with that laptop's credentials, run no SQL).
| 4 | Backend config: `cd erp-backend`, `cp .env.example .env`, fill `ERP_DATABASE_PASSWORD` and `ERP_JWT_SECRET` | ✔ | file present |
| 5 | Frontend config (optional): `cp .env.example .env` at the repo root; defaults already proxy `/v1` to `http://localhost:8080` | ✔ | file present |
| 6 | Install dependencies: `npm ci` (uses `package-lock.json`) | ✔ (repeat after lockfile changes) | — |
| 7 | Start the backend: `cd erp-backend && ./mvnw spring-boot:run` (first run downloads Maven deps) | — | ✔ |
| 8 | Start the frontend: `npm run dev` (port 5173, strict) **or** `start-all.bat` (adds the CAD worker; same port) | — | ✔ |

Open `http://localhost:5173` and sign in. The
frontend calls `/v1`, which the Vite dev server proxies to
`ERP_PROXY_TARGET` (default `http://localhost:8080`), so no host is hardcoded in
browser code.

**Verify the database before/after the first backend start:**

```bash
# 138 tables are created by database_setup.sql
mysql -u erp_app -p erp_db -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='erp_db';"

# backend health (UP only after Hibernate validation succeeded)
curl http://localhost:8080/v1/health
curl http://localhost:8080/v1/actuator/health
```

A start with no `Schema-validation` error means Hibernate found a matching table
and column for every mapped entity. Reference data (master lists, Location
Master, the attachment-storage ledger row) is seeded by the application on first
start — see [reference-data.md](reference-data.md).

---

## 1. Source of truth

| What | Where | Notes |
|---|---|---|
| Table definitions | **JPA entities** under `src/main/java/com/vishatech/erp/**` | The only authority. Hibernate derives both the DDL and the validation from these. |
| Complete fresh schema | [`docs/database_setup.sql`](database_setup.sql) | **The one file for a new database.** All 138 tables, indexes, unique keys and foreign keys, generated from the entity model and reconciled with the migrations. |
| Incremental changes | `docs/*_migration.sql` (section 8) | Additive scripts for upgrading an **existing** database. |
| App DB user | [`docs/mysql-app-user.sql`](mysql-app-user.sql) | Creates `erp_db` + least-privilege MySQL user. |

> Do **not** use a `mysqldump`/backup as the schema source. Backups are
> environment-specific, may lag the entities, and can contain real user data.
> `docs/database_setup.sql` is the intended fresh-install source.

---

## 2. Prerequisites

- **MySQL 8.x** server (the schema uses `utf8mb4`, `DATETIME(6)` and native `ENUM`).
- **JDK 21** (the backend targets Java 21; newer JDKs build it as well).
- **Node.js 22 LTS** (CI uses Node 22) — Vite 8 needs Node ≥ 20.19.
- Network access on first `./mvnw` and `npm ci` runs (the Maven wrapper and
  `package-lock.json` pin the toolchain; nothing is installed globally).

---

## 2b. Existing `erp_db` on another laptop — connect only, never initialise

When the other laptop already has `erp_db` **with your data**, this section
replaces steps 2–3 of the quick start:

1. **Confirm the database is there** (read-only):
   ```bash
   mysql -u <your-mysql-user> -p -e "SHOW DATABASES LIKE 'erp_db';"
   mysql -u <your-mysql-user> -p erp_db -e "SELECT COUNT(*) AS tables_present FROM information_schema.tables WHERE table_schema='erp_db';"
   ```
   A non-zero table count means the data is present. Stop and take a backup
   (`mysqldump erp_db > erp_db_backup.sql`, kept outside the project) before
   starting the app for the first time on that machine.
2. **Create only a login for the app** if that laptop has none: a MySQL user
   with `SELECT, INSERT, UPDATE, DELETE, INDEX, CREATE, ALTER, REFERENCES` on
   `erp_db`. Use that laptop's own password — do **not** reuse the password or
   the `root` account from this machine.
3. **Point the backend at it** with environment values only:
   ```bash
   cd erp-backend
   cp .env.example .env      # then edit .env
   ```
   On Windows, `setup.bat` does this step for you: it checks Java/Node/MySQL,
   asks for the login with a hidden password prompt, verifies `erp_db` read-only
   and writes the file. `start-all.bat` then runs the same read-only preflight
   before starting anything.
   ```
   ERP_DATABASE_HOST=localhost      # or the other laptop's MySQL host
   ERP_DATABASE_PORT=3306
   ERP_DATABASE_NAME=erp_db
   ERP_DATABASE_USERNAME=<that laptop's MySQL user>
   ERP_DATABASE_PASSWORD=<that laptop's password>
   ERP_JWT_SECRET=<openssl rand -base64 64>
   ```
   Do not add `createDatabaseIfNotExist` and do not set `ERP_DDL_AUTO` to
   `create`, `create-drop` or `update`. The default `validate` only reads the
   schema.
4. **Do not run `database_setup.sql`, `mysql-app-user.sql` or any
   `docs/*_migration.sql`.** They are for an empty database (or a deliberate,
   reviewed upgrade — section 5), and none of them is part of connecting to an
   existing one.
5. **Start and read the log.** `./mvnw spring-boot:run` reaching
   `Started ErpApplication` with no `Schema-validation` error means every mapped
   entity matched the existing tables. If validation fails, do **not** switch
   `ddl-auto` to make it start: the app and that database are on different schema
   versions, and the missing changes must be applied deliberately (section 5).

---

## 3. Fresh database — step by step

> Only for a database that does **not** hold data yet. For an existing `erp_db`
> use section 2b instead.

### 3a. Install and start MySQL 8

Install MySQL Server 8 and make sure the service is running (`MySQL80` on a
default Windows install) and you can log in as an administrator
(`mysql -u root -p`).

### 3b. Create the database and the application user

Edit [`docs/mysql-app-user.sql`](mysql-app-user.sql) and replace its placeholder
password, then run it **as a MySQL administrator**:

```bash
mysql -u root -p < docs/mysql-app-user.sql
```

That creates:

- database `erp_db` (UTF-8 `utf8mb4`),
- user `erp_app` with `SELECT, INSERT, UPDATE, DELETE, INDEX` (+ `CREATE, ALTER,
  REFERENCES`, which the setup script below needs).

### 3c. Create the schema — the one consolidated file

```bash
mysql -u erp_app -p erp_db < docs/database_setup.sql
```

(MySQL Workbench: open `database_setup.sql`, make sure the `erp_db` schema is
selected, then execute all statements.)

This is a one-time bootstrap for a **new, empty** database. It contains only
`CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE … ADD CONSTRAINT` — no `DROP`,
`TRUNCATE`, `DELETE`, `UPDATE` or data statement.

**Skip the `docs/*_migration.sql` scripts on a fresh database** — their end state
is already part of `database_setup.sql`. They are kept for upgrading databases
that already exist; see section 5.

> `CREATE TABLE IF NOT EXISTS` makes a repeat run safe for tables, but MySQL has
> no `IF NOT EXISTS` for indexes/constraints: a second run reports
> `Duplicate key name` / `Duplicate foreign key name`. Those messages mean the
> object already exists.

### 3d. Configure the backend

```bash
cd erp-backend
cp .env.example .env      # then edit it
```

Required values (no defaults — the app refuses to start without them):

```
ERP_DATABASE_URL=jdbc:mysql://localhost:3306/erp_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
ERP_DATABASE_USERNAME=erp_app
ERP_DATABASE_PASSWORD=<the password you set in mysql-app-user.sql>
ERP_JWT_SECRET=<openssl rand -base64 64>
```

Leave `ddl-auto` at its default (`validate`). Do **not** set `ERP_DDL_AUTO=update`
on this database.

### 3e. Start the backend and confirm validation passes

```bash
./mvnw spring-boot:run
# or: ./mvnw -B package && java -jar target/erp-backend-1.0.0.jar
```

A successful start logs no `Schema-validation` errors. Verify explicitly:

```bash
# list the tables that were created (expect 138)
mysql -u erp_app -p erp_db -e "SHOW TABLES;"

# spot-check the historical offender
mysql -u erp_app -p erp_db -e "SHOW CREATE TABLE attachment_storage_usage\G"
```

The empty `attachment_storage_usage` row is seeded automatically on first use
(`AttachmentStorageService.getTotalBytes()` / the startup reconciliation job),
so no manual seed is required.

### 3f. Install and start the frontend

```bash
# repository root
npm ci
npm run dev
```

The dev server serves the app on port 5173 and proxies `/v1` to
`ERP_PROXY_TARGET` (`http://localhost:8080` by default). `start-all.bat` /
`start-all.sh` start the backend (8080), the CAD worker and the frontend (5173).
The Vite dev server is pinned to **5173** with `strictPort: true`; it refuses to
start if the port is taken instead of moving to another one.

---

## 4. Optional post-install steps

Run these after the fresh schema only if you want the extras:

| Script | Purpose | Needed for startup? |
|---|---|---|
| [`docs/performance_indexes.sql`](performance_indexes.sql) | Extra hand-tuned indexes for pagination/reporting. | No (performance only) |

---

## 5. Upgrading an EXISTING database

A database that already holds data is **not** upgraded with
`database_setup.sql` (it cannot add a column to a table that already exists).
Apply the incremental scripts in the order below instead. They are additive and
idempotent in intent; on MySQL 8 an occasional `Duplicate column name` /
`Duplicate key name` message simply means that change is already applied and is
safe to ignore.

| # | Script | Depends on |
|---|---|---|
| — | `mysql-app-user.sql` (as root, once) | — |
| 1 | `location_master.sql` | — |
| 2 | `cpr_migration.sql` (creates `pr_references`, `grid_configs`) | base `cprs`/`cost_workouts`/`profit_workouts` |
| 3 | `sales_execution_migration.sql` | `pr_references`, `grid_configs` from step 2 |
| 4 | `documents_migration.sql` | `document_repository`, `document_versions` |
| 5 | `marketing_settings.sql` | `app_settings` |
| 5a | `travel_scheduler.sql` (creates `marketing_travel_schedules`) | `users`, `customers` (reference columns) |
| 6 | `production_settings.sql` | — |
| 7 | `processing_jobs.sql` | — |
| 8 | `cad_conversion.sql` | — |
| 9 | `attachment_storage_usage.sql` | the 8 attachment tables |
| 10 | `performance_indexes.sql` (optional) | the indexed tables |
| 11 | `backfill_route_colors.sql` (optional, data) | `marketing_travel_plans` |
| 12 | `sales_attachment_category.sql` | `sales_attachments` |
| 13 | `credit_note_destination_reached.sql` (adds `credit_notes.destination_reached_date`) | the `credit_notes` table |
| 14 | `credit_note_linked_date_overrides.sql` (adds `credit_notes.dispatch_date_override` / `due_date_override`) | step 13 — both override columns are positioned after `destination_reached_date` |
| 15 | `lead_description.sql` (adds `leads.description`) | base `leads` table |
| 16 | `contacts_migration.sql` (creates `contacts` for the CRM Contacts module) | base `leads`, `customers` |
| 17 | `production_entry_machine_assignment.sql` (adds `production_entries.machine_code`) | base `production_entries` |
| 18 | `cost_workout_item_cpr_description.sql` (adds `cost_workout_items.cpr_description`) | base `cost_workout_items` |

Stop the backend before applying schema changes so no job/upload races the DDL,
then restart once the scripts have been applied.

**Why the migration files are kept.** They are the only safe upgrade path for a
database that already contains business data — `database_setup.sql` cannot add
a newer column to an existing table, and re-running it would not fix an older
database. Their end state is verified against `database_setup.sql`, so a fresh
install and a fully migrated database have the same schema.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Schema-validation: missing table [x]` | Table not created (schema older than the build). | Fresh DB → run `database_setup.sql`; existing DB → run the matching `docs/*_migration.sql`. |
| `Schema-validation: missing column [x] in table [y]` | A newer entity column was never migrated. | Apply the relevant migration script (or regenerate `database_setup.sql` for fresh installs). |
| `Data truncated for column 'status'` | An `ENUM` column lacks a value the entity uses (e.g. CPR TV `FORWARDED_TO_PURCHASE_REQUISITION`). | Apply the matching migration (see `cpr_migration.sql`). |
| App refuses to start, complains about `ERP_JWT_SECRET` / DB credentials | `.env` missing/empty. | Copy `.env.example` → `.env` and fill the required values. |
| `Access denied for user 'erp_app'@'localhost'` | Wrong password, or the user was created for another host. | Re-run `mysql-app-user.sql` with the real password; use the same value in `.env`. |
| `Communications link failure` / connection refused | MySQL service not running, or wrong port. | Start `MySQL80`; check `ERP_DATABASE_URL` uses `localhost:3306`. |
| `Port 8080 was already in use` | Another process (usually an older backend) owns 8080. | Find it: `netstat -ano | findstr :8080` (Windows) or `ss -tlnp | grep :8080`; stop it with `taskkill /PID <pid> /F` (`kill <pid>`), but only if it is not the ERP you want. |
| `Port 5173 is already in use` / `strictPort` error | A second Vite dev server (or another app) owns 5173. | Find it: `netstat -ano | findstr :5173`; stop it with `taskkill /PID <pid> /F`. Do not change the port — the proxy, CORS default and docs all expect 5173. |
| Login fails with 403 `Invalid CORS request` | Frontend served from an origin not listed in `ERP_CORS_ALLOWED_ORIGINS`. | Add the origin, or use the Vite proxy (default) so requests are same-origin. |
| `Duplicate key name` / `Duplicate foreign key name` while running `database_setup.sql` | The object already exists (repeat run). | Harmless — the object is already there. |

---

## 7. Regenerating the setup script

Regenerate `docs/database_setup.sql` whenever entities change, so a new laptop
keeps working. The committed file was produced from the entity metadata with
Hibernate's schema exporter, using the **same settings the runtime uses** (dialect
`org.hibernate.dialect.MySQLDialect`, physical naming strategy
`CamelCaseToUnderscoresNamingStrategy`).

The most faithful way to reproduce it through MySQL itself:

```bash
# 1. Create a throwaway database (never erp_db).
mysql -u root -p -e "CREATE DATABASE erp_scratch CHARACTER SET utf8mb4;"

# 2. Let Hibernate build the schema from the entities into the scratch DB ONLY.
cd erp-backend
ERP_DATABASE_URL='jdbc:mysql://localhost:3306/erp_scratch?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC' \
ERP_DDL_AUTO=create \
ERP_DATABASE_USERNAME=root ERP_DATABASE_PASSWORD=... ERP_JWT_SECRET=dummy \
./mvnw -o spring-boot:run        # stop it once the schema is created

# 3. Dump the schema (no data) and review the diff before committing.
mysqldump -u root -p --no-data --skip-comments --skip-add-drop-table erp_scratch > docs/database_setup.sql

# 4. Drop the scratch database.
mysql -u root -p -e "DROP DATABASE erp_scratch;"
```

`ERP_DDL_AUTO=create` is used **only on the throwaway database** to generate the
script. The deployed database must stay on `validate`.

**Post-regeneration checklist** (the exporter does not emit these, so re-add them
if the diff removes them):

1. `contacts` unique key `uq_contacts_lead_type (lead_id, contact_type)` and the
   `idx_contacts_client` / `idx_contacts_status` / `idx_contacts_name` indexes.
2. `contacts` foreign keys with `ON DELETE SET NULL` (deleting a lead/client must
   never delete contact rows).
3. The header block of this file (it is hand-written, not generated).
4. Re-run the verification below and commit only if it passes.

**Verify a regenerated file before committing** — in a throwaway database:

```bash
mysql -u root -p -e "CREATE DATABASE erp_setup_verify CHARACTER SET utf8mb4;"
mysql -u root -p erp_setup_verify < docs/database_setup.sql
# start the backend against it with ddl-auto=validate; it must reach "Started ErpApplication"
mysql -u root -p -e "DROP DATABASE erp_setup_verify;"
```

---

## 8. Script inventory (`docs/`)

| File | Kind | Fresh install | Existing DB |
|---|---|---|---|
| `database_setup.sql` | Complete schema (138 tables, generated + reconciled) | **Required — the only schema file** | Do not run |
| `mysql-app-user.sql` | DB + user bootstrap (root) | **Required** | Once, if user missing |
| `location_master.sql` | 4 tables (Country→…→City) | In `database_setup.sql` | Apply |
| `cpr_migration.sql` | CPR additions + `pr_references`, `grid_configs` | In `database_setup.sql` | Apply |
| `sales_execution_migration.sql` | Sales Execution additions | In `database_setup.sql` | Apply (after cpr_migration) |
| `documents_migration.sql` | `document_audit` | In `database_setup.sql` | Apply |
| `marketing_settings.sql` | `app_settings` widen + `settings_audit_log` | In `database_setup.sql` | Apply |
| `travel_scheduler.sql` | `marketing_travel_schedules` | In `database_setup.sql` | Apply |
| `production_settings.sql` | 3 production master tables | In `database_setup.sql` | Apply |
| `processing_jobs.sql` | `processing_jobs` | In `database_setup.sql` | Apply |
| `cad_conversion.sql` | `cad_conversion_jobs`, `cad_worker_heartbeat` | In `database_setup.sql` | Apply |
| `attachment_storage_usage.sql` | `attachment_storage_usage` + seed | Table in `database_setup.sql` (seed is app-managed) | Apply |
| `sales_attachment_category.sql` | `sales_attachments.attachment_category` | In `database_setup.sql` | Apply |
| `credit_note_destination_reached.sql` | `credit_notes.destination_reached_date` | In `database_setup.sql` | Apply (before the linked-date overrides) |
| `credit_note_linked_date_overrides.sql` | `credit_notes.dispatch_date_override`, `due_date_override` | In `database_setup.sql` | Apply (after destination-reached) |
| `lead_description.sql` | `leads.description` | In `database_setup.sql` | Apply |
| `contacts_migration.sql` | `contacts` table (CRM Contacts) | In `database_setup.sql` | Apply |
| `production_entry_machine_assignment.sql` | `production_entries.machine_code` | In `database_setup.sql` | Apply |
| `cost_workout_item_cpr_description.sql` | `cost_workout_items.cpr_description` | In `database_setup.sql` | Apply |
| `performance_indexes.sql` | Indexes only | Optional | Optional |
| `backfill_route_colors.sql` | Data backfill | Not needed (empty) | Optional |

---

> Reference **data** (master lists and the Location Master) is not created by
> any script above — it is bootstrapped by the application on first start. See
> [reference-data.md](reference-data.md).

---

## 9. Known schema inconsistencies (review)

These are entity/mapping defects surfaced while building the schema. They do
**not** affect `ddl-auto=validate` (Hibernate validates tables and columns, not
indexes), so the backend starts fine — but they should be reviewed.

| Item | Detail | Impact |
|---|---|---|
| `PurchaseTimeline.idx_ptl_created` | `@Index(name = "idx_ptl_created", columnList = "createdAt")`, but the entity has no `createdAt` property (its timestamp column is `timestamp`). The generated `create index ... (created_at)` fails with `ERROR 1072: Key column 'created_at' doesn't exist in table`. | The index was never created in production either (confirmed against a live `erp_db`). It is omitted from `database_setup.sql` with an explanatory comment. Fix the annotation (e.g. point it at `timestamp`) or remove it — **not done here** to keep the change limited to schema/deployment scope. |

> When regenerating the script (section 7), re-check for this class of error:
> run the script with `--force` and confirm no `ERROR` lines remain.
