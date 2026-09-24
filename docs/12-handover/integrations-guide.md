# Motionz Integrations Setup & Configuration Guide

This guide details the architecture, credential configuration, webhook handling, and adapter patterns for all third-party integrations in the Motionz Onboarding Portal.

---

## 1. Integration Adapter Architecture

All third-party services are decoupled through typed adapter contracts in `src/lib/integrations/`:
- `adapter-registry.ts`: Registry for registering and retrieving initialized adapters by provider type.
- `types.ts`: Common interfaces for providers, health statuses, and configuration parameters.

```
                    ┌─────────────────────────┐
                    │ AdapterRegistry         │
                    └───────────┬─────────────┘
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ GoHighLevel      │  │ Google Sheets    │  │ Slack Notifier   │
│ Client & Sync    │  │ Client (15m TTL) │  │ Operations Alert │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 2. GoHighLevel (GHL) Integration

### 2.1. API Client Configuration
- **Base URL**: `https://services.leadconnectorhq.com`
- **Authentication**: Bearer token via sub-account Private Integration Key or OAuth 2.0.
- **Environment Variables**:
  ```env
  GHL_API_BASE_URL=https://services.leadconnectorhq.com
  ```

### 2.2. Confirmed Form IDs
- **GHL Onboarding Form**: `wyM27h1ZCiwGoyXE03oC`
- **A2P 10DLC Registration Form**: `SH2jCt6DkV69gF6YHPni`

### 2.3. Confirmed Booking Calendar ID
- **GHL Strategy Session Calendar**: `SRn2ONyB295xnnPR5JwR`
- Embed component: `src/components/integrations/BookingEmbed.tsx`
- Preserves security sandboxing: `allow-scripts allow-same-origin allow-forms allow-popups`.

### 2.4. Inbound Webhooks
- Endpoint: `/api/webhooks/ghl`
- Handled events:
  - `contact.created` / `contact.updated`: Syncs contact as a new lead.
  - `opportunity.status_changed`: Updates lead pipeline status.
  - `form.submitted`: Updates the corresponding onboarding step status to `complete`.

---

## 3. Google Sheets Integration

### 3.1. Overview
Used for fast intake sheet synchronization and territory configuration.

### 3.2. Caching Strategy
- In-memory cache with 15-minute TTL per client to prevent Google API rate limits.
- Supports manual refresh button on client and CSM dashboards to force cache eviction.

### 3.3. Configuration
- Configured per tenant via `IntegrationConfig` or environment variables:
  ```env
  GOOGLE_SERVICE_ACCOUNT_EMAIL=motionz-sync@your-project.iam.gserviceaccount.com
  GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
  ```

---

## 4. Slack Operational Alerts

### 4.1. Overview
Dispatches operational notifications to internal Motionz Slack channels when key milestones occur.

### 4.2. Triggered Events
- Client completes an onboarding setup step.
- New lead submitted into a client portal.
- Security intrusion attempt detected (`SEC-001` through `SEC-004`).

### 4.3. Configuration
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/XXXX
```

---

## 5. Orders & Roof Measurement Abstraction

### 5.1. Orders & Shipments
- Abstraction module: `src/lib/services/orders-service.ts`
- Normalizes carrier tracking numbers for FedEx, UPS, and USPS with dynamic tracking URLs.

### 5.2. Roof Measurement Tool
- Abstraction module: `src/lib/services/roof-service.ts`
- Client calculator: `/roof-measurement`
- Features: Footprint area estimation, pitch factor multipliers (Flat 1.0 to 12/12 1.30), 10% waste calculation, and total roof squares computation.
