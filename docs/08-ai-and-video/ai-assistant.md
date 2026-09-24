# Phase 8: AI Scope Boundary and Out of Scope Documentation

This document records the definitive scope boundary regarding artificial intelligence capabilities within the Motionz Onboarding Portal.

## 1. Explicit Scope Ruling

As established by the Motionz master project requirements:

1. Conversational AI Assistant: OUT OF SCOPE
   - No chat interface or LLM-driven CRM assistant.
   - No automated tool calling or natural language execution of invoices, notes, or SMS.

2. Voice AI and Call Practice: OUT OF SCOPE
   - No WebRTC bidirectional audio streaming.
   - No simulated homeowner roleplay.
   - No voice synthesis or live audio coaching.

3. Sales Coach: OUT OF SCOPE
   - No multi-mode roleplay, deal breakdown, or automated sales call grading.

4. AI Video and AI Script Generation: OUT OF SCOPE
   - Video scripts are strictly template-based using variable replacement ({{client_name}}, {{company_name}}).
   - "AI Video" is a workflow production preference only, not an active video rendering engine.

## 2. Rationale

The primary mission of the Motionz Onboarding Portal is to provide a reliable, multi-tenant portal for client onboarding, setup tracking, GoHighLevel lead/appointment visibility, Google Sheets campaign tracking, signed contracts, tools, and booking. Introducing complex AI microservices introduces unnecessary operational fragility, cost, and security attack surfaces that contradict the core business objective.

## 3. Future Architectural Extension Points

If conversational or generative AI features are approved for a future phase, they must be implemented behind isolated service adapters with strict tenant-scoped authorization:
- External API calls must run server-side only.
- Tenant context must be injected strictly on the backend.
- Prompts and RAG contexts must never mix data between client tenants.
