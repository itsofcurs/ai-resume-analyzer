# Operations Guide

## Daily Checks
1. **Queue Health**: Monitor BullMQ metrics via Grafana. Check if `Failed Job` rate exceeds 1%.
2. **LLM Cost Tracking**: Review FinOps Center. Ensure no tenant exceeds daily soft limits unexpectedly.
3. **Audit Log Volume**: Spikes in `SECURITY_ALERT` audits indicate potential scanning/brute-force attacks.

## Scaling Triggers
- If `processingTimeAvgS` > 10s: Scale AI Service workers (HPA target CPU: 70%).
- If Redis memory > 80%: Scale up ElastiCache instance class or reduce `CACHE_DEFAULT_TTL_S`.

## Common Runbooks
- **LLM Rate Limit Reached**: Switch default provider in `ai-service/.env` from Groq to OpenRouter fallback.
- **Tenant Stuck Jobs**: Use `manage_task` or the Operations Center UI to purge the stalled tenant's queue sandbox.
