# Phase 7: Booking and Calendar Integration

The Booking module provides frictionless calendar scheduling for client onboarding calls, strategic reviews, and CSM check-ins.

## 1. Confirmed Calendar Embed

- Source URL: `https://api.leadconnectorhq.com/widget/booking/SRn2ONyB295xnnPR5JwR`
- Implementation: Responsive iframe embedded directly within the portal on the "Book a Call" page.
- User Experience: Zero unnecessary redirects. Clients book calls directly inside their authenticated portal shell.

## 2. Technical and Security Considerations

- Lazy Loading: The booking iframe is lazy-loaded when the user navigates to the Book a Call page to minimize initial bundle size and background network calls.
- Sandboxing: Embedded with safe sandbox permissions (`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`).
- Responsive Sizing: Container maintains minimum height (650px) with responsive scroll handling for mobile screens.
