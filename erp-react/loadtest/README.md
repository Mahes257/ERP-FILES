# ERP staging load-test plan — 100 concurrent users

This plan validates the 100-user target against **MySQL and the real Spring Boot server**, not H2 and not MockMvc. The existing [`PERFORMANCE_REPORT.md`](../erp-backend/docs/PERFORMANCE_REPORT.md) is an in-process H2 benchmark; it is useful as a code-level baseline but is **not** evidence of production capacity.

> Status: the scripts and plan are prepared. No staging load test has been executed as part of this change, so the ERP is not marked READY based on unit/H2 tests.

## 1. Environment

- Isolated staging host with production-like CPU/RAM/disk, the same MySQL version and `innodb_buffer_pool_size`, and a **copy of production-shaped data** (anonymised).
- Same JVM flags, nginx config, connection pool and `ERP_ATTACHMENT_POOL_BYTES` as production.
- A dedicated load-test user with the permissions the test needs (`SALES_*`, `CPR_*`, `PURCHASE_*`, `NOTIFICATION_*`).
- One known CPR id for the optional upload scenario (`UPLOAD_CPR_ID`).
- **Never point the test at production.** Writes create CPR drafts and, when enabled, attachments.

## 2. Test levels

Run one k6 process per level, in order, with a stable staging dataset and a fresh application start where possible:

| Level | `VUS` | Ramp | Hold | Purpose |
|---|---|---|---|---|
| 1 | 10 | 1 min | 5 min | Warm-up, correctness of the mix |
| 2 | 25 | 1 min | 5 min | Early concurrency |
| 3 | 50 | 1 min | 10 min | Pool target level |
| 4 | 75 | 1 min | 10 min | Headroom check |
| 5 | 100 | 1 min | 15 min | Target |

```bash
export BASE_URL=https://staging.example.com
export ERP_EMAIL=loadtest@example.com
export ERP_PASSWORD='staging-only-password'
export ENABLE_WRITES=true
export ENABLE_UPLOAD=false          # enable with UPLOAD_CPR_ID for level 3+
export UPLOAD_CPR_ID=12345

k6 run -e VUS=10  -e DURATION=5m  erp-mixed.js
k6 run -e VUS=25  -e DURATION=5m  erp-mixed.js
k6 run -e VUS=50  -e DURATION=10m erp-mixed.js
k6 run -e VUS=75  -e DURATION=10m erp-mixed.js
k6 run -e VUS=100 -e DURATION=15m erp-mixed.js
```

The read mix is weighted: Sales orders 30%, CPR list 20%, invoices 12%, purchase orders 12%, production orders 10%, CPR reports summary 8%, notifications 5%, CRM leads 3%. Writes (10% of iterations, only with `ENABLE_WRITES=true`) create CPR drafts through the normal service path. Add an upload probe for levels 3–5.

Run a **soak** after the target passes: `VUS=100`, `DURATION=60m`, to expose leaks/GC degradation.

## 3. What to record at each level

Use k6's summary plus the server metrics sampled during the hold window (at least every 15 s):

| Metric | Source |
|---|---|
| Requests per second | k6 `http_reqs` rate |
| P50 / P95 / P99 | k6 `http_req_duration`; cross-check `/v1/actuator/metrics/http.server.requests` |
| 4xx and 5xx rates | k6 `http_req_failed`, `http_reqs` by status; server access logs |
| MySQL active connections | `SHOW GLOBAL STATUS LIKE 'Threads_connected'` / `Threads_running` |
| HikariCP active/idle/pending | `/v1/actuator/metrics/hikaricp.connections.*` |
| CPU and RAM | host exporter (`node_exporter`, `top`) |
| JVM heap and GC | `/v1/actuator/metrics/jvm.memory.used`, `jvm.gc.pause` |
| DB query latency | MySQL slow log, `performance_schema.events_statements_summary_by_digest` |
| Attachment throughput | k6 upload scenario + `erp_file_upload_bytes` / disk I/O |
| Disk capacity | `df -h` / `check-disk.sh` before, during and after |

Record raw k6 JSON (`--out json=results-100.json`) and keep the server metric snapshots with the level number.

## 4. Pass criteria (proposed, confirm with the business)

At 100 VUs with the production-like dataset:

- 5xx rate < 0.1%; 4xx only the expected auth/validation codes.
- P95 < 1 s and P99 < 2.5 s for JSON list reads; CPR report P95 < 1.5 s (it is heavier).
- No request timeouts; Hikari `pending` returns to 0 after each burst and never stays > 0 for 5 minutes.
- Zero connection-acquisition timeouts; no `CommunicationsException`.
- JVM heap stable after full GC; no upward trend over the soak.
- Disk free stays above the configured reserve; uploads succeed within the configured concurrency.
- MySQL CPU < 80% sustained; no lock wait storm; slow-query rate flat versus the 10-VU baseline.

If any criterion fails, report the level reached and the bottleneck; do not extrapolate "ready" from a lower level.

## 5. Staging data and cleanup

- Writes are identifiable: CPR drafts use `department = "K6 Load Test"`, `requestedBy = "k6"`, and a remark saying they are synthetic.
- Do not delete data with raw SQL to clean up. Remove the test records through the application (or restore the staging snapshot taken before the run) so referential integrity and audit history stay valid.
- If attachments were enabled, delete them through the CPR attachment endpoint and confirm the ledger (`/v1/files/storage`) returns to its pre-test value.

## 6. Interpretation rules

- H2/MockMvc results cannot be used to claim MySQL capacity.
- A single endpoint benchmark is not a capacity claim; only the full mixed test at the target concurrency is.
- One application node passing 100 users does not establish headroom for 200; horizontal scaling, read replicas or a cache layer are separate changes.
