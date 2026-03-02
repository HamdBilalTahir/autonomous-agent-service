import Redis from "ioredis";

// Fail-fast options prevent ioredis from queuing/retrying indefinitely
// when Redis is unreachable, which would hang the entire pipeline silently.
export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 0, // reject commands immediately instead of retrying
      enableOfflineQueue: false, // don't queue commands when not yet connected
      connectTimeout: 3000, // give up TCP handshake after 3s
      lazyConnect: true, // don't connect at import time — wait for first use
    })
  : null;

// Simple in-memory fallback for environments without Redis
const memoryCache = new Map<string, { value: string; expires: number }>();

export async function getCached(key: string): Promise<string | null> {
  if (!redis) {
    const cached = memoryCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expires) {
      memoryCache.delete(key);
      return null;
    }
    return cached.value;
  }

  try {
    return await redis.get(key);
  } catch (e) {
    console.warn("Redis error:", e);
    // Fallback to memory on Redis error? Could be safer.
    return null;
  }
}

export async function setCached(
  key: string,
  value: string,
  ttl: number = 86400,
): Promise<void> {
  if (!redis) {
    memoryCache.set(key, { value, expires: Date.now() + ttl * 1000 });
    // Cleanup expired keys occasionally could be added here
    return;
  }

  try {
    await redis.set(key, value, "EX", ttl);
  } catch (e) {
    console.warn("Redis error:", e);
  }
}

export async function deleteCached(key: string): Promise<void> {
  if (!redis) {
    memoryCache.delete(key);
    return;
  }
  try {
    await redis.del(key);
  } catch (e) {
    console.warn("Redis error:", e);
  }
}
