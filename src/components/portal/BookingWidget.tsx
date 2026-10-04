'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button } from '@/components/ui';
import { PORTAL_LINKS } from '@/lib/portal-links';

export interface BookingWidgetProps {
  calendarId?: string;
  /** Optional card heading. The Book a Call page already has its own title, so it is off by default. */
  title?: string;
  /** Prefilled on the GHL booking form: CSM calls are matched to the client by email. */
  prefillEmail?: string;
  prefillName?: string;
}

/** GHL booking widget URL with optional contact prefill (?email=...&name=...). */
export function ghlBookingUrl(calendarId: string, prefill: { email?: string; name?: string } = {}): string {
  const url = new URL(`https://api.leadconnectorhq.com/widget/booking/${encodeURIComponent(calendarId)}`);
  if (prefill.email) url.searchParams.set('email', prefill.email);
  if (prefill.name) url.searchParams.set('name', prefill.name);
  return url.toString();
}

export const BookingWidget: React.FC<BookingWidgetProps> = ({
  calendarId = PORTAL_LINKS.csmBookingCalendarId,
  title,
  prefillEmail,
  prefillName,
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const bookingUrl = ghlBookingUrl(calendarId, { email: prefillEmail, name: prefillName });

  return (
    <Card>
      {title && <CardHeader title={title} />}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ flex: '1 1 260px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Choose an available time below. Please book with{' '}
          {prefillEmail ? <strong>{prefillEmail}</strong> : 'your portal email address'} so the call shows up in your portal.
        </div>
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            Open in New Tab
          </Button>
        </a>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '680px',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
        }}
      >
        {!iframeLoaded && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--color-bg-card)',
              zIndex: 1,
              padding: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-4)' }}>
              Loading the booking calendar...
            </div>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Open in New Tab
              </Button>
            </a>
          </div>
        )}

        <iframe
          src={bookingUrl}
          title="Book a call with your CSM"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          style={{
            width: '100%',
            height: '700px',
            border: 'none',
            display: 'block',
          }}
          id={`msgsndr-calendar-${calendarId}`}
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </Card>
  );
};
