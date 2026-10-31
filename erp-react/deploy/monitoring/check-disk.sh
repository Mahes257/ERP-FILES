#!/usr/bin/env bash
# ============================================================================
# Capacity / backup freshness probe for cron, systemd timer or monitoring.
# ============================================================================
# Exit codes:
#   0  healthy
#   1  warning  (disk below WARN_PERCENT free, or backup older than MAX_AGE_HOURS)
#   2  critical (disk below CRIT_PERCENT free, or no backup marker at all)
#
# Environment:
#   CHECK_PATH          mount/path to watch (default: ERP_UPLOAD_DIR)
#   BACKUP_DIR          where the backup markers live
#   WARN_PERCENT        default 20
#   CRIT_PERCENT        default 10
#   MAX_AGE_HOURS       default 26
#
# Example alert integration: run every 15 minutes and alert on non-zero exit.
# Also alert on the Prometheus rules in deploy/README.md.
# ============================================================================
set -u

CHECK_PATH="${CHECK_PATH:-${ERP_UPLOAD_DIR:-/opt/erp/backend/uploads}}"
WARN_PERCENT="${WARN_PERCENT:-20}"
CRIT_PERCENT="${CRIT_PERCENT:-10}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
status=0

if [ ! -d "$CHECK_PATH" ]; then
  echo "CRITICAL: path does not exist: $CHECK_PATH"
  exit 2
fi

used_pct="$(df -P "$CHECK_PATH" | awk 'NR==2 {gsub("%","",$5); print $5}')"
free_pct=$((100 - used_pct))
echo "disk path=${CHECK_PATH} used=${used_pct}% free=${free_pct}%"

if [ "$free_pct" -le "$CRIT_PERCENT" ]; then
  echo "CRITICAL: free space ${free_pct}% <= ${CRIT_PERCENT}%"
  status=2
elif [ "$free_pct" -le "$WARN_PERCENT" ]; then
  echo "WARNING: free space ${free_pct}% <= ${WARN_PERCENT}%"
  [ "$status" -lt 1 ] && status=1
fi

if [ -n "${BACKUP_DIR:-}" ]; then
  for marker in "${BACKUP_DIR}/mysql/.last-success" "${BACKUP_DIR}/uploads/.last-success"; do
    if [ ! -f "$marker" ]; then
      echo "CRITICAL: backup marker missing: $marker"
      status=2
      continue
    fi
    age_h=$(( ( $(date +%s) - $(stat -c %Y "$marker") ) / 3600 ))
    echo "backup marker=${marker} age_hours=${age_h}"
    if [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then
      echo "CRITICAL: backup is ${age_h}h old (max ${MAX_AGE_HOURS}h)"
      status=2
    fi
  done
fi

exit "$status"
