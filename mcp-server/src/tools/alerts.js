'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_alert_rules',
    description: 'List all configured alert rules in NetPulse (threshold, anomaly, and pattern rules). Each rule shows name, type, source, condition, severity, actions (email/Slack), enabled state, cooldown, and last-fired time.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled_only: {
          type: 'boolean',
          default: false,
          description: 'Return only enabled/active rules.',
        },
        type: {
          type: 'string',
          enum: ['all', 'threshold', 'anomaly', 'pattern'],
          default: 'all',
          description: 'Filter by alert rule type.',
        },
      },
      required: [],
    },
  },
];

const handlers = {
  async get_alert_rules({ enabled_only = false, type = 'all' } = {}) {
    const data = await client.get('/api/alerts');
    let rules = Array.isArray(data) ? data : (data?.rules ?? data);
    if (enabled_only && Array.isArray(rules)) {
      rules = rules.filter(r => r.enabled !== false);
    }
    if (type !== 'all' && Array.isArray(rules)) {
      rules = rules.filter(r => r.type === type);
    }
    return Array.isArray(rules) ? rules : data;
  },
};

module.exports = { definitions, handlers };
