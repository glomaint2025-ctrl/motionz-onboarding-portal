# Phase 7: Onboarding and Compliance Forms Integration

The portal integrates two primary external GoHighLevel forms for client information collection and carrier telecom verification.

## 1. Confirmed External Forms

### 1.1. GoHighLevel Client Onboarding Form
- URL: `https://api.leadconnectorhq.com/widget/form/wyM27h1ZCiwGoyXE03oC?notrack=true`
- Purpose: Primary client onboarding information collection. Embedded cleanly in the Onboarding / Setup section of the client portal.
- Display in Portal: Rendered in a sandboxed, responsive iframe.
- Scope Rule: Do not invent custom form fields or validation rules. The embedded form serves as the authoritative collection tool.

### 1.2. A2P 10DLC Carrier Verification Form
- URL: `https://api.leadconnectorhq.com/widget/form/SH2jCt6DkV69gF6YHPni?notrack=true`
- Purpose: Carrier compliance data submission for business SMS 10DLC registration.
- Display in Portal: Linked and embedded where applicable for clients completing phone system setup.

## 2. Ingestion and Security Protocols

- Embedded iframes use secure attributes (`sandbox="allow-scripts allow-same-origin allow-forms"`).
- Third-party scripts are not loaded globally; they are scoped strictly to the respective form views.
