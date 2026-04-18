'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_soc_overview',
    description: 'Get a full SOC dashboard snapshot: firewall event counts (total, denied, IPS, UTM, VPN), traffic timeline, top threat signatures, top denied source IPs by country, recent critical events, and active sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['15m', '1h', '6h', '12h', '24h', '3d', '7d', '30d'],
          description: 'Relative time range. Defaults to 24h.',
          default: '24h',
        },
        from: { type: 'string', description: 'Absolute start time (ISO 8601). Overrides range.' },
        to:   { type: 'string', description: 'Absolute end time (ISO 8601). Use with from.' },
      },
      required: [],
    },
  },
  {
    name: 'get_noc_stats',
    description: 'Get NOC statistics from Cisco syslog: total events, interface up/down changes, MAC flap notifications, VLAN mismatch events, and active sites.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['15m', '1h', '6h', '12h', '24h', '3d', '7d', '30d'],
          default: '24h',
        },
        from: { type: 'string', description: 'Absolute start time (ISO 8601).' },
        to:   { type: 'string', description: 'Absolute end time (ISO 8601).' },
      },
      required: [],
    },
  },
];

const handlers = {
  async get_soc_overview({ range = '24h', from, to } = {}) {
    return client.get('/api/stats/soc/overview', { query: { range, from, to } });
  },
  async get_noc_stats({ range = '24h', from, to } = {}) {
    return client.get('/api/stats/noc', { query: { range, from, to } });
  },
};

module.exports = { definitions, handlers };
