# NetPulse E2E Testing

This repo now includes a lightweight AI/ML workflow smoke test:

```powershell
node scripts/e2e-ai-workflow.mjs
```

## Required environment

Set these before running:

```powershell
$env:NP_E2E_EMAIL="your-user@example.com"
$env:NP_E2E_PASSWORD="your-password"
```

Optional:

```powershell
$env:NP_E2E_BASE_URL="http://localhost:5000"
```

## What the script tests

Default mode:
- `/health`
- `/api/auth/login`
- `/api/auth/me`
- `/api/ai/provider/status`
- `/api/ai/config`
- `/api/ai/search`
- `/api/ml/anomaly/detect`
- `/api/ai/triage`
- search / triage / brief history
- ML improvement stats / history

Full mode:

```powershell
node scripts/e2e-ai-workflow.mjs --full
```

This also exercises:
- `/api/ai/compare`
- `/api/ml/improve/request`
- `/api/ai/brief/generate`

## Notes

- The script assumes the NetPulse server is already running.
- The `--full` mode will create new AI-generated comparison, improvement, and brief records.
- If a provider is unavailable, the full-mode run may fail on provider-backed endpoints.
- This is intentionally a smoke workflow, not a browser test framework.

## Recommended manual UI validation after script passes

1. Open the AI Intelligence Center.
2. Verify Chat, Anomaly, Triage, Brief, Search, and Model Lab tabs render.
3. Confirm the Anomaly tab shows ML Improvement stats/history.
4. Generate one brief and one model comparison from the UI.
5. Rate one response in Search, Brief, and Model Lab.
