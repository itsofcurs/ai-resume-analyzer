import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 1000 }, // Target 1000 recruiters
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
    query: "Find me a senior frontend developer who knows React and GraphQL",
    jobId: "job_123"
  });

  const res = http.post(`${BASE_URL}/copilot/recruiter`, payload, { headers });

  check(res, {
    'status is 202': (r) => r.status === 202,
    'jobId returned': (r) => JSON.parse(r.body).jobId !== undefined,
  });

  sleep(1);
}
