#!/bin/bash
# Simulates AI service timeout/failure

echo "⚠️ Injecting Chaos: Stopping Python AI Service"
docker stop talentai-ai-service || pkill -f "uvicorn main:app" || echo "Could not stop ai service"
echo "AI Service stopped. Watch node backend gracefully handle timeouts and retries."
