#!/bin/bash
# Simulates killing the backend worker processes

echo "⚠️ Injecting Chaos: Killing Node workers"
pkill -f "node dist/server.js" || echo "No workers found"
echo "Workers killed. Watch BullMQ for DLQ movement and retries."
