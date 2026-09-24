# Phase 11: Environment Topologies & Configuration

This document specifies the environment separation, secret key variables, and domain topologies for the **Motionz Onboarding Portal**.

---

## 1. Environment Architecture

The platform operates across three isolated environments:

| Environment | Purpose | URL / Domain Pattern | Database Instance |
| :--- | :--- | :--- | :--- |
| **Development** | Local engineering and feature branch development | `http://localhost:3000` | Local Supabase Docker / Dev DB |
| **Staging** | QA, integration validation, and user acceptance testing | `https://staging-portal.motionz.ai` | Supabase Staging Project (Isolated) |
| **Production** | Live multi-tenant operational portal | `https://portal.motionz.ai` | Supabase Production Project (High Availability) |

---

## 2. Environment Variables Specification

```ini
# ==============================================================================
# CORE SYSTEM & DATABASE
# ==============================================================================
NEXT_PUBLIC_APP_URL="https://portal.motionz.ai"
NODE_ENV="production"
PORT=3000

# Supabase Managed Database
NEXT_PUBLIC_SUPABASE_URL="https://[project-ref].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require"

# Master Application Encryption Key (AES-256-GCM for tenant API secrets)
TENANT_ENCRYPTION_KEY="[64-character hex encryption key]"

# Authentication & Sessions
AUTH_SECRET="[random-32-byte-hex-string]"
NEXT_PUBLIC_AUTH_COOKIE_NAME="__motionz_session"

# ==============================================================================
# INTEGRATION API KEYS & WEBHOOK SECRETS
# ==============================================================================

# GoHighLevel Integration
GHL_AGENCY_API_KEY="[motionz agency api key]"
GHL_WEBHOOK_SECRET="[whsec_...]"

# Google Cloud (Service Account JSON for Sheets Sync)
GOOGLE_SERVICE_ACCOUNT_JSON="{\"type\": \"service_account\", ...}"

# Slack Operational Webhooks
SLACK_WEBHOOK_ONBOARDING="https://hooks.slack.com/services/T.../B.../..."
SLACK_WEBHOOK_WEBSITE="https://hooks.slack.com/services/T.../B.../..."
SLACK_WEBHOOK_SECURITY="https://hooks.slack.com/services/T.../B.../..."

# AI Engine Credentials
OPENAI_API_KEY="sk-proj-..."
ANTHROPIC_API_KEY="sk-ant-..."
ELEVENLABS_API_KEY="eleven_..."
ELEVENLABS_AGENT_ID="agent_..."

# Social Publishing (Ayrshare)
AYRSHARE_API_KEY="[ayrshare api key]"

# Web Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY="BEl62iUYgUivxIkv69yViEuiBIa-..."
VAPID_PRIVATE_KEY="[private key]"
VAPID_SUBJECT="mailto:support@motionz.ai"
```
