#!/usr/bin/env bash
# Creates a single gzip-compressed mongodump archive under BACKUP_DIR.
# Reads MONGODB_URI (or MONGODB_URI_PROD in production) from the
# environment ONLY — never hardcoded, never printed. Exits non-zero on any
# failure. Prints only the output filename/size on success.
set -euo pipefail

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

if ! command -v mongodump >/dev/null 2>&1; then
  echo "Refusing to run: 'mongodump' is not installed/on PATH." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/backup-${TIMESTAMP}.gz"

if ! mongodump --uri="${MONGO_URI}" --archive="${OUTPUT_FILE}" --gzip; then
  echo "mongodump failed — no usable backup archive was produced." >&2
  # $OUTPUT_FILE may exist but be partial/corrupt — remove it rather than
  # leaving a misleading artifact behind.
  rm -f "${OUTPUT_FILE}"
  exit 1
fi

SIZE="$(du -h "${OUTPUT_FILE}" | cut -f1)"
echo "Backup created: ${OUTPUT_FILE} (${SIZE})"
