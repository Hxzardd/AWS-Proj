import http from "k6/http";
import { check } from "k6";

// Hold a steady high load so the bottleneck persists while you explain the
// agent's reaction. Tune RATE/DURATION:
//   BASE_URL=http://<ALB_DNS> RATE=200 DURATION=5m npm run load:sustain
const BASE = __ENV.BASE_URL || "http://localhost:8080";
const CARDINALITY = Number(__ENV.ID_CARDINALITY || 4000);

export const options = {
  scenarios: {
    sustain: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 200),
      timeUnit: "1s",
      duration: __ENV.DURATION || "5m",
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
  },
};

export default function () {
  const id = Math.floor(Math.random() * CARDINALITY);
  const res = http.get(`${BASE}/pay?id=${id}`);
  check(res, { "status is 200": (r) => r.status === 200 });
}
