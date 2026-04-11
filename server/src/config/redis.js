import Redis from 'ioredis'

let redis

export async function connectRedis() {
  redis = new Redis(process.env.REDIS_URL)
  redis.on('connect', () => console.log('Redis connected'))
  redis.on('error', err => console.error('Redis error:', err.message))
  return redis
}

export function getRedis() {
  return redis
}
