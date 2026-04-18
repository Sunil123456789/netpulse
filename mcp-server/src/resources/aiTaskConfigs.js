'use strict';

const client = require('../client.js');

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let cache = null;
let cacheTime = 0;

const definition = {
  uri:         'netpulse://ai-task-configs',
  name:        'NetPulse AI Task Configs',
  description: 'Current AI task configuration: provider, model, schedule, and enabled state for each task (chat, triage, brief, search, anomaly, comparison).',
  mimeType:    'application/json',
};

async function read() {
  const now = Date.now();
  if (!cache || (now - cacheTime) > CACHE_TTL_MS) {
    cache = await client.get('/api/ai/config');
    cacheTime = now;
  }
  return {
    contents: [{
      uri:      definition.uri,
      mimeType: 'application/json',
      text:     JSON.stringify(cache, null, 2),
    }],
  };
}

module.exports = { definition, read };
