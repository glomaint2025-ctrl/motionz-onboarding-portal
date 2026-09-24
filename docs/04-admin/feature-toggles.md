# Phase 4: Feature Toggles & Modular Capabilities

The portal architecture supports granular feature toggling, allowing Admins to enable, disable, or gate specific modules on a per-client or package basis.

---

## 1. Feature Flag Dictionary

Every tenant record stores a `feature_flags` JSONB column with the following typed flags:

| Flag Key | Module Name | Status | Default State | Description |
| :--- | :--- | :---: | :---: | :--- |
| `module_roof_measure` | Roof Measure | Confirmed | `true` | Enables roof measurement estimation and pitch multiplier calculator |
| `module_video_scripts`| Video Scripts | Confirmed | `true` | Enables video preference selection & template script generator |
| `module_orders` | Orders & Shipping | Confirmed | `true` | Enables merchandise order tracking |
| `module_website_help` | Website Help | Proposed | `false` | Website change request widget |
| `module_inbox` | Business Inbox | Proposed | `false` | Dedicated inbox (`info@dealerdomain.com`) |
| `module_whop_payments`| Whop Payments | Unconfirmed | `false` | Payment account KYC setup & payout panel (Pending confirmation) |
| `module_sales_coach` | Sales Coach | Out of Scope | `false` | AI objection roleplay & transcript grading (Excluded from scope) |
| `module_call_practice`| Call Practice | Out of Scope | `false` | Voice telephone call simulator (Excluded from scope) |
| `module_ai_assistant` | AI Assistant | Out of Scope | `false` | Natural-language conversational CRM execution (Excluded from scope) |

---

## 2. Dynamic UI Conditional Rendering

In the client portal shell, feature flags dictate tab visibility, mobile navigation items, and API access:

```typescript
// Component Guard Pattern
export function ClientNavigation({ tenant }: { tenant: Tenant }) {
  const flags = tenant.feature_flags;

  return (
    <nav className="side-nav">
      <NavItem href="/overview" label="Overview" icon="home" />
      <NavItem href="/onboarding" label="Onboarding" icon="checklist" />
      <NavItem href="/performance" label="Performance" icon="chart" />
      
      {flags.module_inbox && (
        <NavItem href="/inbox" label="Inbox" icon="mail" />
      )}
      
      {flags.module_roof_measure && (
        <NavItem href="/measure" label="Roof Measure" icon="ruler" />
      )}

      {flags.module_call_practice && (
        <NavItem href="/practice" label="Call Practice" icon="phone" />
      )}

      {flags.module_sales_coach && (
        <NavItem href="/coach" label="Sales Coach" icon="target" />
      )}
    </nav>
  );
}
```

If a client attempts to access a disabled module directly by URL (e.g. `/portal/apex/inbox`), the page component redirects to `/portal/apex/overview` with an alert: `"This module is not active for your current package."`
