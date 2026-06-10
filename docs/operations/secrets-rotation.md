# Secrets Rotation Policy

## 1. Database Credentials (PostgreSQL / MongoDB / Redis)
- **Rotation Frequency:** 90 Days
- **Process:**
  1. Generate new credentials in Secrets Manager.
  2. Deploy application with updated Env vars (Rolling restart).
  3. Validate connectivity.
  4. Revoke old credentials.

## 2. JWT Signing Secrets
- **Rotation Frequency:** 180 Days
- **Process:**
  1. Issue `SECRET_KEY_V2`.
  2. Application accepts both V1 and V2 during 24h grace period.
  3. Application issues new tokens using V2.
  4. Deprecate V1.

## 3. LLM API Keys (Gemini, Groq, OpenRouter)
- **Rotation Frequency:** 30 Days
- **Process:**
  1. Generate new API Key from Provider Portal.
  2. Update Kubernetes Secret / Env var.
  3. Cycle AI Service pods.
  4. Ensure `AICost` module tracks without interruption.
