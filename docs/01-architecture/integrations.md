# Phase 1: External Integrations Architecture

The Motionz Onboarding Portal acts as a unified aggregation layer, orchestrating data pipelines across multiple enterprise third-party services.

---

## 1. Integration Landscape & Topography

```mermaid
graph LR
    subgraph Portal Core (Next.js)
        API_BUS["Internal Integration Bus"]
    end

    subgraph Operational APIs
        GHL["GoHighLevel API"]
        SHEETS["Google Sheets API"]
        SLACK["Slack Webhook Engine"]
        SKOOL["Skool Community SSO / Embed"]
    end

    subgraph Specialized Utilities
        ESRI["Esri World Imagery (Map Tiles)"]
        AI["AI Engine (OpenAI / Anthropic / ElevenLabs)"]
        AYR["Ayrshare (Social Media Auto-Publishing)"]
    end

    subgraph Undecided Modules (Feature Toggled)
        PAY["Payment / Membership Provider (Undecided)"]
        ROOF_AUTO["Roof Auto-Detect Provider (Undecided)"]
    end

    API_BUS <-->|REST & Webhooks| GHL
    API_BUS <-->|Service Account API| SHEETS
    API_BUS -->|Alert Dispatch| SLACK
    API_BUS -->|Deep Links / SSO| SKOOL
    API_BUS -->|HTTP Proxy / Client Canvas| ESRI
    API_BUS <-->|Streaming & Tool Calling| AI
    API_BUS <-->|Social API| AYR
    API_BUS -.->|Stubbed Interface| PAY
    API_BUS -.->|Stubbed Interface| ROOF_AUTO
```

---

## 2. Integration Service Catalog

### 2.1. GoHighLevel (GHL) — Primary CRM Backbone
- **Integration Mode**: REST API v2 (Bearer Location Token or OAuth 2.0).
- **Sub-Account Mapping**: Each tenant record stores its unique `ghl_location_id` and encrypted `ghl_api_key`.
- **Data Synchronized**:
  - Contacts, Leads & Pipeline stages (`New leads`, `Open`, `Lost`, `Won`).
  - Conversation logs (Inbound/Outbound SMS, call records, voicemails, emails, DMs).
  - Outbound SMS delivery directly from the in-portal conversation composer.
  - Appointment bookings and status synchronization (`Confirmed`, `Cancelled`, `No-show`, `Rescheduled`).

### 2.2. Google Sheets API — Campaign Tracking
- **Integration Mode**: Google Cloud Service Account with scoped read permissions.
- **Functionality**: Reads live metrics from dealer-specific campaign tracking spreadsheets, populating quota progress bars and attribution breakdowns.

### 2.3. Slack Integration — Operational Alerting
- **Integration Mode**: Incoming Webhooks with structured Block Kit payloads.
- **Triggers**:
  - Client completes an onboarding milestone (`LLC filing requested`, `Certification passed`).
  - Client submits a website modification request with attachments.
  - Security events (failed 2FA, unauthorized cross-tenant attempt, rapid login bursts).

### 2.4. Skool Integration — Training & Community
- **Integration Mode**: Secure deep-linking and embedded resources linking clients to community discussions, mastermind modules, and orientation collateral.

### 2.5. Esri World Imagery — Satellite Mapping
- **Integration Mode**: REST Map Tile Server (`server.arcgisonline.com/.../tile/{z}/{y}/{x}`).
- **Fallback**: Clarity archive (`clarity.maptiles.arcgis.com/...`) for regions with sparse primary tile coverage.
- **Client Rendering**: HTML5 `<canvas>` rendering tiles with Web Mercator coordinates, allowing pan, zoom, and interactive polygon vertex tracing.

### 2.6. AI Services (OpenAI / Anthropic / ElevenLabs)
- **Course Assistant**: RAG pipeline over course transcripts and SOP PDFs.
- **Sales Coach**: Multi-mode interactive conversational LLM with roleplay personas.
- **Call Practice**: WebRTC / WebSocket bidirectional audio streaming simulating real-time homeowner telephone interactions.
- **AI Photo Studio**: Inpainting and image generation using canvas mask coordinates.

---

## 3. Undecided Providers & Stub Architecture

In strict compliance with project requirements, undecided integrations are isolated behind **Plugin Interfaces**:
- **Payment & Membership**: While the prototype stubs Whop (`/api/whop-connect`), the backend interface `PaymentGatewayService` remains abstract until Motionz confirms the provider.
- **Roof Measurement Footprint Provider**: The `RoofAutoDetectService` interface provides a mock fallback while manual polygon tracing on the satellite canvas functions natively.
