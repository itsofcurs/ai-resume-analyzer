# Environment Matrix

TalentAI maintains three strictly isolated environments:

| Feature | Local (Dev) | Staging | Production |
|---|---|---|---|
| **Database** | Docker (localhost) | AWS RDS (db.t3.medium) | AWS RDS Multi-AZ (db.r6g.xlarge) |
| **Cache/Queue** | Redis Docker | ElastiCache (cache.t3.micro) | ElastiCache Cluster (cache.r6g.large) |
| **AI Models** | Gemini Flash / Llama 3 8B | Llama 3 70B / Gemini Pro | Gemini Pro / Claude 3.5 Sonnet |
| **Storage** | Local Volume | S3 Bucket (staging) | S3 Bucket (production, replicated) |
| **Telemetry** | Local Prometheus | Datadog / OTEL | Datadog Enterprise |
| **Billing** | Stripe Test Mode | Stripe Test Mode | Stripe Live Mode |
| **SLAs** | None | Best Effort | 99.9% Uptime Guarantee |
