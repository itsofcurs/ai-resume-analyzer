import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 50 },
    { duration: '30s', target: 200 },
    { duration: '15s', target: 0 },
  ],
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export default function () {
  const headers = { 
    'Authorization': `Bearer test-token-org-1`
  };

  const res = http.get(`${BASE_URL}/operations/health`, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'queues health returned': (r) => JSON.parse(r.body).queues !== undefined,
  });

  sleep(1);
}
