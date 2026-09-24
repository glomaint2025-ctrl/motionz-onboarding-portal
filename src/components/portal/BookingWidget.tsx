'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button } from '@/components/ui';

export interface BookingWidgetProps {
  calendarId?: string;
  title?: string;
  subtitle?: string;
}

export const BookingWidget: React.FC<BookingWidgetProps> = ({
  calendarId = 'SRn2ONyB295xnnPR5JwR',
  title = 'Schedule Onboarding & Strategy Call',
  subtitle = 'Connect 1-on-1 with your dedicated Motionz Customer Success Manager',
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const bookingUrl = `https://api.leadconnectorhq.com/widget/booking/${calendarId}`;

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              Open Fullscreen Tab
            </Button>
          </a>
        }
      />

      <div style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
        Select an available 30-minute timeslot below to review campaign progress, marketing deliverables, or technical integrations.
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
            <div style={{ fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-2)' }}>
              Loading GoHighLevel Scheduling Engine...
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Connecting to secure calendar instance ({calendarId})
            </span>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Open in Separate Window
              </Button>
            </a>
          </div>
        )}

        <iframe
          src={bookingUrl}
          style={{
            width: '100%',
            height: '700px',
            border: 'none',
            display: 'block',
          }}
          scrolling="yes"
          id={`msgsndr-calendar-${calendarId}`}
          onLoad={() => setIframeLoaded(true)}
          title="GoHighLevel Appointment Scheduling"
        />
      </div>
    </Card>
  );
};
