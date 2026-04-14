#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-https://netpulse.smile4u.in}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "NetPulse production smoke check"
echo "Domain: ${DOMAIN}"
echo

if command -v git >/dev/null 2>&1; then
  echo "[git] $(git log -1 --oneline 2>/dev/null || echo 'not a git checkout')"
fi

if command -v docker >/dev/null 2>&1 && [ -f "${COMPOSE_FILE}" ]; then
  echo
  echo "[docker compose]"
  docker compose -f "${COMPOSE_FILE}" ps || true
fi

echo
echo "[health] ${DOMAIN}/health"
health_body="$(curl -fsSL "${DOMAIN}/health")"
echo "${health_body}"

if ! printf '%s' "${health_body}" | grep -q '"status":"ok"'; then
  echo "Health check did not return status=ok" >&2
  exit 1
fi

echo
echo "[ui] ${DOMAIN}/ai"
ui_status="$(curl -k -s -o /dev/null -w '%{http_code}' "${DOMAIN}/ai")"
echo "HTTP ${ui_status}"

if [ "${ui_status}" != "200" ]; then
  echo "AI page did not return HTTP 200" >&2
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  echo
  echo "[api auth check] ${DOMAIN}/api/ai/provider/status"
  api_status="$(curl -k -s -o /dev/null -w '%{http_code}' "${DOMAIN}/api/ai/provider/status")"
  echo "HTTP ${api_status} (expected 401 without auth, 200 with auth/session)"
  case "${api_status}" in
    200|401) ;;
    *)
      echo "Unexpected API status from provider/status: ${api_status}" >&2
      exit 1
      ;;
  esac
fi

echo
echo "Smoke check passed."
