import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export default function () {
  const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer test-token-org-1`
  };

  const payload = JSON.stringify({
    recommendation_payload: {
      candidate_id: "cand_123",
      score: 0.95
    }
  });

  // Assume synchronous endpoint or async with quick turnaround
  const res = http.post(`${BASE_URL}/copilot/explain`, payload, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'confidence returned': (r) => JSON.parse(r.body).confidence !== undefined,
  });

  sleep(1);
}
