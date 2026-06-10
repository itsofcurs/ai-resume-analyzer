# SRE Runbooks

## Runbook: AI Service High Latency
1. **Symptom**: `http_server_duration` exceeds 5s for `/api/resumes/parse`.
2. **Action**: Check `ai-service` pod logs. 
3. **Action**: If LLM API provider is rate limiting, scale up backup LLM instance or trigger circuit breaker.

## Runbook: BullMQ Queue Backlog
1. **Symptom**: `queue_depth` > 100 for `resume-processing`.
2. **Action**: Check `queue_failure_total`. If high, investigate `resume-dlq`.
3. **Action**: Scale Node API workers by editing `node-api-hpa` minReplicas manually.

## Runbook: MongoDB High CPU
1. **Symptom**: Database latency spike.
2. **Action**: Check OpenTelemetry spans. Identify missing indexes. Run `db.currentOp()` and kill long-running aggregations.
