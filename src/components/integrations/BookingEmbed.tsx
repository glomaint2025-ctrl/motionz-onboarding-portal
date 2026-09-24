'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button } from '@/components/ui';

export interface BookingEmbedProps {
  calendarId?: string;
  title?: string;
  subtitle?: string;
}

export const BookingEmbed: React.FC<BookingEmbedProps> = ({
  calendarId = 'SRn2ONyB295xnnPR5JwR',
  title = 'Schedule CSM Strategy Session',
  subtitle = 'Direct GoHighLevel Appointment Scheduling Widget',
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

      <div style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        Select a convenient time from our live calendar below to connect with your Motionz Account Manager.
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '650px',
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
              Loading GoHighLevel Calendar...
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Connecting to calendar ID: {calendarId}
            </span>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Open in Dedicated Window
              </Button>
            </a>
          </div>
        )}

        <iframe
          src={bookingUrl}
          style={{
            width: '100%',
            height: '680px',
            border: 'none',
            display: 'block',
          }}
          scrolling="yes"
          id={`msgsndr-booking-${calendarId}`}
          loading="lazy"
          onLoad={() => setIframeLoaded(true)}
          title="GoHighLevel Booking Calendar"
        />
      </div>
    </Card>
  );
};
