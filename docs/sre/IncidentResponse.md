# Incident Response Plan

## 1. Triage & Classification
- **SEV-1**: Complete platform outage or data breach. (Response: 15 mins)
- **SEV-2**: Core feature degraded (e.g., AI parsing down). (Response: 30 mins)
- **SEV-3**: Minor bug or single tenant issue. (Response: 2 hours)

## 2. Communication
- Post updates to StatusPage every 30 minutes for SEV-1.
- Open War Room bridge.

## 3. Resolution
- SREs have authority to bypass CI/CD for hotfixes.
- Use `ops/backup/*` for immediate point-in-time restores if data corruption occurs.
