#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/netpulse}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/netpulse-backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
NGINX_SITE_PATH="${NGINX_SITE_PATH:-/etc/nginx/sites-enabled/netpulse}"
MONGO_CONTAINER="${MONGO_CONTAINER:-netpulse-mongo-prod}"
MONGO_DB="${MONGO_DB:-netpulse}"
STAMP="$(date +%F-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${STAMP}"
ARCHIVE_PATH="${BACKUP_ROOT}/netpulse-backup-${STAMP}.tar.gz"

echo "NetPulse production backup"
echo "App dir: ${APP_DIR}"
echo "Backup root: ${BACKUP_ROOT}"
echo "Timestamp: ${STAMP}"
echo

mkdir -p "${TARGET_DIR}"

if [ -f "${APP_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${APP_DIR}/.env"
  set +a
else
  echo "Missing ${APP_DIR}/.env" >&2
  exit 1
fi

cp "${APP_DIR}/.env" "${TARGET_DIR}/netpulse.env.backup"

if [ -f "${NGINX_SITE_PATH}" ]; then
  cp "${NGINX_SITE_PATH}" "${TARGET_DIR}/netpulse.nginx.backup"
else
  echo "Warning: nginx site file not found at ${NGINX_SITE_PATH}" >&2
fi

git -C "${APP_DIR}" rev-parse HEAD > "${TARGET_DIR}/git-commit.txt"
git -C "${APP_DIR}" tag --points-at HEAD > "${TARGET_DIR}/git-tags.txt"

if command -v docker >/dev/null 2>&1; then
  docker exec "${MONGO_CONTAINER}" mongodump \
    --username "${MONGO_ROOT_USER}" \
    --password "${MONGO_ROOT_PASSWORD}" \
    --authenticationDatabase admin \
    --db "${MONGO_DB}" \
    --out /tmp/netpulse-dump

  docker cp "${MONGO_CONTAINER}:/tmp/netpulse-dump" "${TARGET_DIR}/mongo-dump"
  docker exec "${MONGO_CONTAINER}" rm -rf /tmp/netpulse-dump
else
  echo "Warning: docker not found, skipping MongoDB dump" >&2
fi

if command -v docker >/dev/null 2>&1 && [ -f "${APP_DIR}/${COMPOSE_FILE}" ]; then
  docker compose -f "${APP_DIR}/${COMPOSE_FILE}" ps > "${TARGET_DIR}/docker-compose-ps.txt" || true
fi

tar -czf "${ARCHIVE_PATH}" -C "${TARGET_DIR}" .

echo "Backup created:"
echo "  Folder : ${TARGET_DIR}"
echo "  Archive: ${ARCHIVE_PATH}"
echo
ls -lh "${TARGET_DIR}"
ls -lh "${ARCHIVE_PATH}"
