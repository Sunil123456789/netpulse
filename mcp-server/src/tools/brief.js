'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'get_daily_brief',
    description: 'Retrieve the most recently generated daily intelligence brief. Returns executive summary, risk level, security/network/infrastructure sections with highlights and recommendations, and full markdown report.',
    inputSchema: {
      type: 'object',
      properties: {
        generate_if_missing: {
          type: 'boolean',
          description: 'If no brief exists yet today, trigger generation before returning.',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_daily_brief',
    description: 'Force-generate a new daily intelligence brief immediately, regardless of schedule. Returns the freshly generated brief.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['claude', 'openai', 'ollama'],
          description: 'Override AI provider for generation.',
        },
        model: { type: 'string', description: 'Override AI model ID.' },
      },
      required: [],
    },
  },
];

const handlers = {
  async get_daily_brief({ generate_if_missing = false } = {}) {
    try {
      return await client.get('/api/ai/brief/latest');
    } catch (err) {
      if (generate_if_missing && err?.message?.includes('404')) {
        await client.post('/api/ai/brief/generate', { body: {} });
        return client.get('/api/ai/brief/latest');
      }
      throw err;
    }
  },
  async generate_daily_brief({ provider, model } = {}) {
    return client.post('/api/ai/brief/generate', { body: { provider, model } });
  },
};

module.exports = { definitions, handlers };
