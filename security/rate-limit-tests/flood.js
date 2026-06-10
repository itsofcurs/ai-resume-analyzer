const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function testRateLimiting() {
  console.log("🌊 Running Rate Limit Flood Tests...");

  const validToken = "VALID_TOKEN_HERE";
  const requests = [];
  
  // Fire 100 concurrent requests to an endpoint that should be rate limited
  for (let i = 0; i < 100; i++) {
    requests.push(
      axios.post(`${API_URL}/copilot/recruiter`, { query: "test" }, {
        headers: { Authorization: `Bearer ${validToken}` },
        validateStatus: () => true // Resolve all statuses
      })
    );
  }

  const results = await Promise.all(requests);
  
  const tooManyRequests = results.filter(r => r.status === 429);
  const success = results.filter(r => r.status === 202 || r.status === 200);

  console.log(`Sent 100 requests.`);
  console.log(`Successful: ${success.length}`);
  console.log(`Rate Limited (429): ${tooManyRequests.length}`);

  if (tooManyRequests.length > 0) {
    console.log(`✅ PASS: Rate limiting is actively blocking requests.`);
  } else {
    console.error(`❌ FAIL: No requests were rate limited!`);
  }
}

testRateLimiting();
