import http from "k6/http";
import { check } from "k6";

// Light background traffic so the agent sees headroom and scales back down
// (SCALE_DOWN) once the spike is over. Run:
//   BASE_URL=http://<ALB_DNS> npm run load:calm
const BASE = __ENV.BASE_URL || "http://localhost:8080";

export const options = {
  scenarios: {
    calm: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 15),
      timeUnit: "1s",
      duration: __ENV.DURATION || "3m",
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
};

export default function () {
  // Low cardinality keeps the cache warm, so CPU stays low and the fleet relaxes.
  const id = Math.floor(Math.random() * 50);
  const res = http.get(`${BASE}/pay?id=${id}`);
  check(res, { "status is 200": (r) => r.status === 200 });
}
