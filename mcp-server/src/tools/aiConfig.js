'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_ai_config',
    description: 'Get the current AI task configuration: which provider and model each task (chat, triage, brief, search, anomaly, comparison) is using, and their schedule settings.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          enum: ['all', 'chat', 'triage', 'brief', 'search', 'anomaly', 'comparison'],
          default: 'all',
          description: 'Filter to a specific task.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_scheduler_status',
    description: 'Get the NetPulse task scheduler status: which tasks are scheduled, their last run time, next run time, last run status, and last run duration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_ai_analytics',
    description: 'Get AI usage analytics: request counts, average response times, token usage, provider distribution, error rates, and user ratings over the specified period.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['1h', '6h', '12h', '24h', '3d', '7d', '30d'],
          default: '7d',
        },
        task: {
          type: 'string',
          enum: ['all', 'chat', 'triage', 'brief', 'search', 'anomaly', 'comparison'],
          default: 'all',
        },
      },
      required: [],
    },
  },
];

const handlers = {
  async get_ai_config({ task = 'all' } = {}) {
    const data = await client.get('/api/ai/config');
    if (task !== 'all' && Array.isArray(data)) {
      return data.filter(c => c.taskName === task || c.name === task);
    }
    return data;
  },
  async get_scheduler_status() {
    return client.get('/api/ai/scheduler/status');
  },
  async get_ai_analytics({ range = '7d', task = 'all' } = {}) {
    return client.get('/api/ai/analytics', { query: { range, task } });
  },
};

module.exports = { definitions, handlers };
