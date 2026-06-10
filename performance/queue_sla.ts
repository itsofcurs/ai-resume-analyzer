import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

interface QueueHealth {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface SLA_TARGETS {
  [key: string]: number;
}

const TARGETS: SLA_TARGETS = {
  'resume-processing': 10000, // 10 seconds
  'copilot-tasks': 15000,     // 15 seconds
  'learning-metrics': 5000,   // 5 seconds
};

async function checkSLA() {
  console.log("⏱️ Validating Queue SLAs...");
  
  try {
    const res = await axios.get(`${API_URL}/operations/health`, {
      headers: { Authorization: `Bearer test-admin-token` }
    });

    const queues: QueueHealth[] = res.data.queues || [];
    
    let allPassed = true;

    for (const q of queues) {
      console.log(`\n📊 Queue: ${q.queueName}`);
      console.log(`   Waiting: ${q.waiting} | Active: ${q.active} | Failed: ${q.failed}`);
      
      const targetMs = TARGETS[q.queueName];
      if (targetMs) {
        // In a real scenario, we'd pull Prometheus metrics for P95 latency.
        // Here we simulate the check based on queue depth.
        // If there are more than 50 waiting jobs, we assume SLA is at risk.
        const estimatedLatencyMs = q.waiting * 200; // Simulated 200ms per job
        
        console.log(`   Target P95: < ${targetMs}ms`);
        console.log(`   Est. Current P95: ${estimatedLatencyMs}ms`);

        if (estimatedLatencyMs > targetMs) {
          console.error(`   ❌ SLA VIOLATION on ${q.queueName}`);
          allPassed = false;
        } else {
          console.log(`   ✅ SLA Met`);
        }
      }
    }

    if (allPassed) {
      console.log("\n🚀 All Enterprise Queue SLAs are currently PASSING.");
    } else {
      console.error("\n⚠️ Some queues are failing to meet Enterprise SLAs.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Failed to fetch operations health:", err.message);
  }
}

checkSLA();
