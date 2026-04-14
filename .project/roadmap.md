# NetPulse — Post-Audit Roadmap

> This roadmap now tracks the live production baseline and the implementation plan that follows the 2026-04-15 full-stack audit.

---

## Current Status

- AI module is live in production.
- Production deployment is stabilized around host nginx + `docker-compose.prod.yml`.
- Public `/health`, smoke testing, backup automation, and a production runbook are in place.
- The platform is now in an “operations and hardening” phase, not an initial build phase.

---

## Pages — Live Surface vs Maturity

| Page | Route | Runtime Status | Product Maturity | Notes |
|------|-------|----------------|------------------|-------|
| Home | `/home` | ✅ Live | Medium | Core overview page is active |
| SOC | `/soc` | ✅ Live | Medium | Operationally useful, still query-heavy |
| NOC | `/noc` | ✅ Live | Medium | Operationally useful, still query-heavy |
| EDR | `/edr` | ✅ Live | Medium | Live page, needs deeper correctness/perf review later |
| Zabbix | `/zabbix` | ✅ Live | Medium | Needs better degraded-mode handling |
| AI | `/ai` | ✅ Live | High | Chat, Anomaly, Triage, Brief, Search, Model Lab, Settings |
| Admin | `/admin` | ✅ Live | Medium | Live, but backend authz still needs tightening |
| Tickets | `/tickets` | ✅ Routed | Low | Still scaffold-only |
| Reports | `/reports` | ✅ Routed | Low | Still scaffold-only |
| Login | `/login` | ✅ Live | Medium | JWT login flow with rate limiting |

---

## Architecture Baseline

### Frontend
- React 18 + Vite SPA
- Shared authenticated shell with sidebar navigation
- Zustand auth persistence
- AI-specific API layer with configurable timeout setting

### Backend
- Express API + Socket.io
- Route families for auth, stats, logs, admin/config, AI, ML, EDR, Zabbix
- Background services:
  - alert engine
  - AI scheduler
  - websocket live feed

### Data and Runtime
- Elasticsearch for logs and operational analytics
- MongoDB for users, config, tickets, AI history, baselines, and task configs
- Redis for cache/supporting runtime
- Zabbix for infrastructure state
- Ollama-first AI deployment, with optional Claude/OpenAI support

### Production
- Host nginx terminates TLS
- Docker Compose runs client/server/mongo/redis
- Public `/health` exposed
- Production smoke, backup, and runbook assets tracked in repo

---

## Post-Audit Priorities

## Phase 1 — Reliability + Production Safety

### Objective
Close the highest-risk live issues before adding new product scope.

### Work bucket
- Add admin authorization to `users`, `devices`, `sites`, and `alerts`
- Secure Socket.io and stop unauthenticated event broadcast
- Hide or disable scaffold-only `Tickets` and `Reports` in production navigation until MVPs exist
- Add request validation to all write routes
- Make Zabbix degraded mode explicit instead of silently returning empty results
- Add a minimum automated test suite for auth, stats, AI config, and one AI end-to-end flow
- Add simple production alerting for `/health`, restart loops, scheduler failures, and repeated AI/API `5xx`

## Phase 2 — Security + Correctness

### Objective
Align permissions, contracts, and persistence with the now-live operational surface.

### Work bucket
- Add role-aware frontend navigation and capability-based module visibility
- Make Elasticsearch TLS verification secure by default
- Add indexes for AI history/config collections
- Standardize backend error contracts and degraded-mode responses
- Tighten validation around admin/config mutation flows

## Phase 3 — Performance + Scalability

### Objective
Reduce latency from synchronous fan-out and prepare the app for heavier production usage.

### Work bucket
- Refactor `stats` and AI context building to reduce synchronous upstream query load
- Expand caching and pre-aggregation for heavy dashboard endpoints
- Lazy-load the AI page and other heavy routes
- Reduce bundle size and split large client chunks
- Add multi-instance-safe scheduling/polling ownership
- Document and own Elasticsearch templates and ILM outside ad hoc runtime behavior
- Move long AI flows toward streaming or async job patterns

## Phase 4 — Product UX + Observability

### Objective
Finish the parts of the product that are visible but not yet mature, and improve operator visibility.

### Work bucket
- Implement real Tickets MVP
- Implement real Reports MVP
- Add AI usage metrics and audit trail
- Improve cancel/retry behavior for long AI actions
- Add dashboards for scheduler runs, provider fallback, and dependency health
- Remove dead scaffold code and legacy placeholder helpers

---

## Operations Plan

### Current operating mode
- Ollama-first AI deployment
- Manual-first AI operations
- Production smoke test available through `scripts/prod-smoke.sh`
- Production backup available through `scripts/prod-backup.sh`
- Release marker created: `v1.0.0-ai-prod`

### Next operational moves
- Keep Claude/OpenAI disabled until valid paid keys are ready
- Enable scheduled anomaly jobs gradually, then scheduled briefs after observation
- Copy production backup archives off-server after each successful backup
- Add proactive alerting so operators do not rely on manual checks

---

## What Not To Do Next

- Do not expand the visible product surface before closing the authz gap on operational CRUD routes.
- Do not add more AI complexity before reducing the synchronous upstream load behind stats and AI context building.
- Do not treat scaffolded routes as “done” just because they render without crashing.

---

## Success Markers For The Next Milestone

- Admin-only data mutation is enforced on the backend.
- Socket.io live feed requires auth and scopes event delivery correctly.
- Tickets and Reports are either hidden or implemented enough to justify production visibility.
- A minimum automated test suite protects auth, stats, and AI core flows.
- Dashboard and AI latency is measured and reduced from the current synchronous fan-out model.

---

## Recent Milestones

- AI/ML module completed through Step 26
- Production deployment stabilized with host nginx + Docker Compose
- Public `/health` endpoint enabled
- Production runbook, smoke-check script, and backup script added
- AI defaults hardened for Ollama-first deployments
- Configurable AI timeout added to the AI Settings UI
- Release tag created: `v1.0.0-ai-prod`
- Full reliability-first audit completed and converted into this phased roadmap
