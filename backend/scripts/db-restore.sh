#!/usr/bin/env bash
# Restores a mongodump archive created by db-backup.sh. Requires the backup
# file path as an explicit argument. Refuses to run in production unless
# ALLOW_PRODUCTION_RESTORE=true is explicitly set — this is the critical
# safeguard against an accidental destructive production restore. Never
# prints the connection URI.
set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: db-restore.sh <backup-file>" >&2
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Refusing to run: backup file '${BACKUP_FILE}' does not exist." >&2
  exit 1
fi

if [ "${NODE_ENV:-}" = "production" ] && [ "${ALLOW_PRODUCTION_RESTORE:-}" != "true" ]; then
  echo "Refusing to run: NODE_ENV=production requires ALLOW_PRODUCTION_RESTORE=true to be explicitly set. This is a deliberate safeguard against an accidental destructive production restore." >&2
  exit 1
fi

if [ "${NODE_ENV:-}" = "production" ]; then
  MONGO_URI="${MONGODB_URI_PROD:-}"
  URI_VAR_NAME="MONGODB_URI_PROD"
else
  MONGO_URI="${MONGODB_URI:-}"
  URI_VAR_NAME="MONGODB_URI"
fi

if [ -z "${MONGO_URI}" ]; then
  echo "Refusing to run: ${URI_VAR_NAME} is not set in the environment." >&2
  exit 1
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "Refusing to run: 'mongorestore' is not installed/on PATH." >&2
  exit 1
fi

echo "Restoring '${BACKUP_FILE}' ..."

# --drop is used so a restore produces a byte-for-byte match with the
# backup's collections (the common/expected disaster-recovery behavior) —
# documented here explicitly since it IS destructive to any data written
# since the backup was taken; that's the entire point of a restore, not an
# accident. Combined with the production safeguard above, this is only ever
# reachable in production with an explicit, deliberate opt-in.
if ! mongorestore --uri="${MONGO_URI}" --archive="${BACKUP_FILE}" --gzip --drop; then
  echo "mongorestore failed." >&2
  exit 1
fi

echo "Restore complete."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/db-restore-validate.sh" ]; then
  bash "${SCRIPT_DIR}/db-restore-validate.sh"
fi
