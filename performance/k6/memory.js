import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 500 },
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
    query: "What did the candidate say about their previous React experience?",
    recruiterId: "rec_456"
  });

  // Testing memory search
  const res = http.post(`${BASE_URL}/copilot/memory/search`, payload, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
