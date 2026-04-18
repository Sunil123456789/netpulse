'use strict';

const client = require('../client.js');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = null;
let cacheTime = 0;

const definition = {
  uri:         'netpulse://devices',
  name:        'NetPulse Devices',
  description: 'All registered network devices (Fortigate firewalls, Cisco switches/routers) with IP, type, site, and status.',
  mimeType:    'application/json',
};

async function read() {
  const now = Date.now();
  if (!cache || (now - cacheTime) > CACHE_TTL_MS) {
    cache = await client.get('/api/devices');
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
