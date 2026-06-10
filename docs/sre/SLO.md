# Service Level Objectives (SLOs)

## 1. Availability SLO
- **Target**: 99.9% uptime per month.
- **SLI**: HTTP 200/300/400 responses over total requests on the Node API.
- **Error Budget**: 43 minutes of downtime per month.

## 2. Latency SLO
- **Target**: 95% of synchronous requests served in < 300ms.
- **Target**: 99% of queue processing starts in < 2000ms.
- **SLI**: OpenTelemetry metric `http_server_duration` and `queue_wait_time_ms`.

## 3. Durability SLO
- **Target**: 99.999% of uploaded resumes successfully parsed without unhandled exceptions.
- **SLI**: Ratio of `resume_processed` vs `resume_failed`.
