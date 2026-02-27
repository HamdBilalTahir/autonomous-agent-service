import Redis from "ioredis";

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

export async function getCached(key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch (e) {
    console.warn("Redis error:", e);
    return null;
  }
}

export async function setCached(
  key: string,
  value: string,
  ttl: number = 86400,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, "EX", ttl);
  } catch (e) {
    console.warn("Redis error:", e);
  }
}
