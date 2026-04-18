'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'run_anomaly_detection',
    description: 'Trigger a statistical anomaly detection run. Compares current metric values against stored ML baselines across firewall, Cisco, and/or SentinelOne data. Returns anomalies with severity, description, and recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string', enum: ['firewall', 'cisco', 'sentinel'] },
          default: ['firewall', 'cisco', 'sentinel'],
          description: 'Which log sources to scan.',
        },
        sensitivity: {
          type: 'number',
          minimum: 0.5,
          maximum: 5.0,
          default: 2.0,
          description: 'Standard-deviation multiplier for threshold. Lower = more sensitive.',
        },
        date_range: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to:   { type: 'string' },
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'get_anomaly_history',
    description: 'Get previously detected anomalies stored in NetPulse. Shows historical anomaly records with source, metric, baseline value, actual value, deviation score, and severity.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['1h', '6h', '12h', '24h', '3d', '7d', '30d'],
          default: '24h',
        },
        source: {
          type: 'string',
          enum: ['all', 'firewall', 'cisco', 'sentinel'],
          default: 'all',
        },
        severity: {
          type: 'string',
          enum: ['all', 'critical', 'high', 'medium', 'low'],
          default: 'all',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      required: [],
    },
  },
];

const handlers = {
  async run_anomaly_detection({ sources = ['firewall', 'cisco', 'sentinel'], sensitivity = 2.0, date_range } = {}) {
    return client.post('/api/ml/anomaly/detect', {
      body: { sources, sensitivity, dateRange: date_range },
    });
  },
  async get_anomaly_history({ range = '24h', source = 'all', severity = 'all', limit = 50 } = {}) {
    return client.get('/api/ml/anomaly/history', { query: { range, source, severity, limit } });
  },
};

module.exports = { definitions, handlers };
