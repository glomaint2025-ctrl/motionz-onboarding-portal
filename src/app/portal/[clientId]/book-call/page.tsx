'use client';

import React from 'react';
import { BookingWidget } from '@/components/portal/BookingWidget';

export default function BookCallPage() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Book a Strategy Call</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Direct scheduling with your Motionz Customer Success Manager and Technical Account Team.
        </p>
      </div>

      <BookingWidget calendarId="SRn2ONyB295xnnPR5JwR" />
    </div>
  );
}
