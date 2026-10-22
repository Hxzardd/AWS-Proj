import Redis from "ioredis";
import { getServerEnv } from "@/lib/config";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis() {
  if (!globalForRedis.redis) {
    const { REDIS_URL } = getServerEnv();
    globalForRedis.redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  return globalForRedis.redis;
}

export async function ensureRedis() {
  const redis = getRedis();
  if (redis.status === "wait") await redis.connect();
  return redis;
}
