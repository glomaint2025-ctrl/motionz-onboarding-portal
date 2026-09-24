# Phase 6: Client Portal — Overview & Dashboard Shell

The Overview tab is the mission control home screen for client business owners and their team members. It synthesizes setup velocity, active blockers, live business performance, and critical operational tools into an intuitive, distraction-free view.

---

## 1. UI Components & Layout Anatomy

```mermaid
graph TD
    subgraph Header Banner (Radial Slate Gradient)
        PHASE["Phase Chip (e.g. Phase 2 · Get trained & stocked)"]
        GREET["Welcome Greeting & Personalization"]
        RING["Animated SVG Progress Ring (Percentage Complete)"]
    end

    subgraph Dynamic Action Engine
        NEXT_ACTION["'Your Next Step' Hero Card (Focused single action)"]
    end

    subgraph 4-Tile Quick Metric Snapshot
        M1["Steps Done (e.g. 5/8)"]
        M2["Package Tier (e.g. Pro Growth)"]
        M3["Live Leads (GHL Synced)"]
        M4["Jobs Won (GHL Synced)"]
    end

    subgraph Operational Widgets
        WEB_PANEL["Your Website & 'Request a Change' Widget"]
        ORDER_PANEL["Product Order & Shipping Tracker"]
        PUSH_CARD["PWA Home Screen & Web Push Prompt"]
        FEED["Recent Updates & Milestone Timeline"]
    end

    Header --> NEXT_ACTION
    NEXT_ACTION --> 4-Tile
    4-Tile --> WEB_PANEL
    WEB_PANEL --> ORDER_PANEL
    ORDER_PANEL --> PUSH_CARD
    PUSH_CARD --> FEED
```

---

## 2. Core Functional Specifications

### 2.1. Dynamic Progress Ring & Next Action
- **SVG Circular Gauge**: Displays `C.progress%` complete with smooth gradient strokes (`#5DB7D8` to `#1A617A`).
- **Focus Card Algorithm**: Rather than overwhelming clients with dozens of checklist items, the overview features a single leading hero card:
  - If a step is `blocked` or requires client action (e.g. `Pay state filing fee`, `Watch course`), the card renders: `"One thing we need from you"`.
  - If a step is underway by the Motionz team (e.g. `Setting up A2P registration`), the card renders: `"What we're doing for you right now"` with a reassuring tag: `"Nothing needed from you on this step — we've got it."`
  - If all steps are completed and GHL is active, the card celebrates: `"You're live 🎉 Every system is running."`

### 2.2. Website Panel & "Request a Change" Widget
- Displays the client's live website domain with an external link button (`Visit site →`).
- Provides an inline feedback form allowing the client to request color changes, text updates, or new photos:
  - Text input (max 600 characters).
  - File attachment button (supporting logos, job photos, PDFs).
  - "Send" button dispatches a ticket to `website_requests`, sends a notification to Motionz web developers, and delivers a Slack webhook.

### 2.3. PWA Installation & Web Push Prompt
- On iOS Safari, detects non-standalone mode and displays step-by-step guidance:
  `"📲 Put this portal on your phone: In Safari tap Share → Add to Home Screen. It becomes an app with your icon and unlocks instant launch notifications."`
- Supports Web Push registration via Service Worker for milestone notifications.

### 2.4. Recent Updates Feed
- Merges manual announcements posted by the CSM (`portal_notifications`) with automatic, status-derived timeline events (e.g. `LLC filing completed · yesterday`, `GoHighLevel CRM live · 3 days ago`).

---

## 3. Responsive Mobile Shell Specifications

- **Desktop (>=901px)**:
  - 84px compact icon rail auto-expands on mouse-over to a 264px full sidebar with label text.
  - Main view area is centered with `max-width: 1080px`.
- **Mobile (<=900px)**:
  - Fixed top bar (54px) with client logo and hamburger trigger.
  - Off-canvas slide-in navigation drawer with backdrop blur scrim.
  - Fixed bottom tab bar with 4 core quick-access tabs (`Home`, `Numbers`, `Inbox`, `Training`) plus a `"More"` button that triggers the full drawer.
  - Native safe-area inset padding (`env(safe-area-inset-bottom)`) for edge-to-edge iOS displays.
