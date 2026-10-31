# Unwanted, Temporary and Generated Files Inventory

**Repository root:** `C:/Users/Mahes/Desktop/Sri/erp-react`
**Audit date:** 2026-10-17
**Mode:** read-only. **Nothing was deleted, moved, renamed, cleaned, staged or committed.** This inventory recommends actions only.

**Method:** each path was classified from (a) direct inspection, (b) `git ls-files` (tracked), `git check-ignore -v` (ignored/untracked), (c) reference searches for the file name in source/config/docs, and (d) measured size with `du`/`PowerShell`. Large generated directories are summarised, not enumerated file-by-file.

**Important:** a file being ignored, large, old or generated is **not** evidence that it is unnecessary. Several ignored paths (`.env`, `uploads/`, database dumps) are required for the application to behave as it does on the original laptop.

**Action vocabulary used below:**

| Action | Meaning |
|---|---|
| `KEEP` | Required source, asset or tooling; leave in place |
| `KEEP — REQUIRED CONFIGURATION` | Required to build/start; malformed or missing copies break the app |
| `KEEP — POSSIBLE USER DATA` | Contains business/user data; back up, never commit, never delete casually |
| `REGENERABLE — VERIFY BEFORE REMOVAL` | Rebuildable by a documented command, but may be in active use right now |
| `POTENTIALLY UNNECESSARY — NOT CONFIRMED` | Looks disposable, but no proof it is unused |
| `REVIEW MANUALLY` | Needs an owner decision (sensitive, ambiguous ownership, or tracked in Git) |

---

## 1. Disk usage summary

| Path | Size | Files | Git status | Category | Runtime need |
|---|---|---|---|---|---|
| `node_modules/` | **373.0 MB** | 21,340 | ignored (`.gitignore:17`) | C — dependencies | Yes, to run/build frontend |
| `erp-backend/uploads/` | **264 MB** | 335 (+ dirs) | ignored (`.gitignore:69`) | G — user data | Yes, for existing documents |
| `erp-backend/target/` | **152 MB** | many | ignored (`.gitignore:26`) | B — build output | No (regenerable) |
| `tmp/` | **37 MB** | 196 (119 `.log`) | ignored (`.gitignore:96`) | D/E — scratch + logs | No |
| `dist/` | **31 MB** | bundle | ignored (`.gitignore:23`) | B — build output | No (regenerable) |
| `src/` | 20 MB | 89 `*.test.js` | tracked | A — source | Yes |
| `erp-backend/src/` | 8.5 MB | — | tracked (modulo uncommitted refactors) | A — source | Yes |
| `public/assets/` | 1.9 MB | — | tracked | A — assets | Yes |
| `scripts/` | 1.3 MB | **189** | **tracked** | F — one-off tooling | No |
| root `*.md` reports | 1.2 MB | **30** | mostly untracked | F — documentation | No |
| `erp-backend/docs/` | 317 KB | 20+ | tracked | A — schema/migrations/docs | Yes (schema) |
| `erp-backend/erp_db_*.sql` | ≈1.5 MB | 3 | ignored (`.gitignore:77-78`) | G — data dumps | No, but only copy of data |
| `tests/` | 364 KB | 23 | tracked | A — tests | CI only |
| `erp-backend/archunit_store/` | ~0 | 0 | **untracked, not ignored** | D — tool cache | No |
| `backend-8080.log` | 145 KB | 1 | ignored (`.gitignore:56`) | E — log | No |
| `.tmp-clean/token.txt` | 173 B | 1 | ignored (`.gitignore:125`) | G — sensitive | No |
| `.env` / `erp-backend/.env` | 597 B / 640 B | 2 | **ignored — required** | G — secrets | **Yes** |
| `.env.ui-test` | 274 B | 1 | ignored | G — local config | No (no references) |

Approximate working-tree footprint: **≈ 0.9 GB** (≈ 373 MB dependencies, 264 MB uploads, 152 MB Maven output, 37 MB logs, 31 MB dist), plus a `.git` object store of **13.28 MiB** (3,256 loose objects, no packfiles).

Outside the repository but in the same workspace (`C:/Users/Mahes/Desktop/Sri`): `tmp/` 6.0 MB (14 logs), `.freebuff/` logs (≈16 KB), `erp_db_schema.sql` 168 KB, `tok.txt` 172 B, `.github/modernize/` tool hooks. See §10.

---

## 2. Category A — Required source and configuration

| Path | Size | Git | Purpose | Referenced by | Action |
|---|---|---|---|---|---|
| `src/` (`App.jsx`, pages, components, services, hooks, utils) | 20 MB | tracked | React application source | `index.html`, `src/main.jsx` | `KEEP` |
| `index.html` | 763 B | tracked | Vite entry HTML | Vite | `KEEP` |
| `vite.config.js` | 1.3 KB | tracked | Dev server + `/v1` proxy + Tailwind/React plugins | Vite, `npm run dev/build` | `KEEP — REQUIRED CONFIGURATION` |
| `vitest.config.js` | 1.7 KB | tracked | Unit-test config | `npm run test:unit` | `KEEP` |
| `eslint.config.js` | 568 B | tracked | Lint config | `npm run lint` | `KEEP` |
| `package.json` | 1.4 KB | tracked | Scripts + dependency ranges (no `engines`) | npm | `KEEP` |
| `package-lock.json` | 167 KB | tracked | Reproducible install (lockfileVersion 3, 348 entries, in sync) | `npm ci` (CI) | `KEEP — REQUIRED CONFIGURATION` |
| `public/` (`assets/`, favicon) | 1.9 MB | tracked | Static assets served as-is | Vite/`index.html` | `KEEP` |
| `src/utils/routePrefetch.generated.js` | small | tracked | Generated **but committed** route map | `src/utils/routePrefetch.js` | `KEEP` (regenerate with `scripts/gen-route-prefetch.cjs`) |
| `.env.example` | small | tracked | Frontend env template (`VITE_API_URL`, `ERP_PROXY_TARGET`, maps key) | docs, setup | `KEEP — REQUIRED CONFIGURATION` |
| `.gitignore`, `.gitattributes` | small | tracked | Ignore rules / LF-CRLF policy | Git | `KEEP — REQUIRED CONFIGURATION` |
| `erp-backend/pom.xml` | 9.3 KB | tracked | Spring Boot 3.4.13, Java 21, Lombok processor | Maven | `KEEP` |
| `erp-backend/mvnw`, `mvnw.cmd`, `.mvn/wrapper/*` | 11 KB / 7.7 KB / 63 KB | **tracked** | Maven Wrapper 3.9.9 (jar included) — no system Maven needed | `start-all.*`, CI | `KEEP — REQUIRED CONFIGURATION` |
| `erp-backend/src/main/java`, `src/main/resources` | 8.5 MB | tracked + 243 uncommitted changes | Backend source/resources | Spring Boot | `KEEP` (commit pending work) |
| `erp-backend/.env.example` | 1.5 KB | tracked | Backend env template, placeholders only | setup docs | `KEEP — REQUIRED CONFIGURATION` |
| `erp-backend/docs/schema_baseline.sql` | 102,895 B | tracked | **Fresh-DB source of truth** (137 tables) | `database-deployment.md` §3c | `KEEP — REQUIRED CONFIGURATION` |
| `erp-backend/docs/mysql-app-user.sql` | 2.5 KB | tracked | Creates `erp_db` + least-privilege `erp_app` | `database-deployment.md` §3b | `KEEP — REQUIRED CONFIGURATION` |
| `erp-backend/docs/*_migration.sql` (18 files) | ≈55 KB | tracked | Incremental upgrades for existing DBs | docs | `KEEP` |
| `erp-backend/docs/*.md` (deployment, env, storage, CAD) | ≈150 KB | tracked | Operational contracts | developers/ops | `KEEP` |
| `tools/cad/sat/step-to-cadir.cjs` | small | tracked | STEP→CADIR helper; **required** (not generated) | `SatAcisConversionEngine.java:77`, `cad-conversion-deployment.md` | `KEEP — REQUIRED CONFIGURATION` |
| `tests/` (23 files) | 364 KB | tracked | Node/Vitest contract tests used by CI | `npm test`, CI | `KEEP` |
| `start-all.bat` | 8,556 B | tracked | Windows launcher: MySQL check, backend+Cad worker, health wait, Vite :5174 | users | `KEEP` |
| `start-all.sh` | 5,894 B | tracked | Bash launcher (same flow, stdout discarded) | users | `KEEP` (see defects in diagnostic report) |
| `.github/workflows/ci.yml` | 12 KB | tracked | CI: `npm ci`, backend `./mvnw verify` on JDK 21/Node 22 | GitHub Actions | `KEEP` |
| `README.md` | 1.1 KB | tracked | **Unmodified Vite template** — no project setup info | — | `REVIEW MANUALLY` (should be replaced by real setup docs) |

---

## 3. Category B — Regenerable build artifacts

| Path | Size | Git | Purpose | Regeneration | Action |
|---|---|---|---|---|---|
| `erp-backend/target/` | **152 MB** | ignored | `mvn` output: `classes/` (1,032 `.class`), `erp-backend-1.0.0.jar` (97 MB, 2026-10-14), `.jar.original` (2.6 MB), `generated-sources/`, `generated-test-sources/`, test reports | `./mvnw clean package` | `REGENERABLE — VERIFY BEFORE REMOVAL` |
| `erp-backend/target/verify-*.properties` (3 files) | 2–3 KB each | ignored | H2/MySQL test configs written by test runs | re-created by tests | `REGENERABLE` — **machine-specific** (contains `C:/Users/Mahes/...` paths, e.g. `verify-h2-calendar-sales.properties:51`); never copy between machines |
| `erp-backend/target/generated-schema.sql`, `cp-runtime.txt`, `cp-verify.txt`, `live_cols.tsv`, `e2e-upload.txt` | small | ignored | Test/debug dumps | re-created | `REGENERABLE — VERIFY BEFORE REMOVAL` |
| `erp-backend/target/*.log` (`final-suite*.log`, `full-suite*.log`, `cal*-boot.log`, `cad-boundary-full-run.log`) | several MB | ignored | Historical test/boot output | re-created | `REGENERABLE` (and category E) |
| `dist/` | **31 MB** | ignored | Production frontend bundle (`assets/`, `index.html`, favicon), built 2026-10-17 | `npm run build` | `REGENERABLE — VERIFY BEFORE REMOVAL` (needed only if serving a prebuilt bundle) |
| `erp-backend/archunit_store/` | ~0 (empty) | **untracked, not ignored** | ArchUnit rule cache | re-created by architecture tests | `POTENTIALLY UNNECESSARY — NOT CONFIRMED`; add to `.gitignore` rather than delete data |
| `.vite/`, `.cache/`, `coverage/`, `out/` | absent | ignored by rule | Tool caches | re-created | nothing to do |

---

## 4. Category C — Dependency directories

| Path | Size | Git | Purpose | Notes | Action |
|---|---|---|---|---|---|
| `node_modules/` | **373 MB**, 21,340 files, 240 top-level packages | ignored | Installed frontend dependencies (`vite@8.2.0`, `vitest@5.0.4`, React 19.2.8, …) | Required to run; **machine-specific binaries** (esbuild/rollup native); must be reinstalled per OS/arch | `REGENERABLE — VERIFY BEFORE REMOVAL`; reinstall with `npm ci` |
| `node_modules/.package-lock.json` | small | ignored | npm's installed-tree snapshot | proves local install matches lock | part of above |
| Maven local repository `C:\Users\Mahes\.m2\repository` | outside repo | N/A | Downloaded jars/plugins | machine-level cache, **not** in the project | keep; re-downloadable |
| Maven wrapper dist `C:\Users\Mahes\.m2\wrapper\dists\apache-maven-3.9.9` | outside repo | N/A | Maven 3.9.9 used by `mvnw` | machine-level; first run on a new laptop needs network | keep; re-downloadable |

Do **not** copy `node_modules` or `.m2` between laptops as a portability fix; reinstall instead.

---

## 5. Category D — Temporary files and caches

| Path | Size | Files | Git | What it is | Evidence | Action |
|---|---|---|---|---|---|---|
| `tmp/` | **37 MB** | 196 (119 `.log`) | ignored (`.gitignore:96`) | Verification run outputs: `tmp/verify/a1…a22-*.log`, npm install logs, backend boot logs, negative-run logs, auth-test logs | `find tmp -name '*.log' \| wc -l` → 119; pattern scan found 0 startup failures, 13 `BUILD FAILURE` (historical test iterations) | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` (keep the last failure if still investigating; otherwise removable after review) |
| `.tmp-clean/` + `token.txt` | 1 KB / 173 B | 1 | ignored (`.gitignore:125`) | Scratch dir; `token.txt` has the shape and length of a **JWT access token** (three dot-separated segments) | size/shape check only; value not printed | `REVIEW MANUALLY` — treat as credential material; do not share; delete only after confirming it is expired/unneeded |
| `erp-backend/tmp-run-8099.sh` | 448 B | 1 | **tracked** | One-off launcher on port 8099 that greps credentials out of `.env` and exports them, then `./mvnw -o spring-boot:run` | file content; committed | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` (developer scratch, tracked; removal needs a commit) |
| `erp-backend/archunit_store/` | 0 | 0 | untracked | Empty ArchUnit cache dir | `find` → no files | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` (add ignore rule) |
| `.freebuff/` (workspace parent) | 37 KB | 3 | outside repo | Agent/IDE metadata: `run.md`, `backend-8080.log`, `backend-8080.err.log` | `ls ../.freebuff` | `REVIEW MANUALLY` (tooling state, not app data) |
| `.tmp-clean` at parent? | — | — | — | not present | — | — |

No `.DS_Store`, `Thumbs.db`, `*.bak`, `*.orig`, `*.rej`, `hs_err_pid*` or `*.pid` files were found under the repository (scan excluded `node_modules`, `.git`, `target`).

---

## 6. Category E — Logs and diagnostic output

| Path | Size | Git | Contents | Action |
|---|---|---|---|---|
| `backend-8080.log` | 145 KB | ignored | Spring Boot run log from 2026-10-15; ends with normal `GET … -> 200` API lines | `REGENERABLE — VERIFY BEFORE REMOVAL` (useful as a “known-good” baseline) |
| `tmp/**/*.log` (119) | part of 37 MB | ignored | Historical verification/test runs; 13 `BUILD FAILURE` occurrences, 0 startup-failure occurrences | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` |
| `erp-backend/target/*.log` | several MB | ignored | Maven/test boot logs (final/full suite) | `REGENERABLE` |
| `../tmp/*.log` (14) | 6.0 MB | outside repo | Parent workspace backend/build logs | `REVIEW MANUALLY` |
| `../.freebuff/backend-8080*.log` | ≈16 KB | outside repo | JVM warnings only (no error) | `REVIEW MANUALLY` |
| `erp-backend/uploads/**` filenames | — | ignored | User-uploaded `.pdf`, `.txt`, `.png`, `.csv`, `.docx`, `.stp` — **not logs** | `KEEP — POSSIBLE USER DATA` |

Logs may contain request paths, user e-mail addresses and stack traces. They should not be committed or shared publicly (already ignored by `*.log`).

---

## 7. Category F — Potentially unnecessary files

| Path | Size | Count | Git | Why it is suspicious | Referenced at runtime? | Action |
|---|---|---|---|---|---|---|
| `scripts/` | 1.3 MB | **189 files** | **tracked** | One-off audit/verification helpers: ~120 `cdp-*`/`verify-*` browser probes, 9 `erp-*-data*.cjs` extractors, 4 `fix-*.py` source patchers, SQL utilities incl. `cleanup-audit-data.sql`, `cleanup-session-e2e.sql`, `migrate-production-to-shared-db.sql`, `final-integrity.sql`, plus `apply-revision-*.py` | Only `gen-route-prefetch.cjs` is genuinely used (documented in `src/utils/routePrefetch*.js`); CI does not call `scripts/` | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` for the rest; `REVIEW MANUALLY` for the SQL/py files (destructive if run) |
| `start-dev.bat` | 191 B | 1 | **tracked** | Hard-codes `cd /d C:\Users\srima\OneDrive\Desktop\sri\erp-react` and a `.freebuff` log path from another user/machine | No; `start-all.bat` is used instead | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` (broken everywhere except its origin; needs a commit to remove) |
| `erp-backend/tmp-run-8099.sh` | 448 B | 1 | tracked | Scratch script; duplicates launcher logic, reads secrets from `.env` | No | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` |
| Root audit reports (`*_REPORT.md`, `*_AUDIT.md`, plans) | 1.2 MB | **30** | mostly untracked | Duplicated/overlapping documentation (e.g. `SECURITY_AUDIT.md` vs `ERP_SECURITY_AUDIT_REPORT.md`, `STABILIZATION_COMPLETION_REPORT.md` vs `STABILIZATION_FINAL_REPORT.md`, four `MODULAR_*` documents, `TEST_FILE_INVENTORY.md` 152 KB) | No | `REVIEW MANUALLY` — owner decides what to keep; this audit added two more reports by request |
| `uploads/` (repo root) | 0 | 0 files, `drawings/` only | ignored | **Empty duplicate** of the real storage root, created by starting the backend from the repo root | No (no files) | `POTENTIALLY UNNECESSARY — NOT CONFIRMED` (empty; safe to leave; do not confuse with `erp-backend/uploads`) |
| `erp-backend/erp_db_schema_latest.sql` | 177 KB | 1 | ignored | Older schema snapshot, superseded by tracked `docs/schema_baseline.sql` (which is generated from entities) | No | `REVIEW MANUALLY` — may still be the only record of the DB as of Sep 22 |
| `../erp_db_schema.sql` (workspace parent) | 168 KB | 1 | outside repo | Another old schema copy (Sep 19) | No | `REVIEW MANUALLY` |
| `../.github/modernize/java-upgrade/` | small | several | outside repo | Tooling hooks from a Java-upgrade assistant, unrelated to this project’s CI | No | `REVIEW MANUALLY` (outside repo) |

Nothing in this category is recommended for immediate deletion. Several items are **tracked**, so removal requires a deliberate commit and is outside this task.

---

## 8. Category G — Sensitive or locally required files

| Path | Size | Git | Contents | Risk | Action |
|---|---|---|---|---|---|
| `.env` | 597 B | **ignored** | `VITE_API_URL=/v1`, `ERP_PROXY_TARGET=http://localhost:8080` | Low (no secrets) but required for intended proxy behaviour | `KEEP — REQUIRED CONFIGURATION` |
| `erp-backend/.env` | 640 B | **ignored** | `ERP_PORT`, `ERP_BASE_URL`, `ERP_DATABASE_URL`, `ERP_DATABASE_USERNAME`, `ERP_DATABASE_PASSWORD`, `ERP_JWT_SECRET`, `ERP_UPLOAD_DIR`, `ERP_EXCHANGE_API_URL` | **High** — DB password + JWT signing key | `KEEP — REQUIRED CONFIGURATION`; never commit/share; back up via a password manager |
| `.env.ui-test` | 274 B | ignored | `VITE_API_URL`, `ERP_PROXY_TARGET` (no references anywhere except one audit report) | Low | `REVIEW MANUALLY` — probably obsolete |
| `erp-backend/uploads/` | **264 MB** | ignored | 335 real attachments (pdf/txt/png/jpg/csv/docx/stp) + `drawings/`, `models/`, `processing-jobs/`, `cad-previews/` | **High** — business/user documents | `KEEP — POSSIBLE USER DATA`; back up before any cleanup; never commit |
| `erp-backend/erp_db_backup_20260813_111459.sql` | 1,093,943 B | ignored | Full database dump (Aug 13) | **High** — may contain real user data and password hashes | `KEEP — POSSIBLE USER DATA`; store securely, do not share |
| `erp-backend/erp_db_backup_leadreset_20260813_122242.sql` | 263,337 B | ignored | Pre-reset data snapshot | **High** | `KEEP — POSSIBLE USER DATA` |
| `erp-backend/erp_db_schema_latest.sql` | 177,245 B | ignored | Schema-only snapshot (Sep 22) | Low-medium | `REVIEW MANUALLY` |
| `.tmp-clean/token.txt` | 173 B | ignored | JWT-shaped access token | **High if unexpired** | `REVIEW MANUALLY`; do not commit; delete only after expiry check |
| `../tok.txt` (workspace parent) | 172 B | outside repo | Same size/prefix profile — a token | **High if unexpired** | `REVIEW MANUALLY` |
| `../.freebuff/` logs | 16 KB | outside repo | JVM warnings; may include paths/identifiers | Low | `REVIEW MANUALLY` |
| `.freebuff/run.md` (parent) | 1 KB | outside repo | Local tooling instructions, may contain machine paths | Low | `REVIEW MANUALLY` |
| `erp-backend/target/verify-*.properties` | 2–3 KB | ignored | Absolute `C:/Users/Mahes/...` paths | Low (path disclosure) | `REGENERABLE` |
| `.env.example` files | 1.5 KB / small | tracked | **Placeholders only** (verified: `change-me-…`, `your_api_key_here`) | None | `KEEP — REQUIRED CONFIGURATION` |

No secret value is reproduced in this report.

---

## 9. Required vs generated — quick reference

| Keep unconditionally | Safe to regenerate | Local-only, must be backed up |
|---|---|---|
| `src/`, `public/`, `index.html`, `vite.config.js`, `vitest.config.js`, `eslint.config.js`, `package.json`, `package-lock.json` | `dist/` | `.env`, `erp-backend/.env` |
| `erp-backend/src/`, `pom.xml`, `mvnw*`, `.mvn/` | `erp-backend/target/` | `erp-backend/uploads/` |
| `erp-backend/docs/schema_baseline.sql`, `mysql-app-user.sql`, migrations | `node_modules/` (reinstall, never copy) | `erp-backend/erp_db_backup_*.sql` |
| `tools/cad/sat/step-to-cadir.cjs` | `erp-backend/archunit_store/` | `.tmp-clean/token.txt` (or destroy once expired) |
| `tests/`, `.github/workflows/ci.yml` | `tmp/`, `backend-8080.log` | Any database export you still need |
| `start-all.bat`, `start-all.sh` | `target/verify-*.properties`, test logs | `../tok.txt` (or destroy once expired) |

---

## 10. Workspace-level artifacts outside the Git repository

`C:/Users/Mahes/Desktop/Sri` is **not** a Git repository (`git rev-parse` fails there). It contains the repo plus:

| Path | Size | Notes | Action |
|---|---|---|---|
| `erp-react/` | — | the repository | `KEEP` |
| `erp_db_schema.sql` | 168 KB | stale schema copy (Sep 19), duplicates tracked baseline | `REVIEW MANUALLY` |
| `tok.txt` | 172 B | token-like file | `REVIEW MANUALLY` — sensitive |
| `tmp/` | 6.0 MB, 14 logs | backend/build logs from earlier sessions | `REVIEW MANUALLY` |
| `.freebuff/` | 37 KB | tool metadata + backend logs | `REVIEW MANUALLY` |
| `.github/modernize/` | small | Java-upgrade assistant hooks; not the project's CI | `REVIEW MANUALLY` |
| `.vscode/` | small | editor settings | `KEEP` (local) |

These are outside the deliverable scope but explain why “the project” can appear to have two roots; any launcher or script that assumes the parent is the repo will misbehave.

---

## 11. Items requiring manual verification

1. `scripts/` — confirm none is used by an undisclosed workflow before removing anything; SQL/py files can mutate data and must not be run casually.
2. Root `*.md` reports — decide which are authoritative; several contradict each other (multiple “final” reports).
3. `.tmp-clean/token.txt` and `../tok.txt` — determine whether the JWT is expired before deletion; treat as credentials until then.
4. `erp-backend/erp_db_schema_latest.sql`, `../erp_db_schema.sql` — confirm `docs/schema_baseline.sql` is current before discarding older schema snapshots.
5. `erp-backend/erp_db_backup_*.sql` — confirm backups are complete and restorable (they are the only data copy outside MySQL).
6. `uploads/` (repo root, empty) — confirm no tool writes there before removing the empty directory.
7. `erp-backend/target/` — confirm no one depends on the prebuilt 97 MB jar for deployment before running `mvn clean`.
8. `dist/` — confirm nothing serves it (e.g., an external static host) before removal.
9. `start-dev.bat` — confirm it is not referenced by a shortcut/task on either laptop before deleting.
10. `tmp/` logs — if the cross-laptop investigation is ongoing, keep the most recent backend log as evidence.

---

## 12. Safe cleanup recommendations (not performed)

Ordered from least to most risky. **Do not execute any of this as part of the current task.**

1. **Add ignore rules first** (no deletion): `erp-backend/archunit_store/`, `.tmp-clean/`.
2. **Logs/scratch (low risk):** `tmp/`, `backend-8080.log`, `erp-backend/target/*.log` after the investigation ends — these are reproducible outputs. Keep one recent backend log until the other laptop is working.
3. **Build output (low risk):** `erp-backend/target/`, `dist/` — regenerate with `./mvnw clean package` and `npm run build`. Never delete `target/` while a backend is running from it.
4. **Dependencies (low risk, slow):** `node_modules/` — reinstall with `npm ci`; verify Node ≥ 22.12 first.
5. **Tracked scratch scripts (requires a commit):** `start-dev.bat`, `erp-backend/tmp-run-8099.sh`, unused `scripts/*` — review diff and commit deliberately.
6. **Documentation (owner decision):** consolidate root audit reports; keep one authoritative set.
7. **Never delete without a verified backup:** `.env`, `erp-backend/.env`, `erp-backend/uploads/`, `erp-backend/erp_db_*.sql`, `.tmp-clean/token.txt` until expired, `../tok.txt`, `../erp_db_schema.sql`.
8. **Never run:** `scripts/cleanup-*.sql`, `scripts/final-integrity.sql`, `scripts/migrate-production-to-shared-db.sql` — they are data-mutating utilities, not setup scripts.

A conservative target state after the cross-laptop issue is resolved: repository ≈ 60 MB of source/docs/tests plus `target/` + `dist/` + `node_modules/` regenerated locally, with `uploads/` and `.env` deliberately backed up outside Git. No such change was made here.
