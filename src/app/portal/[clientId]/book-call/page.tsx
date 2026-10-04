'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BookingWidget } from '@/components/portal/BookingWidget';
import { Card, Skeleton } from '@/components/ui';
import { PORTAL_LINKS } from '@/lib/portal-links';

export default function BookCallPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [isLoading, setIsLoading] = useState(true);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>();
  const [prefillName, setPrefillName] = useState<string | undefined>();
  const [csmName, setCsmName] = useState<string | null>(null);
  // The assigned CSM's calendar from the portal data API; the default calendar until (or unless) it loads.
  const [calendarId, setCalendarId] = useState<string>(PORTAL_LINKS.csmBookingCalendarId);

  useEffect(() => {
    let isMounted = true;
    async function loadViewer() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        // CSM calls booked in GoHighLevel are matched to this client by email, so prefill the signed-in
        // user's email (falling back to the account's primary email) and their real name when known.
        const viewerEmail: string | undefined = data.viewer?.email || data.tenant?.primary_email || undefined;
        const member = Array.isArray(data.teamMembers) && viewerEmail
          ? data.teamMembers.find((m: any) => m.email?.toLowerCase() === viewerEmail.toLowerCase())
          : null;
        const isPrimary = viewerEmail && data.tenant?.primary_email?.toLowerCase() === viewerEmail.toLowerCase();
        const name: string | undefined =
          member?.full_name || (isPrimary ? data.tenant?.primary_contact_name : undefined) || undefined;

        setPrefillEmail(viewerEmail);
        setPrefillName(name);
        setCsmName(data.csm?.name || null);
        if (typeof data.bookingCalendarId === 'string' && data.bookingCalendarId) setCalendarId(data.bookingCalendarId);
      } catch {
        // The calendar still works without prefill; the client can type their details.
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadViewer();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Book a Call</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {csmName
            ? `Pick a time to talk with ${csmName}, your Motionz CSM.`
            : 'Pick a time to talk with your Motionz CSM.'}
        </p>
      </div>

      {isLoading ? (
        <Card>
          <Skeleton width="100%" height="680px" borderRadius="var(--radius-md)" />
        </Card>
      ) : (
        <BookingWidget
          calendarId={calendarId}
          prefillEmail={prefillEmail}
          prefillName={prefillName}
        />
      )}
    </div>
  );
}
