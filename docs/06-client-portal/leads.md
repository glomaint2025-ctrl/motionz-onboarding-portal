# Phase 6: Client Portal — Performance, Leads & Conversations

The Performance module connects directly to the client's GoHighLevel sub-account, displaying live campaign metrics, pipeline progress, activity logs, and an in-portal SMS conversation composer.

---

## 1. Metrics & Performance Architecture

```mermaid
graph TD
    subgraph Campaign Quota
        QUOTA["Monthly Lead Quota Gauge (e.g. 18 / 30 Leads · 60%)"]
    end

    subgraph Top-Line KPI Cards (Drillable)
        M_LEADS["Leads (Total Ingested)"]
        M_REPLIED["Replied (Engaged Leads)"]
        M_BOOKED["Booked Inspections (Confirmed)"]
        M_WON["Jobs Won (Closed Sales)"]
        M_REV["Revenue ($ Generated)"]
    end

    subgraph Pipeline Stage Columns
        P_NEW["New Leads"]
        P_OPEN["Open"]
        P_LOST["Lost"]
        P_WON["Won"]
    end

    subgraph Live Activity Feed & Communication
        ACT_MEET["Meetings Booked (Confirmed, Cancelled, No-Show)"]
        ACT_CALL["Missed Calls & Voicemails"]
        ACT_CONVO["Expanded Conversation Log"]
        COMPOSER["In-Portal SMS Composer + AI Follow-Up Drafting"]
    end

    QUOTA --> Top-Line
    Top-Line --> Pipeline
    Pipeline --> Live Activity
    ACT_CONVO --> COMPOSER
```

---

## 2. Interactive Metric Drill-Down Modal

Clicking on any drillable metric (e.g. `Leads`, `Replied`, `Booked inspections`) opens the **Drill-Down Modal** revealing the underlying records:
- Contact Name, telephone, and email.
- Date and time of booking or inquiry.
- Appointment status tag (`Confirmed`, `Cancelled`, `No-show`, `Rescheduled`).
- Direct link to open the conversation history.

---

## 3. Live Activity Feed & In-Portal Conversation Log

The activity feed syncs with GoHighLevel to display two core streams:
1. **Meetings Booked**: Displays meeting title, date/time, and status badge. Cancelled and no-show meetings are visually muted and excluded from confirmed booking tallies.
2. **Missed Calls & Voicemails**: Highlights inbound calls requiring urgent callback.

### 3.1. Expandable Conversation Log
Clicking any activity item fetches the message transcript lazily from `/api/client-view?view=convo`:
- **Inbound Bubbles (The Lead)**: Slate bubble with message body, contact name, and timestamp.
- **Outbound Bubbles (The Dealer)**: Cyan-accented bubble labeled `"You"`.
- Supports channel metadata tags: `SMS`, `Phone call · 4m`, `Voicemail`, `Email`, `Facebook message`, `Instagram message`, `WhatsApp`.

### 3.2. In-Portal SMS Composer with AI Draft Suggestions
Beneath every active conversation log, an integrated composer allows the dealer to text back without opening GoHighLevel:
1. **AI Follow-Up Suggestions (`✨ Suggest follow-up`)**:
   - Calls `/api/actions?mode=suggest` with the conversation history.
   - Generates three context-aware response drafts based on the homeowner's last message.
   - Clicking a draft inserts it into the text box for editing.
2. **Instant Delivery (`Send text`)**:
   - Submits `/api/actions?mode=execute&action=send_message`.
   - Sends the SMS via the GoHighLevel API through the client's registered A2P business number.
   - Displays real-time confirmation: `"Sent ✓ — it'll appear in the conversation shortly."`
