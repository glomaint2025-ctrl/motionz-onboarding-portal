# Phase 7: GoHighLevel (GHL) Integration Specification

GoHighLevel is the primary customer relationship management (CRM) backbone for the Motionz Onboarding Portal.

---

## 1. Architecture & Multi-Location Topography

Each client organization in the portal maps 1-to-1 with a dedicated **GoHighLevel Sub-Account (Location)**:

```mermaid
flowchart LR
    subgraph Portal Core
        TENANT["Client Tenant Record"]
        SEC_STORE["Encrypted Credential Store (AES-256-GCM)"]
        TENANT --> SEC_STORE
    end

    subgraph GoHighLevel Agency
        GHL_AGENCY["Motionz Agency Snapshot"]
        LOC_A["Sub-Account A (Location ID: loc_apex)"]
        LOC_B["Sub-Account B (Location ID: loc_metro)"]
        GHL_AGENCY --> LOC_A
        GHL_AGENCY --> LOC_B
    end

    SEC_STORE <-->|REST API v2 (Bearer Token)| LOC_A
    LOC_A -->|Inbound Webhooks| WEBHOOK_HANDLER["/api/webhooks/ghl"]
```

---

## 2. Synchronized Data Entities & API Endpoints

### 2.1. Inbound & Outbound Pipeline Data
- **Endpoint**: `GET https://services.leadconnectorhq.com/opportunities/search?locationId={locationId}`
- **Mapped Metrics**:
  - `leads`: Total count of opportunities created.
  - `pipeline`: Mapped across opportunity stages: `New Leads`, `Open`, `Lost`, `Won`.
  - `revenue`: Sum of `monetaryValue` for opportunities in the `Won` stage.

### 2.2. Appointments & Meeting Bookings
- **Endpoint**: `GET https://services.leadconnectorhq.com/calendars/events?locationId={locationId}`
- **Status Parsing**:
  - `confirmed` / `booked`: Increments `booked` inspection counter.
  - `cancelled`, `no_show`: Tracked separately as sub-metrics; excluded from the top-line booked inspections KPI.

### 2.3. Two-Way Conversations & Messaging
- **Search Conversations**: `GET /conversations/search?locationId={locationId}`
- **Fetch Messages**: `GET /conversations/{conversationId}/messages`
- **Send Outbound SMS**:
  - **Endpoint**: `POST https://services.leadconnectorhq.com/conversations/messages`
  - **Payload**:
    ```json
    {
      "type": "SMS",
      "contactId": "ct_948201",
      "message": "Hi John, confirming our roof inspection for tomorrow at 2 PM."
    }
    ```

---

## 3. Webhook Handling & Idempotency

- **Inbound Webhook URL**: `/api/webhooks/ghl`
- **Events Handled**:
  - `ContactCreate` / `ContactUpdate`: Refreshes lead counters.
  - `InboundMessage`: Updates the active conversation feed and triggers a portal notification.
  - `OpportunityStageUpdate`: Updates the pipeline view.
- **Idempotency**: All webhook payloads verify the `messageId` or `eventId` against a PostgreSQL `webhook_events` log to prevent duplicate processing.
