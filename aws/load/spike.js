import http from "k6/http";
import { check } from "k6";

// Flood the live gateway to create a real bottleneck, then release it. High id
// cardinality forces cache misses => CPU burn => latency climbs, so the agent
// must SCALE_UP / raise cache TTL to recover. Run:
//   BASE_URL=http://<ALB_DNS> npm run load:spike          (bash)
//   $env:BASE_URL="http://<ALB_DNS>"; npm run load:spike  (PowerShell)
const BASE = __ENV.BASE_URL || "http://localhost:8080";
const CARDINALITY = Number(__ENV.ID_CARDINALITY || 4000);

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 20,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { target: 20, duration: "20s" }, // steady baseline
        { target: 250, duration: "30s" }, // ramp into the bottleneck
        { target: 250, duration: "90s" }, // hold the peak while you narrate
        { target: 20, duration: "20s" }, // release
      ],
    },
  },
};

export default function () {
  const id = Math.floor(Math.random() * CARDINALITY);
  const res = http.get(`${BASE}/pay?id=${id}`);
  check(res, { "status is 200": (r) => r.status === 200 });
}
