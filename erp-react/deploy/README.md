# ERP deployment and operations runbook

Target: one Spring Boot node + one MySQL instance + nginx, sized for **100 concurrent active users**. Capacity is only proven by the staging load test in [`loadtest/README.md`](../loadtest/README.md); this runbook does not claim it.

## 1. Infrastructure baseline

| Component | Minimum | Notes |
|---|---|---|
| App host | 8 vCPU, 16 GB RAM | JVM heap 4 GB (`-Xmx4g`); leave the rest for page cache, uploads and the OS |
| MySQL | 8 vCPU, 16 GB RAM, SSD | `innodb_buffer_pool_size` ≈ 60–70% of RAM; `max_connections ≥ 120` (pool 50 + admin/reporting headroom) |
| Upload volume | Dedicated disk/volume | Holds attachments, CAD originals, drawings, previews and spool files. Size it for the configured pool plus 30% headroom |
| Backup volume | Separate disk/off-host | A backup on the same disk does not survive disk loss |
| Network | TLS 1.2+ | nginx terminates TLS; backend binds `127.0.0.1:8080` |

The Hikari pool starts at 50, Tomcat at 200 request threads. That is a starting point, not a measured optimum: if `hikaricp_connections_pending` stays above 0 during the staging test, raise the pool only after confirming MySQL CPU/latency and `max_connections` headroom.

## 2. Layout

```
/opt/erp/
  backend/erp-backend.jar
  backend/.env                 # mode 0600, owned by erp
  backend/uploads/             # ERP_UPLOAD_DIR (persistent volume)
  frontend/                    # contents of erp-react/dist
```

## 3. Build and release

```bash
# Backend
cd erp-react/erp-backend
./mvnw -B clean package -DskipTests        # CI runs the tests separately
cp target/erp-backend-*.jar /opt/erp/backend/erp-backend.jar

# Frontend
cd erp-react
npm ci
npm run build
rsync -a --delete dist/ /opt/erp/frontend/
```

Apply the database migration **before** starting the new backend; `spring.jpa.hibernate.ddl-auto=validate` refuses to start if a mapped column is missing.

```bash
mysql -u erp_app -p erp_db < erp-backend/docs/migration_2026_10_scalability.sql
```

Never run `database_setup.sql` against a populated database — it is for a fresh/empty schema only.

## 4. Environment variables

All runtime settings are documented in [`erp-backend/docs/environment-configuration.md`](../erp-backend/docs/environment-configuration.md). The values that matter for this deployment:

| Variable | Default | Purpose |
|---|---|---|
| `ERP_DB_POOL_MAX` | 50 | Hikari maximum connections |
| `ERP_DB_POOL_MIN_IDLE` | 10 | Hikari minimum idle |
| `ERP_DB_POOL_CONNECTION_TIMEOUT_MS` | 12000 | Fail fast instead of holding HTTP threads |
| `ERP_DB_POOL_MAX_LIFETIME_MS` | 1500000 (25 min) | Recycle before MySQL/proxy idle cutoffs |
| `ERP_TOMCAT_MAX_THREADS` | 200 | Request worker ceiling |
| `ERP_TOMCAT_ACCEPT_COUNT` | 200 | Bounded queue; overload is rejected, not accumulated |
| `ERP_ATTACHMENT_POOL_BYTES` | 4294967296 (4 GB) | Shared attachment capacity |
| `ERP_MAX_CONCURRENT_UPLOADS` | 4 | Simultaneous attachment writes |
| `ERP_UPLOAD_MIN_FREE_BYTES` | 5368709120 (5 GB) | Upload reserve; below it uploads return 507 |
| `ERP_UPLOAD_DIR` | `uploads` | Persistent upload volume |
| `ERP_UPLOAD_TEMP_DIR` | `${java.io.tmpdir}/erp-upload-spool` | Multipart spool (needs room for concurrent uploads). **Set this on the upload volume in production**: the default lives under `/tmp`, which is often a small tmpfs, and a 2 GB upload spools there before it is written. |
| `ERP_SECURITY_HSTS` | false | Enable once HTTPS is the only entry point |
| `ERP_CORS_ALLOWED_ORIGINS` | localhost origins | Set the real frontend origin |
| `ERP_METRICS_ENV` | local | Tag metrics per environment |
| `ERP_DISK_MIN_FREE_BYTES` | 5368709120 | Actuator disk-health threshold |

Do not put credentials in tracked files or command histories.

## 5. nginx, TLS and service

1. Copy [`nginx/erp.conf`](nginx/erp.conf) to `/etc/nginx/conf.d/erp.conf`, replace the domain/paths, then `nginx -t && systemctl reload nginx`.
2. Issue certificates (certbot or your CA) and keep the ACME challenge location reachable for renewals.
3. Copy [`systemd/erp-backend.service`](systemd/erp-backend.service) to `/etc/systemd/system/`, adjust heap/upload path, then:
   ```bash
   systemctl daemon-reload
   systemctl enable --now erp-backend
   ```
4. Verify:
   ```bash
   curl -fsS https://erp.example.com/v1/actuator/health
   curl -fsSI https://erp.example.com/sales/quotations   # must return index.html (SPA fallback)
   journalctl -u erp-backend -n 100 --no-pager
   ```

### Graceful shutdown

`server.shutdown=graceful` and `spring.lifecycle.timeout-per-shutdown-phase=30s` let in-flight requests finish on SIGTERM. The unit's `TimeoutStopSec=45` is intentionally longer. Clicking **Publish**/deploying restarts should use `systemctl restart`, never `kill -9`.

## 6. Logging and monitoring

- Production (`--spring.profiles.active=prod`) writes **one JSON object per line** to stdout (logback `CONSOLE_JSON`). Ship stdout with journald → your collector (Loki/ELK/CloudWatch). No local rotating file is required; if you need one, add a `RollingFileAppender` in `logback-spring.xml` with a max history, never as the only copy.
- `/v1/actuator/health` and `/v1/actuator/info` are public; `/v1/actuator/metrics` and `/v1/actuator/mappings` require authentication (and nginx restricts them to loopback). Prometheus scraping is optional: add `micrometer-registry-prometheus` to the backend and expose the `prometheus` endpoint before pointing a scraper at it.
- Health checks include the database and the upload volume (`management.health.diskspace.path=${app.upload.dir}`). Use `/v1/actuator/health/liveness` and `/v1/actuator/health/readiness` for the proxy/orchestrator.

Metrics to watch during and after the load test:

| Signal | Where | Alert threshold (suggested) |
|---|---|---|
| `hikaricp_connections_pending` | `/v1/actuator/metrics/hikaricp.connections.pending` | > 0 for 5 min → pool saturation |
| `hikaricp_connections_active` / `max` | same | > 85% for 10 min |
| `hikaricp_connections_timeout_total` | same | any increase |
| `http_server_requests_seconds` P95/P99 | `/v1/actuator/metrics/http.server.requests` (histogram enabled) | P95 > 1 s or P99 > 2.5 s |
| `http_server_requests_seconds_count{status=5xx}` | same | > 1% of requests |
| `jvm_gc_pause_seconds` | `/v1/actuator/metrics/jvm.gc.pause` | P95 > 200 ms |
| `jvm_memory_used_bytes{area=heap}` | same | > 90% of max after GC |
| `erp_processing_job_queue_size` | same | backlog growing over 3 consecutive checks |
| `erp_file_upload_total{status=failure}` | same | any sustained increase |
| Disk free | `deploy/monitoring/check-disk.sh` + node_exporter | < 20% warn, < 10% critical |
| MySQL threads/connections, slow queries | MySQL `performance_schema` / exporter | connections > 80% of `max_connections`; slow query rate rising |
| Backup freshness | `.last-success` markers in `BACKUP_DIR` | older than 26 h → page |

Run the probe every 15 minutes and alert on non-zero exit:

```bash
CHECK_PATH=/opt/erp/backend/uploads BACKUP_DIR=/var/backups/erp \
  /opt/erp/deploy/monitoring/check-disk.sh
```

## 7. Backup and restore

### 7.1 What must stay consistent

Attachment metadata lives in MySQL; the bytes live under `ERP_UPLOAD_DIR`. Restore **files first, then the database**, so every row the database references has a file on disk. Extra files are harmless; missing files are not.

For a guaranteed pair, use [`backup/backup-coordinated.sh`](backup/backup-coordinated.sh): it stops the backend, dumps MySQL, copies the upload volume, writes a manifest, and always restarts the service. Schedule it nightly in a low-traffic window.

For very large volumes, take an LVM/filesystem snapshot while the service is stopped for seconds, then copy the snapshot. Do not rsync a live volume and a `--single-transaction` dump and call it consistent: an attachment deleted between the two steps would be referenced by the dump but absent from the copy.

### 7.2 Schedule (example)

```cron
# 02:15 nightly, logs to syslog
15 2 * * * ERP_SERVICE_NAME=erp-backend BACKUP_DIR=/var/backups/erp ERP_UPLOAD_DIR=/opt/erp/backend/uploads ERP_DATABASE_NAME=erp_db ERP_DATABASE_USERNAME=erp_app ERP_DATABASE_PASSWORD=*** /opt/erp/deploy/backup/backup-coordinated.sh
# every 15 minutes
*/15 * * * * CHECK_PATH=/opt/erp/backend/uploads BACKUP_DIR=/var/backups/erp /opt/erp/deploy/monitoring/check-disk.sh
```

Keep at least 14 daily pairs (`BACKUP_RETENTION_DAYS`) and one monthly pair off-host.

### 7.3 Restore drill (run quarterly on a staging host)

```bash
systemctl stop erp-backend
# 1. Files first — verify the manifest before overwriting anything.
cd /var/backups/erp/uploads/<stamp>
sha256sum -c ../<stamp>.sha256
rsync -a --delete ./ /opt/erp/backend/uploads/
# 2. Database.
gunzip -c /var/backups/erp/mysql/erp_db-<stamp>.sql.gz | mysql -u erp_app -p erp_db
# 3. Verify references and start.
systemctl start erp-backend
curl -fsS http://127.0.0.1:8080/v1/actuator/health
```

Verify in the UI: open a Sales order attachment, a CPR document and a CAD model preview. A missing file is a failed restore — do not declare success on a healthy HTTP check alone.

### 7.4 Retention and deletion

Retention is enforced by the scripts (`BACKUP_RETENTION_DAYS`). Business retention of notifications is **not** implemented: no notification rows are deleted automatically. Propose a policy (for example, resolved notifications older than 12 months) to the business owner first, then implement it as a scheduled, audited job; deleting inbox history is a business decision, not a performance fix.

## 8. Production go-live checklist

- [ ] Migration applied and `validate` starts cleanly.
- [ ] Staging load test at 10/25/50/75/100 users passed (see [`loadtest/README.md`](../loadtest/README.md)).
- [ ] Hikari pending stays 0 at the target concurrency; pool sizing confirmed.
- [ ] Upload volume has ≥ 30% headroom and `ERP_ATTACHMENT_POOL_BYTES` matches it.
- [ ] nginx upload limit ≥ backend `ERP_MAX_REQUEST_SIZE`.
- [ ] TLS + HSTS enabled; CORS origin set.
- [ ] `/v1/actuator/metrics` and `/v1/actuator/mappings` not reachable anonymously.
- [ ] Backup + restore drill completed on staging.
- [ ] Disk and backup-freshness alerts tested (force a low threshold in staging).
- [ ] Graceful restart tested (`systemctl restart` with an in-flight upload).
