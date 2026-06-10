const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function testCrossTenantIsolation() {
  console.log("🏢 Running Cross-Tenant Data Isolation Tests...");

  // Assume token generated for org_1
  const org1Token = "TOKEN_FOR_ORG_1"; // Mocked or generated in real scenario
  
  // Try to access resource explicitly owned by org_2
  const org2ResourceId = "resume_org2_12345";

  try {
    // In a real test, you'd mint a valid JWT for org_1 and attempt to fetch org_2's resource
    await axios.get(`${API_URL}/resumes/${org2ResourceId}`, {
      headers: { Authorization: `Bearer ${org1Token}` }
    });
    console.error(`❌ FAIL: Org 1 could access Org 2 resource!`);
  } catch (err) {
    if (err.response && (err.response.status === 403 || err.response.status === 404)) {
      console.log(`✅ PASS: Cross-tenant access blocked with ${err.response.status}`);
    } else {
      console.error(`❌ FAIL: Unexpected status ${err.response?.status}`);
    }
  }
}

testCrossTenantIsolation();
