#!/usr/bin/env bash
# db-snapshot.sh — Snapshot pg_dump de la DB Supabase salamarket
# Usage : ./scripts/db-snapshot.sh [--upload-s3]
#
# Output : ./snapshots/salamarket_YYYY-MM-DD_HHMMSS.sql.gz
# Requiert : SUPABASE_DB_URL env var (postgres://...)
#
# Idéalement à exécuter via cron LaunchAgent macOS sur Mac mini PM2,
# OU via GitHub Action `schedule: cron:` toutes les semaines.
#
# La sortie est COMPRESSEE gzip pour économiser l'espace. Format SQL
# plain text pour permettre `grep` + restore via psql sans pg_restore.

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL env var not set" >&2
  echo "  Get it from Supabase Dashboard → Project Settings → Database → Connection string" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SNAPSHOT_DIR="${SCRIPT_DIR}/../snapshots"
mkdir -p "$SNAPSHOT_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
OUT_FILE="${SNAPSHOT_DIR}/salamarket_${TIMESTAMP}.sql.gz"

echo "[db-snapshot] Dumping to $OUT_FILE..."

# --no-owner / --no-acl : enable restore sur un projet différent (staging)
# --schema=public : on snapshot uniquement le schéma applicatif (pas auth/storage Supabase internals)
pg_dump \
  --no-owner \
  --no-acl \
  --schema=public \
  --schema=realtime \
  --exclude-schema=storage \
  --exclude-schema=auth \
  "$SUPABASE_DB_URL" \
  | gzip > "$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "[db-snapshot] Done : $OUT_FILE ($SIZE)"

# Optionnel : upload S3 / GCS / Vercel Blob
if [[ "${1:-}" == "--upload-s3" ]]; then
  if [[ -z "${AWS_S3_BUCKET:-}" ]]; then
    echo "WARN: --upload-s3 demandé mais AWS_S3_BUCKET non défini, skip" >&2
  else
    aws s3 cp "$OUT_FILE" "s3://${AWS_S3_BUCKET}/salamarket-snapshots/$(basename "$OUT_FILE")"
    echo "[db-snapshot] Uploaded to s3://${AWS_S3_BUCKET}/salamarket-snapshots/"
  fi
fi

# Garde-fou : ne pas accumuler plus de 14 snapshots locaux (purge)
ls -1t "$SNAPSHOT_DIR"/salamarket_*.sql.gz 2>/dev/null | tail -n +15 | xargs -I {} rm -v {}

echo "[db-snapshot] Cleanup OK"
