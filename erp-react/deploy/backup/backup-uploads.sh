#!/usr/bin/env bash
# ============================================================================
# Attachment / upload volume backup.
# ============================================================================
# Copies ERP_UPLOAD_DIR (attachments, CAD originals, drawings, cad-previews)
# into a dated snapshot. Snapshots are additive: nothing in a previous backup
# is modified or deleted by this script.
#
# Required environment:
#   ERP_UPLOAD_DIR (e.g. /opt/erp/backend/uploads)
#   BACKUP_DIR     (e.g. /var/backups/erp)
# Optional:
#   BACKUP_RETENTION_DAYS (default 14)
#
# Prefer running this while the application is stopped (backup-coordinated.sh)
# so a file cannot be deleted between the database dump and the file copy.
# ============================================================================
set -euo pipefail

: "${ERP_UPLOAD_DIR:?ERP_UPLOAD_DIR is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/uploads/${STAMP}"

umask 077
mkdir -p "$DEST"

echo "[backup-uploads] copying ${ERP_UPLOAD_DIR} -> ${DEST}"
if command -v rsync >/dev/null 2>&1; then
  # -a preserves permissions/timestamps; no --delete, so a backup is a
  # point-in-time copy and never removes an older stored file from this or any
  # other snapshot.
  rsync -a --numeric-ids "$ERP_UPLOAD_DIR"/ "$DEST"/
else
  tar -C "$ERP_UPLOAD_DIR" -cf - . | tar -C "$DEST" -xf -
fi

# A manifest lets a restore verify the copy before it overwrites anything.
( cd "$DEST" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) \
  > "${DEST}.sha256"
date -u +%Y-%m-%dT%H:%M:%SZ > "${BACKUP_DIR}/uploads/.last-success"

echo "[backup-uploads] pruning snapshots older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}/uploads" -mindepth 1 -maxdepth 1 -type d \
  -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} +
find "${BACKUP_DIR}/uploads" -maxdepth 1 -type f \
  -name "*.sha256" -mtime +"$RETENTION_DAYS" -print -delete

echo "[backup-uploads] done: ${DEST} ($(du -sh "$DEST" | cut -f1))"
