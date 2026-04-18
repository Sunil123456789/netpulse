'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'search_logs',
    description: 'Search firewall (Fortigate) or Cisco syslog events in Elasticsearch. Returns paginated hits with severity breakdowns. Use for incident investigation, IP lookups, and pattern hunting.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['firewall', 'cisco'],
          description: 'Log source to search.',
          default: 'firewall',
        },
        q: {
          type: 'string',
          description: 'Free-text search query. Firewall: searches app, attack, IPs, country, message. Cisco: searches message, mnemonic, device, site.',
        },
        range: {
          type: 'string',
          enum: ['15m', '1h', '6h', '12h', '24h', '3d', '7d', '30d'],
          default: '24h',
          description: 'Relative time window.',
        },
        from:     { type: 'string', description: 'Absolute start time (ISO 8601).' },
        to:       { type: 'string', description: 'Absolute end time (ISO 8601).' },
        severity: {
          type: 'string',
          enum: ['all', 'critical', 'high', 'medium', 'low', 'info'],
          description: 'Filter by severity.',
        },
        srcip:    { type: 'string', description: 'Filter by exact source IP (firewall only).' },
        dstip:    { type: 'string', description: 'Filter by exact destination IP (firewall only).' },
        action:   { type: 'string', enum: ['all', 'allow', 'deny'], description: 'Firewall action filter.' },
        logtype:  { type: 'string', description: 'Firewall log subtype: traffic, utm, ips, vpn.' },
        device:   { type: 'string', description: 'Filter by device name (cisco only).' },
        site:     { type: 'string', description: 'Filter by site name (cisco only).' },
        mnemonic: { type: 'string', description: 'Cisco mnemonic filter, e.g. UPDOWN, MACFLAP_NOTIF.' },
        size: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          default: 50,
          description: 'Results per page.',
        },
        page: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Zero-based page number.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_events',
    description: 'Get the most recent firewall and Cisco events feed — same data as the live dashboard stream. Returns last N events from both sources.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Number of recent events to return per source.',
        },
      },
      required: [],
    },
  },
];

const handlers = {
  async search_logs({ type = 'firewall', q, range = '24h', from, to, severity, srcip, dstip, action, logtype, device, site, mnemonic, size = 50, page = 0 } = {}) {
    return client.get('/api/logs/search', {
      query: { type, q, range, from, to, severity, srcip, dstip, action, logtype, device, site, mnemonic, size, page },
    });
  },
  async get_recent_events({ limit = 20 } = {}) {
    return client.get('/api/logs/recent', { query: { limit } });
  },
};

module.exports = { definitions, handlers };
