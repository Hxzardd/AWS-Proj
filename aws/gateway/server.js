// Minimal payment-style gateway used for the live AWS demo. Each instance:
//   GET /pay?id=<n>  cache-first in a shared Redis; on a miss it burns CPU for a
//                    few ms (simulating signing/validation) then caches with the
//                    TTL the controller sets in SSM. High request-id cardinality
//                    or a low TTL => more misses => real CPU/latency bottleneck,
//                    which SCALE_UP (more instances) and CACHE_TTL_UP both relieve.
//   GET /health      target-group health check.
//   GET /fleet       fleet-wide aggregate of every instance's rolling stats, read
//                    from the shared Redis so any instance can answer. The
//                    controller scrapes this through the ALB.
//
// This exact file is embedded in aws/infra/stack.yml user-data; keep them in sync.
const http = require("http");
const os = require("os");
const Redis = require("ioredis");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const PORT = Number(process.env.PORT || 8080);
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const CACHE_TTL_PARAM = process.env.AWS_CACHE_TTL_PARAM || "/optimizer/cacheTtlSec";
const REGION = process.env.AWS_REGION || "ap-south-1";
const INSTANCE_ID = process.env.INSTANCE_ID || os.hostname();
const BURN_MS = Number(process.env.PAY_BURN_MS || 30);
const HEARTBEAT_MS = 2000;
const HEARTBEAT_TTL = 10;

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
const ssm = new SSMClient({ region: REGION });

let cacheTtlSec = 60;
let samples = [];
let reqCount = 0;
let hits = 0;
let misses = 0;

let lastCpu = cpuTimes();
function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}
function cpuPercent() {
  const now = cpuTimes();
  const idle = now.idle - lastCpu.idle;
  const total = now.total - lastCpu.total;
  lastCpu = now;
  return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0;
}

function burn(ms) {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) x += Math.sqrt(Math.random() * 1e6);
  return x;
}

function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/health") {
    res.writeHead(200);
    return res.end("ok");
  }
  if (path === "/fleet") return fleet(res);

  const start = Date.now();
  reqCount++;
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "default";
    const key = `pay:${id}`;
    const cached = await redis.get(key);
    if (cached) {
      hits++;
    } else {
      misses++;
      burn(BURN_MS);
      await redis.set(key, JSON.stringify({ ok: true, at: Date.now() }), "EX", Math.max(5, cacheTtlSec));
    }
    const ms = Date.now() - start;
    samples.push(ms);
    if (samples.length > 500) samples.shift();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, instance: INSTANCE_ID, cached: Boolean(cached), ms }));
  } catch {
    samples.push(Date.now() - start);
    res.writeHead(500);
    res.end("error");
  }
});

async function fleet(res) {
  try {
    const ids = await redis.smembers("fleet:instances");
    const live = [];
    for (const id of ids) {
      const h = await redis.hgetall(`fleet:hb:${id}`);
      if (h && h.ts) live.push(h);
      else await redis.srem("fleet:instances", id);
    }
    const n = live.length || 1;
    const sum = (field) => live.reduce((acc, h) => acc + Number(h[field] || 0), 0);
    const totalHits = sum("hits");
    const totalMiss = sum("misses");
    const body = {
      p95LatencyMs: Math.max(0, ...live.map((h) => Number(h.p95 || 0))),
      latencyMs: sum("avg") / n,
      requestRate: sum("rps"),
      throughput: sum("rps"),
      cpuPct: sum("cpu") / n,
      memPct: sum("mem") / n,
      cacheHitRatio: totalHits + totalMiss > 0 ? totalHits / (totalHits + totalMiss) : 0.8,
      networkLatencyMs: 20,
      instanceCount: live.length,
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  } catch {
    res.writeHead(500);
    res.end("fleet error");
  }
}

async function heartbeat() {
  const secs = HEARTBEAT_MS / 1000;
  const data = {
    ts: String(Date.now()),
    rps: String(reqCount / secs),
    p95: String(p95(samples)),
    avg: String(samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0),
    cpu: String(cpuPercent()),
    mem: String(100 * (1 - os.freemem() / os.totalmem())),
    hits: String(hits),
    misses: String(misses),
  };
  reqCount = 0;
  hits = 0;
  misses = 0;
  samples = samples.slice(-200);
  try {
    await redis.sadd("fleet:instances", INSTANCE_ID);
    await redis.hset(`fleet:hb:${INSTANCE_ID}`, data);
    await redis.expire(`fleet:hb:${INSTANCE_ID}`, HEARTBEAT_TTL);
  } catch {}
}

async function pollTtl() {
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: CACHE_TTL_PARAM }));
    const value = Number(out.Parameter && out.Parameter.Value);
    if (Number.isFinite(value) && value > 0) cacheTtlSec = value;
  } catch {}
}

setInterval(heartbeat, HEARTBEAT_MS);
setInterval(pollTtl, 5000);
pollTtl();
server.listen(PORT, () => console.log(`gateway listening on :${PORT} as ${INSTANCE_ID}`));
