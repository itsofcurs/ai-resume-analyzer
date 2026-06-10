# Disaster Recovery Guide

## RTO and RPO Goals
- **RTO (Recovery Time Objective):** 4 Hours
- **RPO (Recovery Point Objective):** 15 Minutes

## Scenarios
### 1. Database Corruption (PostgreSQL)
**Action:** Promote Read Replica or perform Point-In-Time-Recovery (PITR).
**Commands:**
```bash
aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier talentdb-prod --target-db-instance-identifier talentdb-prod-restore --restore-time <TIMESTAMP>
```
Update Secrets Manager to point to new instance.

### 2. Region Outage (us-east-1 goes down)
**Action:** Execute Multi-Region Failover to `us-west-2`.
1. Update Route53 DNS to point to `us-west-2` load balancer.
2. Cross-region read replicas in `us-west-2` automatically promoted to primary.
3. Start EKS clusters in `us-west-2`.

### 3. Ransomware / Malicious Tenant Activity
**Action:** Suspend Tenant & Restore Snapshot.
1. Use Admin Portal to revoke all API keys for tenant.
2. Purge tenant data using `purge_tenant.ts` script.
3. Lock tenant billing.
