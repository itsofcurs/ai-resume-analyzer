#!/bin/bash
# Simulates Postgres drop

echo "⚠️ Injecting Chaos: Stopping Postgres"
docker stop talentai-postgres || echo "Could not stop talentai-postgres"
echo "Postgres stopped. Watch readiness probes fail and traffic routing adjust."
