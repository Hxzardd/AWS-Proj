import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ensureRedis } from "@/lib/redis";
import { getLatestMetrics, getSimulationSnapshot, startSimulation, stopSimulation } from "@/app/actions";

// Opt-in: uses the local database, creates only isolated compare runs, cleans up only those IDs.
describe.skipIf(process.env.RUN_STORAGE_TESTS !== "1")("MySQL + Redis integration", () => {
  const ids: string[] = [];
  beforeAll(() => { process.loadEnvFile(".env"); });
  afterAll(async () => {
    if (ids.length) await prisma.simulationRun.deleteMany({ where: { id: { in: ids } } });
    const redis = await ensureRedis();
    for (const id of ids) await redis.del(`simulation:${id}:latest`);
    await redis.quit(); await prisma.$disconnect();
  });
  it("persists matched observations, serves recent data past 240 rows, and never learns in comparison mode", async () => {
    const before = await prisma.qTableEntry.findMany({ orderBy: { id: "asc" } });
    const start = await startSimulation("compare", 20260922);
    expect(start.ok).toBe(true); if (!start.ok) throw new Error(start.error);
    const id = start.data.run.id; ids.push(id);
    for (let step=1; step<=125; step++) {
      const tick = await getLatestMetrics(id);
      expect(tick.ok).toBe(true); if (!tick.ok) throw new Error(tick.error);
      expect(tick.data.run.step).toBe(step);
    }
    const snapshot = await getSimulationSnapshot(id);
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.data.metrics).toHaveLength(240);
    expect(snapshot.data.metrics.at(-1)?.step).toBe(125);
    expect(snapshot.data.metrics[0].step).toBe(6);
    expect(snapshot.data.run.epsilon).toBe(0);
    expect(snapshot.data.run.episode).toBe(0);
    expect((await prisma.simulationRun.findUnique({ where: { id } }))?.policySnapshot).not.toBeNull();
    const latest = snapshot.data.metrics.filter((row) => row.step === 125);
    expect(latest[0].requestRate).toBe(latest[1].requestRate);
    expect(await prisma.qTableEntry.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    const redis = await ensureRedis();
    expect(await redis.ttl(`simulation:${id}:latest`)).toBeGreaterThan(0);
    const stopped = await stopSimulation(id); expect(stopped.ok).toBe(true);
    const afterStop = await getLatestMetrics(id);
    if (!afterStop.ok) throw new Error(afterStop.error);
    expect(afterStop.data.run.step).toBe(125);
  }, 60_000);
  it("serializes overlapping polls without duplicate metrics or lost steps", async () => {
    const start = await startSimulation("compare", 20260923);
    if (!start.ok) throw new Error(start.error);
    const id = start.data.run.id; ids.push(id);
    const results = await Promise.all(Array.from({ length: 12 }, () => getLatestMetrics(id)));
    expect(results.every((result) => result.ok)).toBe(true);
    const snapshot = await getSimulationSnapshot(id);
    if (!snapshot.ok) throw new Error(snapshot.error);
    const count = await prisma.metricSnapshot.count({ where: { runId: id } });
    expect(count).toBe(snapshot.data.run.step * 2);
    expect(snapshot.data.run.step).toBeGreaterThan(0);
    expect(snapshot.data.run.step).toBeLessThanOrEqual(12);
    expect(await (await ensureRedis()).get("optimizer:simulation:tick-lock")).toBeNull();
    await stopSimulation(id);
  });
});
