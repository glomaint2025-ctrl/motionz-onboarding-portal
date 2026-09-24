# Phase 4: Admin Executive Dashboard and Analytics

The Admin Dashboard provides real-time telemetry into platform velocity, integration health, client status, and onboarding progress across the entire Motionz client portfolio.

## 1. Required Analytics and Metric Specifications

The dashboard tracks the following confirmed metrics:

| Metric Title | Target Value / Format | Computation Logic and Data Source | Fallback if Unconnected |
| :--- | :--- | :--- | :--- |
| Total Clients | Integer | COUNT(*) from tenants WHERE deleted_at IS NULL | N/A (Internal database) |
| Active Clients | Integer | COUNT(*) from tenants WHERE status = 'active' | N/A (Internal database) |
| Cancelled Clients | Integer | COUNT(*) from tenants WHERE status = 'cancelled' | N/A (Internal database) |
| Monthly Churn Rate | Percentage | (Cancelled in last 30d / Total active at start of month) * 100 | Display "Data unavailable" if insufficient history |
| GHL Not Connected | Integer count | COUNT(*) where ghl_location_id IS NULL | N/A (Internal database) |
| Clients Needing GHL Setup | List with direct links | Clients active with unconfigured GoHighLevel integration | Empty list if all connected |
| Website Review Submissions | Integer count | COUNT(*) from website_review_requests WHERE status = 'pending' | N/A |
| Average Revenue / Client | Currency | Calculated from verified external CRM/billing integration | Display "Not connected / Configure data source" |
| Onboarding / Setup Progress | Percentage | Average ratio of completed setup steps across all tenants | N/A (Calculated from setup items) |
| Clients Stuck at a Step | Table list | Clients with no progress updates for > 14 days | Empty list if none stuck |
| Login Activity | Timeline chart | Unique user login events from audit_logs over trailing 30 days | N/A |
| Security Alerts | Count / Banner | Unacknowledged security events (failed logins, unauthorized attempts) | "No active security alerts" |

## 2. Integrity Rule

If an integration (such as billing or GoHighLevel) is disconnected or lacks reliable data:
- Never fabricate numbers or use simulated placeholder revenue.
- Explicitly render "Not connected", "Data unavailable", or "Configure data source".
- Allow Admin to drill directly into filtered client lists from each card.
