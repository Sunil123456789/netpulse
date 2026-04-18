# Production Deployment

This repo now includes a production-oriented Docker stack for the AI-enabled NetPulse build.

This deployment assumes:

- host nginx handles TLS and reverse proxying
- the `client` container is exposed on `localhost:3000`
- the `server` container is exposed on `localhost:5000`

Key files:

- `docker-compose.prod.yml`
- `client/Dockerfile.prod`
- `server/Dockerfile.prod`
- `docs/production-runbook.md`
- `scripts/prod-smoke.sh`

## Before Deploying

Use a production-only `.env` on the server. Do not reuse local development secrets.

Review these values first:

- `JWT_SECRET`
- `MONGO_URI`
- `MONGO_ROOT_PASSWORD`
- `REDIS_URL`
- `REDIS_PASSWORD`
- `ES_HOST`
- `ES_USER`
- `ES_PASSWORD`
- `ES_CA_CERT_PATH`
- `CORS_ORIGIN`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OLLAMA_HOST`
- `OLLAMA_MODEL`
- `OLLAMA_AUTH_TOKEN` or `OLLAMA_EXTRA_HEADERS` if your Ollama gateway requires auth
- `ZABBIX_URL`
- `ZABBIX_TOKEN`

## First Rollout

1. Back up MongoDB before deploying AI schema changes.
2. Put the production `.env` on the server.
3. Ensure the host nginx config proxies:

- `/` to `http://localhost:3000`
- `/api/` to `http://localhost:5000`
- `/socket.io/` to `http://localhost:5000`
- `/health` to `http://localhost:5000/health`

4. Build and start the stack:

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

5. Verify:

```powershell
curl https://your-domain/health
curl -I https://your-domain/api/ai/providers
```

6. Log in and test:

- Chat
- Anomaly detection
- Triage
- Brief generation
- Search
- Model Lab

## Safe Rollout Advice

- Keep AI task schedules disabled for the first deploy.
- Enable `brief` and `anomaly` auto-runs only after manual validation.
- Run the smoke E2E script against the deployed backend before enabling scheduled tasks.
- Watch server logs for provider connectivity and Elasticsearch query errors.

## Rollback

If the AI rollout causes issues:

1. Stop the updated stack.
2. Redeploy the last known good application image or compose revision.
3. Keep the AI task configs disabled until the issue is understood.
