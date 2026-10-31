#!/usr/bin/env bash
# ============================================================================
# Coordinated DB + attachment backup (consistent pair).
# ============================================================================
# Attachment rows in MySQL and the files on the upload volume must describe the
# same moment. This script stops the backend, takes the logical DB dump, copies
# the upload volume, writes a manifest, then starts the backend again.
#
# Use it in a short maintenance window (typically nightly). For a large upload
# volume, take a filesystem/LVM snapshot instead of rsync and keep the stop
# window to seconds:
#   systemctl stop erp-backend
#   mysqldump ... (backup-mysql.sh)
#   lvcreate --snapshot ...
#   systemctl start erp-backend
#   mount the snapshot and run backup-uploads.sh from it
#
# Required environment:
#   ERP_UPLOAD_DIR, BACKUP_DIR, ERP_DATABASE_NAME,
#   ERP_DATABASE_USERNAME, ERP_DATABASE_PASSWORD
# Optional: ERP_SERVICE_NAME (default erp-backend)
#
# The backend is ALWAYS restarted, even when the backup fails.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE="${ERP_SERVICE_NAME:-erp-backend}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

restart() {
  if systemctl is-active --quiet "$SERVICE"; then
    return
  fi
  echo "[backup] restarting ${SERVICE}"
  systemctl start "$SERVICE"
}

stopped=0
cleanup() {
  if [ "$stopped" -eq 1 ]; then
    restart || true
  fi
}
trap cleanup EXIT

echo "[backup] stopping ${SERVICE} for a consistent snapshot"
systemctl stop "$SERVICE"
stopped=1

"${SCRIPT_DIR}/backup-mysql.sh"
"${SCRIPT_DIR}/backup-uploads.sh"

# Manifest pairs the two artifacts and records the backup window.
mkdir -p "${BACKUP_DIR}/manifests"
{
  echo "created_at=${STAMP}"
  echo "database=${ERP_DATABASE_NAME}"
  echo "upload_dir=${ERP_UPLOAD_DIR}"
  echo "mysql_dump=$(ls -1t "${BACKUP_DIR}/mysql/${ERP_DATABASE_NAME}-"*.sql.gz | head -1)"
  echo "upload_snapshot=$(ls -1dt "${BACKUP_DIR}/uploads/"*/ | head -1)"
} > "${BACKUP_DIR}/manifests/${STAMP}.env"

echo "[backup] pair recorded in ${BACKUP_DIR}/manifests/${STAMP}.env"
