'use strict';

const client = require('../client.js');

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache = null;
let cacheTime = 0;

const definition = {
  uri:         'netpulse://sites',
  name:        'NetPulse Sites',
  description: 'All registered sites/locations with name, IP ranges, timezone, and device counts.',
  mimeType:    'application/json',
};

async function read() {
  const now = Date.now();
  if (!cache || (now - cacheTime) > CACHE_TTL_MS) {
    cache = await client.get('/api/sites');
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
