const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function testJWTTampering() {
  console.log("🔒 Running JWT Tampering Security Tests...");

  const endpoints = ['/copilot/recruiter', '/resumes', '/cost/analytics'];
  
  // 1. Missing Token
  for (const endpoint of endpoints) {
    try {
      await axios.get(`${API_URL}${endpoint}`);
      console.error(`❌ FAIL: Missing token allowed on ${endpoint}`);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log(`✅ PASS: Missing token rejected on ${endpoint}`);
      } else {
        console.error(`❌ FAIL: Unexpected status ${err.response?.status} on ${endpoint}`);
      }
    }
  }

  // 2. Tampered Signature
  const tamperedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsIm9yZ2FuaXphdGlvbklkIjoib3JnXzEyMyJ9.INVALID_SIGNATURE";
  
  try {
    await axios.get(`${API_URL}/cost/analytics`, {
      headers: { Authorization: `Bearer ${tamperedToken}` }
    });
    console.error(`❌ FAIL: Tampered token allowed!`);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log(`✅ PASS: Tampered token rejected.`);
    }
  }
}

testJWTTampering();
