#!/bin/bash
# Simulates Redis drop

echo "⚠️ Injecting Chaos: Stopping Redis"
docker stop talentai-redis || echo "Could not stop talentai-redis"
echo "Redis stopped. Watch application logs for queue recovery mechanisms."
