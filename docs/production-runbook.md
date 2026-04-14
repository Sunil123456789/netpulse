# Production Runbook

This runbook assumes the NetPulse production stack runs with:

- host nginx on Ubuntu
- `client` container published on `localhost:3000`
- `server` container published on `localhost:5000`
- Docker Compose file: `docker-compose.prod.yml`

## Daily Operations

Useful checks:

```bash
cd /opt/netpulse
docker compose -f docker-compose.prod.yml ps
docker logs --tail=100 netpulse-server-prod
curl -s https://netpulse.smile4u.in/health
```

Quick smoke check:

```bash
cd /opt/netpulse
bash scripts/prod-smoke.sh https://netpulse.smile4u.in
```

Create a backup:

```bash
cd /opt/netpulse
bash scripts/prod-backup.sh
```

## Deploy

```bash
cd /opt/netpulse
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml up -d --build
bash scripts/prod-smoke.sh https://netpulse.smile4u.in
```

## Browser Smoke Checklist

After deploy, validate:

- login works
- AI page loads
- Chat returns a response
- Anomaly detection runs
- Triage completes
- Brief generates
- Search returns results

## Scheduler Rollout

Recommended order:

1. Keep all AI schedules disabled after a fresh deploy.
2. Enable `anomaly` first and observe logs for a day.
3. Enable `brief` after anomaly is stable.

## Rollback

Capture the current release before deploy:

```bash
cd /opt/netpulse
git rev-parse HEAD
```

Rollback flow:

```bash
cd /opt/netpulse
git checkout <known-good-commit>
docker compose -f docker-compose.prod.yml up -d --build
bash scripts/prod-smoke.sh https://netpulse.smile4u.in
```

## Backup

Create a production backup bundle:

```bash
cd /opt/netpulse
chmod +x scripts/prod-backup.sh
bash scripts/prod-backup.sh
```

Default output:

- backup folder under `/opt/netpulse-backups/<timestamp>`
- archive at `/opt/netpulse-backups/netpulse-backup-<timestamp>.tar.gz`

Contents:

- `.env`
- nginx site config
- current git commit and tags
- MongoDB dump
- docker compose status snapshot

## Common Issues

### `/health` returns HTML

Host nginx is routing `/health` to the client instead of the backend.

Fix `/etc/nginx/sites-enabled/netpulse`:

```nginx
location = /health {
    proxy_pass http://localhost:5000/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### UI calls `/api/api/...`

The client was built with a baked `VITE_API_URL=/api`.

Fix:

- ensure `client/Dockerfile.prod` does not force `VITE_API_URL=/api`
- rebuild the client container with no cache

```bash
cd /opt/netpulse
docker compose -f docker-compose.prod.yml build --no-cache client
docker compose -f docker-compose.prod.yml up -d client
```

### Chat/Triage fail with Claude auth errors

Production is intended to run Ollama-first.

Checks:

- `AI_PROVIDER=ollama` in `.env`
- AI task settings are set to `ollama`
- invalid Claude/OpenAI keys are removed or left blank if unused

## Recommended Production Settings

For an Ollama-first deployment:

```env
AI_PROVIDER=ollama
OLLAMA_HOST=https://ollama.smile4u.in/ollama
OLLAMA_MODEL=llama3
CORS_ORIGIN=https://netpulse.smile4u.in
```
