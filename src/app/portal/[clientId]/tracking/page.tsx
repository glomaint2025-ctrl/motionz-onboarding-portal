'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Skeleton } from '@/components/ui';

const TRACKED_METRICS = ['Leads', 'Replies', 'Appointments booked', 'Jobs won', 'Revenue', 'Your targets and projections'];

function sheetLink(config: Record<string, string> | undefined): string | null {
  if (!config) return null;
  if (config.sheet_url) return config.sheet_url;
  if (config.spreadsheet_id) return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheet_id)}/edit`;
  return null;
}

export default function CampaignTrackingPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/portal/${clientId}/data`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const sheet = (data.integrations || []).find(
          (i: any) => i.integration_type === 'google_sheets' && i.is_active
        );
        setUrl(sheetLink(sheet?.config_data));
      })
      .catch(() => {})
      .finally(() => isMounted && setLoading(false));
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Tracking</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Your Google Sheet is where you log calls and outcomes for each lead and track your results.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Your tracking sheet"
          action={
            loading ? undefined : (
              <StatusBadge status={url ? 'Ready' : 'Being set up'} variant={url ? 'done' : 'pending'} />
            )
          }
        />

        {loading ? (
          <Skeleton width="200px" height="38px" />
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="primary">Open my tracking sheet</Button>
          </a>
        ) : (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Your sheet is being created. The button will appear here as soon as it is ready.
          </p>
        )}

        <div style={{ marginTop: 'var(--space-6)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 'var(--space-2)' }}>
            What the sheet tracks
          </span>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
            {TRACKED_METRICS.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
