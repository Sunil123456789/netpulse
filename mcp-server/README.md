# NetPulse MCP Server

Exposes NetPulse NOC/SOC data and AI features as MCP tools to Claude Desktop, Open WebUI (Ollama), VS Code Copilot, Cursor, and any other MCP-compatible client.

## Prerequisites

- Node.js 18+
- NetPulse running (dev: `http://localhost:5000`, or your remote URL)

---

## Installation

```bash
cd mcp-server
npm install
```

---

## Configuration

### Step 1 — Get a NetPulse JWT token

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))"
```

Copy the output token.

### Step 2 — Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and paste your token into `NETPULSE_TOKEN`.

---

## Running

```bash
# Standard
npm start

# With file watching (dev)
npm run dev

# Test with MCP Inspector UI
npm run inspect
```

---

## Claude Desktop Setup

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "netpulse": {
      "command": "node",
      "args": ["C:\\Users\\sunil.kumar8\\Desktop\\netpulse\\mcp-server\\src\\index.js"],
      "env": {
        "NETPULSE_URL": "http://localhost:5000",
        "NETPULSE_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "NETPULSE_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

Restart Claude Desktop. NetPulse tools will appear in the tool picker.

---

## Open WebUI (Ollama) Setup

1. Open WebUI → **Settings** → **Tools** → **MCP Servers**
2. Click **Add Server**
3. Set command: `node`
4. Set args: `["C:\\Users\\sunil.kumar8\\Desktop\\netpulse\\mcp-server\\src\\index.js"]`
5. Add env vars: `NETPULSE_URL`, `NETPULSE_TOKEN`
6. Save and reload

---

## Available Tools (20 total)

| Tool | Description |
|---|---|
| `get_soc_overview` | Full SOC dashboard snapshot — firewall counts, top threats, denied IPs |
| `get_noc_stats` | Cisco syslog stats — interface changes, MAC flaps, VLAN mismatches |
| `triage_alert` | AI-powered alert triage — severity, MITRE tactic, false-positive %, recommendation |
| `get_daily_brief` | Latest AI-generated daily intelligence brief |
| `generate_daily_brief` | Force-generate a new brief immediately |
| `search_logs` | Search firewall/Cisco logs by IP, severity, action, time range, and more |
| `get_recent_events` | Latest events from the live dashboard feed |
| `get_zabbix_problems` | Active Zabbix infrastructure problems with severity filter |
| `get_zabbix_hosts` | All Zabbix-monitored hosts with CPU/RAM metrics |
| `get_zabbix_overview` | Zabbix high-level summary |
| `run_nl_search` | Natural-language search across logs — ask in plain English |
| `get_edr_stats` | SentinelOne EDR statistics — threats, USB events, endpoints |
| `get_edr_events` | Recent endpoint detection events |
| `run_anomaly_detection` | On-demand ML anomaly scan vs stored baselines |
| `get_anomaly_history` | Previously detected anomaly records |
| `get_alert_rules` | List all configured alert rules |
| `get_ai_config` | Current AI task provider/model/schedule settings |
| `get_scheduler_status` | Task scheduler state — last/next run times |
| `get_ai_analytics` | AI usage stats — response times, token usage, error rates |
| `get_tickets` | List incident tickets |
| `create_ticket` | Create a new incident ticket |

## Available Resources (3 total)

| URI | Description | Cache TTL |
|---|---|---|
| `netpulse://devices` | All registered network devices | 5 min |
| `netpulse://sites` | All sites with IP ranges and timezone | 10 min |
| `netpulse://ai-task-configs` | AI task configuration per task | 2 min |

---

## Example Prompts

> "What's the current SOC status for the last 6 hours?"

> "Triage this alert: srcip=185.220.101.1, attack=SQL Injection, action=deny, srccountry=Russia"

> "Show me the top blocked countries in the last 24 hours"

> "Are there any critical Zabbix problems right now?"

> "Run anomaly detection on firewall traffic"

> "What does today's intelligence brief say?"

> "Search for all IPS events from China in the last 3 days"

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `401 Unauthorized` | Token expired — re-run the login curl and update `NETPULSE_TOKEN` |
| `Network error reaching NetPulse` | Check `NETPULSE_URL` — is NetPulse running? Try `http://127.0.0.1:5000` |
| `Zabbix is unavailable` | Zabbix not configured on the NetPulse server — check `ZABBIX_URL` env var |
| `Unknown tool` | Restart Claude Desktop / Open WebUI after config changes |
| Timeout errors | Increase `NETPULSE_TIMEOUT_MS` (e.g. `30000`) |
