# Reference data — master lists and the Location Master

This document describes the reference data the ERP needs to function, how it is
currently loaded, whether it can be duplicated, and the recommended way to make
it authoritative in production.

Reference data is **not** demo data. It is required for the application to work
(empty dropdowns, failing location validation), so unlike the demo seeders it is
**not** disabled under the `prod` profile — see
[database-deployment.md](database-deployment.md) and the demo-seeder guards.

---

## 1. Required reference data

There are **two independent subsystems**. They are easy to confuse because both
use the words *country / state / city*, but they are different tables.

### 1a. Location Master (cascading Country → State → District → City)

| Item | Detail |
|---|---|
| Tables | `countries`, `states`, `districts`, `cities` |
| Loaded by | `LocationSeeder` → `LocationMasterService.seedIfEmpty()` |
| Content | 19 countries, 229 states, 769 districts, 1768 cities (India fully expanded + 18 other countries) |
| API | `GET /locations/countries`, `/locations/countries/{id}/states`, `/locations/states/{id}/districts`, `/locations/districts/{id}/cities`, `/locations/states/{id}/cities/search`, `/locations/countries/{id}/cities/search`, **`GET /locations/validate`** |
| Consumed by | CRM lead form cascading dropdowns (`src/pages/crm/AddLead.jsx` via `/locations/.../cities/search`), and backend **location validation** in `LeadService`, `CustomerService`, `QuotationService`, `SalesOrderService`, `SalesContractService`, `DeliveryChallanService`, `PurchaseVendorService`, `TravelPlanService`, `MarketingMapService`, `PdfGenerationService` |

**Required?** Yes. Without it the CRM lead/customer forms cannot pick a
city and the backend rejects location combinations.

### 1b. Master lists (`master_values`)

| Item | Detail |
|---|---|
| Table | `master_values` (`master_key`, `value`, unique per key) |
| Loaded by | `MasterDataSeeder` |
| API | `GET/POST/PUT/DELETE /masters/{key}` |
| Content | **37 keys / 326 values** |

Keys currently seeded (count in brackets):

```
pr_departments(12) pr_priorities(4) pr_requested_by(7) pr_units(13) cw_departments(13)
sales_executives(7) payment_terms(5) delivery_terms(8) transport_companies(7) bank_types(3)
payment_modes(5) credit_note_reasons(8) currencies(6) companies(1) countries(9) states(36)
cities(8) durations(7) warranty_terms(5) units(10) package_types(8) client_industries(6)
client_types(6) tax_treatments(6) client_categories(8) client_payment_terms(6)
client_statuses(5) sales_persons(1) cw_categories(19) cw_units(26) mkt_designations(10)
mkt_departments(11) mkt_followup_types(5) mkt_statuses(12) mkt_outcomes(9)
mkt_next_actions(8) mkt_groups(6)
```

`master_values` is the editable list store for the CPR / Cost Workout / Sales
Execution / Clients / Marketing dropdowns. Users may add, rename and delete
values through `/masters/{key}`; the seeded set is the starting point, not a
fixed enum.

**Required?** Yes for first-run usability. A missing key yields an empty
dropdown (the form still renders).

> Note: the keys `countries`, `states`, `cities` **inside `master_values`** are a
> plain, flat dropdown list (9 / 36 / 8 values). They are unrelated to the
> Location Master tables in §1a.

---

## 2. Current bootstrap mechanism

| Seeder | Type | Trigger | Guard |
|---|---|---|---|
| `MasterDataSeeder` | `@Component implements CommandLineRunner` | every startup | per key: `countByMasterKey(key) == 0` |
| `LocationSeeder` | `@Component implements ApplicationRunner` | every startup | whole master: `countryRepository.count() == 0` |

Behaviour:

- **Empty database** → both seed the full reference set.
- **Populated database** → `MasterDataSeeder` skips every key that already has
  rows; `LocationSeeder` logs *"already seeded … skipping"* and then runs
  `LocationMasterService.fixExistingData()`, which **adds any canonical
  district/city that is missing** and backfills the `Anantapur → Anantapuramu`
  rename. It never edits or removes rows the admin created.
- Both run regardless of profile (deliberately — the data is required).

---

## 3. Duplication and idempotency

Duplicates are prevented at **two** levels.

**Database-level uniqueness (the strong guarantee):**

- `master_values` — `UNIQUE (master_key, value)` (MySQL's default
  case-insensitive collation makes this case-insensitive too).
- `countries(name)`, `states(country_id, name)`, `districts(state_id, name)`,
  `cities(district_id, name)`.

**Application-level guards:**

- `MasterDataSeeder.seedIfEmpty(key, …)` returns early when the key has rows.
- `seedIfEmptyMerged` de-duplicates the system list against legacy
  `cw_master_data` custom values before inserting.
- `LocationMasterService` resolves each country/state/district/city with
  `findByNameIgnoreCase` / `findBy…IdAndNameIgnoreCase` and only creates it when
  absent.

**Repeated startup re-adds canonical rows that were deleted** (via
`fixExistingData()` and the per-key guard). That is intentional for a
reference master — deleting a canonical district/city is treated as data drift,
not as an admin decision. It is *re-creation*, never a duplicate.

---

## 4. Can the existing SQL files become the authoritative source?

**Not today.** Analysis of `docs/*.sql`:

- `docs/location_master.sql` only `CREATE TABLE IF NOT EXISTS` the four location
  tables — **no rows**.
- There is **no SQL at all** for the `master_values` rows.
- The row content lives only in Java: `INDIA_STATE_DISTRICTS`,
  `DISTRICT_ALIASES`, `OTHER_COUNTRY_CITIES` (inside `LocationMasterService`) and
  the key/value lists in `MasterDataSeeder`.

So a fresh database gets its reference **schema** from
`docs/database_setup.sql`, but its reference **rows** always come from the
running application. The SQL files cannot currently pre-seed an offline
database.

---

## 5. Recommended production mechanism

### Option A — keep the Java seeders (recommended now)

Keep `MasterDataSeeder` and `LocationSeeder` as the authoritative bootstrap.
They are idempotent, DB-constrained, deterministic and already verified. This is
zero-risk and requires no change. The only requirement is that the application
(not just the schema) starts at least once against the new database — which it
must anyway.

### Option B — pre-seed from SQL, then disable runtime seeding (only with approval)

If an environment must have reference data present **before** the app starts
(read replicas, offline verification, DB-only provisioning), extract the rows to
SQL:

1. Dump the already-seeded content, not hand-written data:
   `mysqldump erp_db master_values countries states districts cities --no-create-info`.
2. Rewrite the dump as idempotent inserts so it is safe to re-run:
   `INSERT … ON DUPLICATE KEY UPDATE value = VALUES(value)` for `master_values`,
   and `INSERT IGNORE` for the location tables (ids are AUTO_INCREMENT, so the
   dump should insert by natural key with a join, or use explicit ids that match
   the FKs).
3. Add the file as `docs/reference_data_seed.sql` and list it in
   [database-deployment.md](database-deployment.md) after `database_setup.sql`.
4. Only **then** add an explicit opt-out so the Java seeders do not re-run:
   a property such as `app.reference-data.seed-on-startup=false`
   (default `true`, i.e. current behaviour) read by both seeders.
5. Verify: fresh DB → apply SQL → boot → `/locations/validate` and
   `/masters/{key}` return the same content; restart → no change.

This is a data change, so it must be reviewed and approved before it is done —
per the task constraints the extraction is **documented, not performed**.

---

## 6. Verification performed

Against a **fresh MySQL 8 database** (`database_setup.sql` applied), with the
application started under the **`prod` profile** (so only reference data loads):

| Check | Result |
|---|---|
| First startup seeds reference data | 19 countries / 229 states / 769 districts / 1768 cities; 326 master values over 37 keys |
| Demo seeders did **not** run | correct (prod profile) |
| Restart on the same DB | `Location master already seeded (19 countries) — skipping` |
| Counts after restart | **identical** (19 / 229 / 769 / 1768 / 326 / 37) |
| Duplicate rows | 0 across `countries`, `states`, `districts`, `cities`, `master_values` |
| Location hierarchy resolvable | `Chennai`/`Coimbatore` → district → `Tamil Nadu` → `India` |
| API wiring | `/locations/*` and `/masters/*` respond (401 unauthenticated, as designed) |

Automated tests: `MasterValueCacheTests`, `MasterValueCacheDisabledTests` and
`CrmApiTest` (which exercises the CRM/location paths) pass in the backend suite.

---

## 7. Remaining risks

1. **Deleted canonical rows come back** on the next restart (`fixExistingData`).
   Acceptable for a master, but must be understood; a future change could gate it
   behind an opt-in admin action.
2. **Reference data is tied to a successful startup.** `LocationSeeder` is
   deliberately non-fatal (logs and continues). `MasterDataSeeder` is
   `@Transactional` and *does* fail startup on an unexpected insert error — which
   is safe (the whole seed rolls back and retries cleanly on the next start, with
   no partial state), but means a genuine error is surfaced at boot.
3. **No offline/DB-only seeding path** exists yet (see §4/§5 Option B).
4. Multiple application instances starting simultaneously against an empty
   database could race; the DB unique constraints prevent duplicate rows, but one
   instance may log a constraint violation. Normal single-instance startup is
   unaffected.
