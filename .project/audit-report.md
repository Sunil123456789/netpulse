# NetPulse — Full Application Audit Report
**Generated:** 2026-04-15  
**Audit mode:** Reliability-first, full-stack, production-baselined  
**Reference deployment:** React/Vite SPA + Express/Socket.io + Elasticsearch + MongoDB + Redis + Zabbix + Ollama-backed AI, fronted by host nginx and `docker-compose.prod.yml`

---

## Executive Summary

NetPulse is now beyond “prototype” status. The AI module is live in production, the host-nginx + Docker deployment model is stabilized, `/health` is exposed publicly, and basic operational tooling exists through the smoke test, backup script, and production runbook.

The biggest remaining risks are no longer “does the app boot?” problems. They are now operational and architectural:

1. Authenticated non-admin users can still modify operational data because several route families are only protected by `authenticate`, not by admin authorization.
2. The Socket.io live feed is unauthenticated and continuously polls Elasticsearch every 5 seconds.
3. Several live routes and navigation items still point to scaffolded modules (`Tickets`, `Reports`), creating production-visible dead ends.
4. Heavy dashboard and AI flows still build context synchronously across Elasticsearch, MongoDB, Zabbix, and model providers, which will become the next reliability bottleneck.
5. The platform still has no meaningful automated test suite.

### Finding Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 6 |
| Medium | 7 |
| Low | 1 |
| **Total** | **16** |

---

## Current-State System Map

### Application Surface

| Layer | Current Surface | Evidence |
|------|------------------|----------|
| Frontend routes | `home`, `soc`, `noc`, `edr`, `zabbix`, `ai`, `admin`, `tickets`, `reports`, `login` | `client/src/App.jsx` |
| Layout and navigation | Shared shell with global sidebar; nav items visible for all logged-in users | `client/src/components/layout/Layout.jsx`, `client/src/components/layout/Sidebar.jsx` |
| Auth flow | JWT login, persisted token/user in Zustand, `PrivateRoute` only checks token presence | `server/src/routes/auth.js`, `client/src/store/authStore.js`, `client/src/App.jsx` |
| AI surface | Chat, Anomaly, Triage, Brief, Search, Model Lab, Settings | `client/src/pages/AI/AIPage.jsx` |
| Backend route families | `auth`, `users`, `devices`, `sites`, `tickets`, `logs`, `alerts`, `stats`, `edr`, `zabbix`, `ai`, `ml` | `server/src/index.js`, `server/src/routes/*.js` |
| Background services | Socket live feed, alert engine, AI scheduler | `server/src/services/websocket.js`, `server/src/services/alertEngine.js`, `server/src/services/ai/scheduler.js` |
| Data sources | Elasticsearch, MongoDB, Redis, Zabbix, Ollama/Claude/OpenAI | `server/src/config/*.js`, `server/src/services/zabbix.js`, `server/src/services/ai/providers/*.js` |
| Production ops | Host nginx, Docker Compose, `/health`, smoke check, backup script, runbook | `docker-compose.prod.yml`, `docs/production-runbook.md`, `scripts/prod-smoke.sh`, `scripts/prod-backup.sh` |

### Main Data Paths

- Frontend -> shared Axios client / AI API client -> Express routes
- Express routes -> Elasticsearch / MongoDB / Redis / Zabbix / AI providers
- Background flows:
  - Socket live feed -> Elasticsearch polling -> browser broadcast
  - Alert engine -> Alert rules in Mongo -> Elasticsearch counts -> socket alert emission
  - AI scheduler -> task config in Mongo -> AI/ML services -> Mongo history models

### Operational Facts Confirmed in Repo

- AI is live in production and no longer a scaffold-only initiative.
- Production now follows the host-nginx + Docker Compose model consistently.
- AI/ML requests have dedicated configurable timeout handling on the frontend.
- There is still no meaningful automated test suite in the repository.
- Tickets and Reports are routed in the live app, but still behave like scaffolds.

---

## Validation Evidence

### Build and lint

- `client`: `npm run build` passes.
- `server`: `npm run lint` passes.
- `server`: `npm test` fails because no tests exist.

### Evidence snapshots

- Production client bundle is still large:
  - `dist/assets/index-KKn1dHUB.js` -> `724.75 kB` minified during `vite build`
- Explicit Mongoose secondary indexes are nearly absent:
  - `rg "\.index\(" server/src/models` returned only `server/src/models/AIBaseline.js`
- Production-visible scaffolds still exist:
  - `client/src/pages/Tickets/TicketsPage.jsx` -> `"Module under development"`
  - `client/src/pages/Reports/ReportsPage.jsx` -> `"Module under development"`
  - `server/src/routes/tickets.js` -> `"tickets route ok"`

---

## Verified Improvements Since The Previous Audit

These items were problems in the earlier audit and are now verified as fixed or materially improved.

| Item | Current Status | Evidence |
|------|----------------|----------|
| Auth middleware missing on non-auth routes | Fixed | `server/src/index.js` mounts all non-auth route groups behind `authenticate` |
| Public self-registration | Fixed | `POST /api/auth/register` now uses `authenticate, authorize('admin')` in `server/src/routes/auth.js` |
| Login brute-force protection | Fixed | dedicated login limiter in `server/src/routes/auth.js` |
| Missing required env assertion | Fixed | startup check for `JWT_SECRET`, `MONGO_URI`, `ES_HOST` in `server/src/index.js` |
| React fallback route | Fixed | `client/src/App.jsx` now has `path="*"` redirect |
| SOC/NOC/EDR empty-failure handling | Improved | pages now track fetch error state instead of silently failing |
| AI timeout mismatch | Partially fixed | AI-specific timeout setting and per-request overrides in `client/src/api/ai.js` and `client/src/pages/AI/AIPage.jsx` |
| AI provider defaults were Claude-biased | Fixed | env-aware defaults and Ollama fallback in `server/src/config/aiTaskDefaults.js` and `server/src/services/ai/taskRouter.js` |
| Production recovery posture | Improved | `docs/production-runbook.md`, `scripts/prod-smoke.sh`, `scripts/prod-backup.sh`, public `/health` |

---

## Findings

## Critical

### C1 — Operational CRUD routes still lack admin authorization
**Subsystem:** Backend authz  
**Evidence:** `server/src/index.js` mounts `users`, `devices`, `sites`, and `alerts` behind `authenticate`, but the route files themselves do not apply `authorize('admin')`. See `server/src/routes/users.js`, `devices.js`, `sites.js`, `alerts.js`.  
**Impact:** Any authenticated user can create, update, or delete users, devices, sites, and alert rules. This is the single highest-risk correctness and security gap still present in the live app.  
**Recommended fix:** Split read vs admin-write access explicitly. Apply `authorize('admin')` to mutating operations at minimum, and likely to full route families such as `users`, `sites`, and `alerts`.  
**Suggested rollout:** Phase 1, first change set.

### C2 — Socket live feed is unauthenticated and globally broadcast
**Subsystem:** Realtime / data exposure  
**Evidence:** `server/src/services/websocket.js` accepts any socket connection, does not validate JWTs, and broadcasts `live:events` to all connected clients every 5 seconds.  
**Impact:** Operational/security event summaries are exposed to any socket client that can reach the server. The broadcast model also creates unnecessary Elasticsearch load even when few clients need the feed.  
**Recommended fix:** Add authenticated socket handshake, role-aware room subscription, and server-side event projection with least-privilege fields. Move polling ownership toward a single producer or cache layer instead of per-process blind broadcasting.  
**Suggested rollout:** Phase 1, immediately after route authz.

## High

### H1 — Tickets and Reports are exposed in production but remain scaffolds
**Subsystem:** Frontend + backend product surface  
**Evidence:** `client/src/App.jsx` routes `/tickets` and `/reports`; `client/src/components/layout/Sidebar.jsx` shows both modules; `client/src/pages/Tickets/TicketsPage.jsx` and `client/src/pages/Reports/ReportsPage.jsx` still render `"Module under development"`; `server/src/routes/tickets.js` only returns `{ message: 'tickets route ok' }`.  
**Impact:** Users can navigate to modules that look supported but are not actually implemented. This creates trust debt and makes smoke testing ambiguous because “page loads” does not mean “feature works.”  
**Recommended fix:** Either hide these modules behind a feature flag until real MVPs exist, or implement minimal end-to-end functionality before keeping them in the live sidebar.  
**Suggested rollout:** Phase 1.

### H2 — Validation coverage is still sparse across the API
**Subsystem:** Backend correctness / input safety  
**Evidence:** No repo usage of `express-validator`, Zod, or Joi was found. Route families such as `users`, `devices`, `sites`, and `alerts` pass `req.body` directly into Mongoose create/update operations.  
**Impact:** Malformed payloads, mass-assignment style mistakes, and inconsistent persisted state are still easy to introduce. This risk rises as more admin features go live.  
**Recommended fix:** Add schema validation middleware for all write routes, starting with `auth`, `users`, `devices`, `sites`, `alerts`, and AI settings/task-config mutation endpoints.  
**Suggested rollout:** Phase 1 to Phase 2.

### H3 — Dashboard and AI hot paths still fan out into many synchronous upstream queries
**Subsystem:** Backend performance / AI runtime  
**Evidence:** `server/src/routes/stats.js` uses large `Promise.all` batches across Elasticsearch and Mongo for `/api/stats/home` and `/api/stats/soc/overview`; `server/src/services/ai/context.js` rebuilds AI context from Elasticsearch, Zabbix, and Mongo on demand for each AI request.  
**Impact:** The app currently works, but latency will rise quickly as log volume and AI usage increase. The worst cases will show up as slow dashboard loads, slow brief generation, slow triage, and timeouts that appear “random” to users.  
**Recommended fix:** Introduce pre-aggregated stats where practical, cache more aggressively around expensive AI context fragments, and separate “gather context” from “call model” into a measurable pipeline.  
**Suggested rollout:** Start in Phase 1 with measurement and query caps, continue in Phase 3 with architectural changes.

### H4 — Zabbix failure handling still masks dependency outages as empty data
**Subsystem:** Zabbix integration / observability  
**Evidence:** `server/src/routes/zabbix.js` returns `[]` or `{ connected: false }` in many catch blocks instead of returning clear upstream failure metadata.  
**Impact:** A broken Zabbix token, slow Zabbix API, or upstream outage can look like “no hosts” or “no problems” instead of a real dependency failure. That is dangerous for both dashboards and AI context quality.  
**Recommended fix:** Return explicit dependency health fields and partial-failure metadata. Prefer `502/503` for true upstream failure cases where the UI should show degraded mode.  
**Suggested rollout:** Phase 1.

### H5 — The repository still has no meaningful automated tests
**Subsystem:** Delivery confidence  
**Evidence:** `server/npm test` exits with “No tests found”; no meaningful test suite was discovered for critical route families or production flows.  
**Impact:** The platform is now large enough that manual verification alone will not protect core flows. Every improvement backlog item currently carries elevated regression risk.  
**Recommended fix:** Add a minimum automated suite covering auth, stats, AI task config, core AI routes, and one production-like smoke path. The existing `scripts/e2e-ai-workflow.mjs`, `scripts/prod-smoke.sh`, and `scripts/prod-backup.sh` are a good base for formalization.  
**Suggested rollout:** Phase 1.

### H6 — Elasticsearch TLS verification is explicitly disabled
**Subsystem:** Data-source security  
**Evidence:** `server/src/config/elasticsearch.js` sets `tls.rejectUnauthorized: false`.  
**Impact:** Misconfigured certificates and man-in-the-middle conditions are masked instead of rejected. This is survivable in local/dev, but a poor default for production-backed code.  
**Recommended fix:** Make TLS verification default to secure behavior and only allow insecure mode through an explicit env flag for development.  
**Suggested rollout:** Phase 2.

## Medium

### M1 — Frontend route access and navigation are role-blind
**Subsystem:** Frontend authz / UX  
**Evidence:** `client/src/App.jsx` uses `PrivateRoute` that checks only token presence, and `client/src/components/layout/Sidebar.jsx` renders the full nav for every authenticated user.  
**Impact:** Users see modules they may not be allowed to manage, including `Admin`, scaffold pages, and future modules. The backend is the real authority, but the frontend still creates a confusing and noisy experience.  
**Recommended fix:** Introduce a frontend capability map keyed by `user.role`, hide inapplicable nav items, and align visible modules with actual backend policy.  
**Suggested rollout:** Phase 2.

### M2 — AI timeout is configurable now, but AI execution is still synchronous and non-streaming
**Subsystem:** AI UX / runtime behavior  
**Evidence:** `client/src/api/ai.js` now applies configurable AI request timeouts and `client/src/pages/AI/AIPage.jsx` exposes a timeout setting, but the provider path is still request/response, non-streaming, and without user-visible cancellation.  
**Impact:** The timeout problem is improved, but not eliminated. Heavy prompts still block until full completion, and the UI cannot show partial model output or cancel long jobs cleanly.  
**Recommended fix:** Move toward streamed responses for chat-like tasks and job-based execution for longer workflows such as briefs or model comparison.  
**Suggested rollout:** Phase 3.

### M3 — AI history and scoring collections are under-indexed
**Subsystem:** MongoDB / AI persistence  
**Evidence:** `rg "\.index\(" server/src/models` returned only `AIBaseline`; models such as `AIScore`, `AIBrief`, and `AIAnomaly` rely on timestamped history access patterns but define no explicit secondary indexes.  
**Impact:** History views, scoreboards, and scheduled-task retention will degrade as the AI module accumulates data.  
**Recommended fix:** Add indexes for fields like `createdAt`, `runAt`, `task`, `provider`, and `triggeredBy` where history and admin queries depend on them.  
**Suggested rollout:** Phase 2 to Phase 3.

### M4 — Frontend bundle remains large and AI is loaded eagerly
**Subsystem:** Frontend performance  
**Evidence:** `vite build` still emits a main JS bundle of `724.75 kB`, triggering the large-chunk warning.  
**Impact:** Initial load cost is higher than it should be, especially because the AI surface is one of the heaviest parts of the app.  
**Recommended fix:** Split by route and lazily load the AI page and any large chart-heavy modules. Consider splitting AI tab subtrees if the page continues to grow.  
**Suggested rollout:** Phase 3.

### M5 — Alert engine and live feed are still fixed polling loops without multi-instance coordination
**Subsystem:** Background reliability / scaling  
**Evidence:** `server/src/services/alertEngine.js` runs every 60 seconds and evaluates each enabled rule directly against Elasticsearch; `server/src/services/websocket.js` polls Elasticsearch every 5 seconds. Neither path uses locking or distributed coordination.  
**Impact:** The current single-instance deployment is acceptable, but multi-instance or higher-load deployments will duplicate work and inflate Elasticsearch traffic.  
**Recommended fix:** Add leader-election or queue-based ownership for recurring jobs and reuse aggregated/cache outputs where possible.  
**Suggested rollout:** Phase 3.

### M6 — Production operations are improved, but observability is still mostly manual
**Subsystem:** Operations  
**Evidence:** The repo now contains `docs/production-runbook.md`, `scripts/prod-smoke.sh`, `scripts/prod-backup.sh`, and a public `/health`, but no repository-managed alerting or metrics pipeline for repeated AI failures, scheduler failures, or container restarts.  
**Impact:** The system is operable, but incidents will still be discovered mostly by users or manual inspection instead of proactive detection.  
**Recommended fix:** Add health, restart, scheduler, and repeated-5xx alerting; create a basic ops dashboard for AI/provider status and task outcomes.  
**Suggested rollout:** Phase 1 to Phase 2.

### M7 — No repository-managed Elasticsearch templates or ILM definitions were found
**Subsystem:** Elasticsearch lifecycle management  
**Evidence:** No repo-level ILM or index-template definitions were found during code/config inspection.  
**Impact:** Mapping drift and retention growth are likely being managed out of band, if at all. That creates risk for long-term scale and reproducibility.  
**Recommended fix:** Add documented index templates and lifecycle policy ownership, even if the actual application occurs outside the app repo.  
**Suggested rollout:** Phase 3.

## Low

### L1 — AI page still contains dead placeholder code from the earlier scaffold phase
**Subsystem:** Frontend maintainability  
**Evidence:** `client/src/pages/AI/AIPage.jsx` still contains `TabPlaceholder` with the `"Coming in next step"` copy, even though the production AI surface is now implemented.  
**Impact:** No runtime impact today, but it is a maintenance smell and can confuse future contributors during audits or feature work.  
**Recommended fix:** Remove dead scaffold helpers and keep the AI page focused on active surfaces only.  
**Suggested rollout:** Phase 4.

---

## Latency and Timeout Ownership

This is the main architectural theme behind the next round of AI improvements.

| Layer | Current Behavior | Observed Risk | Owner |
|------|------------------|---------------|-------|
| Shared frontend API client | `30s` timeout in `client/src/api/client.js` | Good for standard CRUD/status APIs, not enough for complex AI by itself | Frontend |
| AI frontend client | Configurable timeout in `client/src/api/ai.js`, set in AI Settings | Better than before, but still full-response request/response | Frontend |
| AI context gathering | `server/src/services/ai/context.js` calls Elasticsearch, Zabbix, and Mongo synchronously | Context time is added before model time even starts | Backend |
| Dashboard aggregation | `server/src/routes/stats.js` issues large `Promise.all` batches | Slow dashboards and cache misses can bleed into perceived “AI slowness” | Backend |
| Ollama provider | `60s` chat timeout, `300s` model pull timeout in `server/src/services/ai/providers/ollama.js` | Large prompts or slower models still need careful UX and job strategy | AI runtime |
| Claude/OpenAI providers | No explicit request timeout wrapper in provider files | SDK defaults may not match UI expectations | AI runtime |

### What this means in practice

- “AI is slow” is often a combined effect of context gathering, upstream data-source latency, and model latency.
- The new UI timeout setting is the correct short-term control.
- The longer-term fix is to stream or background the heavy flows instead of making every AI action synchronous.

---

## Implementation Backlog

## Phase 1 — Reliability + Production Safety

- Lock down admin-only route families:
  - `users`
  - `devices`
  - `sites`
  - `alerts`
- Add authenticated Socket.io handshake and limit event broadcast scope
- Remove or hide production-visible scaffolds (`Tickets`, `Reports`) until MVPs exist
- Add validation middleware to all write routes
- Surface Zabbix dependency failures explicitly instead of returning empty data
- Add automated smoke/integration coverage for auth, stats, AI task config, and one end-to-end AI path
- Add basic ops alerting for `/health`, container restarts, scheduler failure, and repeated `/api/ai/*` 5xx

## Phase 2 — Security + Correctness

- Introduce role-aware frontend navigation and capability-based route visibility
- Make Elasticsearch TLS verification secure-by-default
- Add Mongo indexes for AI history/config collections
- Normalize error contracts across `zabbix`, `ai`, `ml`, and operational CRUD routes
- Add schema-level validation around admin/config forms and corresponding backend contracts

## Phase 3 — Performance + Scalability

- Refactor heavy stats and AI context building to reduce synchronous upstream fan-out
- Add stronger caching/pre-aggregation for `home`, `soc/overview`, and AI context fragments
- Split the frontend bundle by route and lazily load the AI page and other heavy surfaces
- Rework alert engine and live feed ownership for multi-instance safety
- Add Elasticsearch templates and retention/ILM ownership
- Move AI heavy flows toward streaming or background-job execution

## Phase 4 — Product UX + Observability

- Remove dead scaffold code and old placeholders
- Finish real Tickets and Reports MVPs, or formally feature-flag them
- Add AI usage metrics, audit trail, and operator-facing task-health dashboards
- Improve cancel/retry visibility for long AI tasks
- Add deeper production dashboards for scheduler runs, provider fallback events, and upstream dependency health

---

## Recommended Next Sequence

1. Fix backend authz for operational CRUD routes.
2. Secure and scope the Socket.io live feed.
3. Remove or hide scaffolded modules from the production nav until they are real.
4. Add write-route validation and formalize a minimum test suite.
5. Start measuring and reducing the Elasticsearch/Zabbix/Mongo fan-out behind dashboards and AI.

That sequence gives NetPulse the biggest reliability and safety gain with the least architectural churn.
