#!/usr/bin/env bash
# ============================================================================
# Logical MySQL backup for the ERP database.
# ============================================================================
# Produces a consistent, compressed dump plus a SHA-256 checksum and a
# "last success" marker that monitoring can alert on.
#
# Required environment:
#   ERP_DATABASE_NAME, ERP_DATABASE_USERNAME, ERP_DATABASE_PASSWORD
#   BACKUP_DIR (e.g. /var/backups/erp)
# Optional:
#   ERP_DATABASE_HOST (default localhost), ERP_DATABASE_PORT (default 3306)
#   BACKUP_RETENTION_DAYS (default 14)
#
# The password is passed through MYSQL_PWD so it never appears in `ps` or in a
# world-readable option file.
#
# Run from cron/systemd-timer while the application is quiesced (see
# backup-coordinated.sh) or during a low-write window. --single-transaction
# gives a consistent InnoDB snapshot without locking writers, but file
# attachments are only consistent when the app is stopped; use the coordinated
# script for a guaranteed DB+files pair.
# ============================================================================
set -euo pipefail

: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${ERP_DATABASE_NAME:?ERP_DATABASE_NAME is required}"
: "${ERP_DATABASE_USERNAME:?ERP_DATABASE_USERNAME is required}"
: "${ERP_DATABASE_PASSWORD:?ERP_DATABASE_PASSWORD is required}"

DB_HOST="${ERP_DATABASE_HOST:-localhost}"
DB_PORT="${ERP_DATABASE_PORT:-3306}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/mysql"
FILE="${DEST}/${ERP_DATABASE_NAME}-${STAMP}.sql.gz"

umask 077
mkdir -p "$DEST"

echo "[backup-mysql] dumping ${ERP_DATABASE_NAME} from ${DB_HOST}:${DB_PORT} -> ${FILE}"
MYSQL_PWD="$ERP_DATABASE_PASSWORD" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$ERP_DATABASE_USERNAME" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --default-character-set=utf8mb4 \
  --no-tablespaces \
  "$ERP_DATABASE_NAME" | gzip -9 > "$FILE"

# Verify the dump is non-empty and readable before declaring success.
gzip -t "$FILE"
if [ "$(stat -c %s "$FILE")" -lt 1024 ]; then
  echo "[backup-mysql] ERROR: dump is suspiciously small" >&2
  exit 1
fi

sha256sum "$FILE" > "${FILE}.sha256"
date -u +%Y-%m-%dT%H:%M:%SZ > "${DEST}/.last-success"

# Retention: delete only this database's old dumps, never anything else.
find "$DEST" -maxdepth 1 -type f \
  \( -name "${ERP_DATABASE_NAME}-*.sql.gz" -o -name "${ERP_DATABASE_NAME}-*.sql.gz.sha256" \) \
  -mtime +"$RETENTION_DAYS" -print -delete

echo "[backup-mysql] done: ${FILE} ($(stat -c %s "$FILE") bytes)"
