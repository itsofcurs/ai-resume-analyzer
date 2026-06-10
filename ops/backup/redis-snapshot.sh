#!/bin/bash
# Redis Snapshot Script
REDIS_HOST=${REDIS_HOST:-'localhost'}
REDIS_PORT=${REDIS_PORT:-'6379'}

redis-cli -h $REDIS_HOST -p $REDIS_PORT BGSAVE
echo "Redis BGSAVE triggered."
