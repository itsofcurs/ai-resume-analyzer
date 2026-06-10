# L1/L2 Support Guide

## SLA Categories
- **P0 (Critical):** Complete platform outage or data breach. Response time: < 15 mins.
- **P1 (High):** Major feature broken (e.g. Resume Parsing fails for all). Response time: < 1 hour.
- **P2 (Medium):** Single tenant issue, degradation. Response time: < 4 hours.
- **P3 (Low):** UI bugs, billing questions. Response time: < 24 hours.

## Triage Workflows
### Scenario: "LLM Parsing is timing out"
1. Check Global Health in Admin Portal.
2. If Global, verify `ai-service` pod logs. Check if upstream provider (Groq/Gemini) is down.
3. If Tenant-specific, check if Tenant hit their soft/hard limits in FinOps Center.
4. Escalate to L2 if LLM logic fails on specific PDF types (requires AI engineer to tune prompts).

### Scenario: "Billing Invoice is incorrect"
1. Verify Stripe Dashboard.
2. Cross-reference `AICost` table for the billing period.
3. If discrepancy exists, issue credit via Stripe and open P3 engineering ticket to investigate over-counting.
