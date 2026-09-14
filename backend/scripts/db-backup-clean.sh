#!/usr/bin/env bash
# Deletes local backup files under BACKUP_DIR older than
# BACKUP_RETENTION_DAYS (default 14). ONLY ever touches local files under
# BACKUP_DIR — never any cloud/managed snapshot.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "Nothing to clean — ${BACKUP_DIR} does not exist."
  exit 0
fi

DELETED_COUNT=0
while IFS= read -r -d '' file; do
  rm -f "${file}"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'backup-*.gz' -mtime "+${RETENTION_DAYS}" -print0)

echo "Removed ${DELETED_COUNT} backup file(s) older than ${RETENTION_DAYS} day(s) from ${BACKUP_DIR}."
