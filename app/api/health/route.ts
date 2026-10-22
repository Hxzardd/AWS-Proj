import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureRedis } from "@/lib/redis";

export async function GET() {
  const checks = { database: false, redis: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }
  try {
    const redis = await ensureRedis();
    checks.redis = (await redis.ping()) === "PONG";
  } catch {
    checks.redis = false;
  }
  const healthy = checks.database && checks.redis;
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
