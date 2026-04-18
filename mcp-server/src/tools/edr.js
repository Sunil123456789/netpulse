'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_edr_stats',
    description: 'Get SentinelOne EDR statistics: total events, threat detections, USB device events, unique endpoints, sites, and active users in the time window.',
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
  {
    name: 'get_edr_events',
    description: 'Get recent SentinelOne endpoint detection events with details: endpoint name, event type, threat name, severity, site, user, and timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['15m', '1h', '6h', '12h', '24h', '3d', '7d', '30d'],
          default: '24h',
        },
        type: {
          type: 'string',
          enum: ['all', 'threat', 'usb', 'process'],
          default: 'all',
          description: 'Filter by event type.',
        },
        site:     { type: 'string', description: 'Filter by site name.' },
        endpoint: { type: 'string', description: 'Filter by endpoint/hostname.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          default: 50,
        },
      },
      required: [],
    },
  },
];

const handlers = {
  async get_edr_stats({ range = '24h', from, to } = {}) {
    return client.get('/api/edr/stats', { query: { range, from, to } });
  },
  async get_edr_events({ range = '24h', type = 'all', site, endpoint, limit = 50 } = {}) {
    return client.get('/api/edr/events', { query: { range, type, site, endpoint, limit } });
  },
};

module.exports = { definitions, handlers };
