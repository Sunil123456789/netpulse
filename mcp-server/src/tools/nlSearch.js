'use strict';

const client = require('../client.js');

const definitions = [
  {
    name: 'run_nl_search',
    description: 'Run a natural-language search against NetPulse logs and metrics. The AI converts your question to an appropriate query, executes it, and returns structured results with interpretation. Example: "Show me top blocked countries in the last 6 hours" or "Which devices had the most interface flaps today?"',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          maxLength: 500,
          description: 'Plain-English question about the network or security data.',
        },
        source: {
          type: 'string',
          enum: ['auto', 'firewall', 'cisco', 'zabbix', 'mongo'],
          default: 'auto',
          description: 'Data source to target. auto lets the AI pick based on the question.',
        },
        date_range: {
          type: 'object',
          description: 'Optional time range override.',
          properties: {
            from: { type: 'string', description: 'Start time, e.g. now-6h or ISO 8601.' },
            to:   { type: 'string', description: 'End time, e.g. now or ISO 8601.' },
          },
        },
        provider: { type: 'string', enum: ['claude', 'openai', 'ollama'] },
        model:    { type: 'string', description: 'Override AI model ID.' },
      },
      required: ['question'],
    },
  },
];

const handlers = {
  async run_nl_search({ question, source = 'auto', date_range, provider, model } = {}) {
    return client.post('/api/ai/search', {
      body: { question, source, dateRange: date_range, provider, model },
    });
  },
};

module.exports = { definitions, handlers };
