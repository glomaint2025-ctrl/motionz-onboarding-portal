'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, StatusBadge, Skeleton } from '@/components/ui';
import { buttonClasses } from '@/components/ui/Button';

interface SheetLinks {
  /** Normal Google Sheets URL, opened in a new tab. */
  openUrl: string;
  /** Minimal-chrome URL for the embedded frame; null when the sheet id is unknown. */
  embedUrl: string | null;
}

const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

/** Builds the open/embed links from the non-secret Google Sheets integration fields. */
function sheetLinks(config: Record<string, string> | undefined): SheetLinks | null {
  if (!config) return null;

  let sheetUrl: URL | null = null;
  if (typeof config.sheet_url === 'string' && config.sheet_url.trim()) {
    try {
      const parsed = new URL(config.sheet_url.trim());
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') sheetUrl = parsed;
    } catch {
      sheetUrl = null;
    }
  }

  const isGoogleSheet = sheetUrl?.hostname === 'docs.google.com';
  const idFromUrl = isGoogleSheet ? sheetUrl!.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] : undefined;
  const rawId = typeof config.spreadsheet_id === 'string' ? config.spreadsheet_id.trim() : '';
  const id = [idFromUrl, rawId].find((candidate) => candidate && SHEET_ID_PATTERN.test(candidate)) || null;

  if (!id) {
    // A link we cannot embed (not a recognisable Google Sheet) can still be opened.
    return sheetUrl ? { openUrl: sheetUrl.toString(), embedUrl: null } : null;
  }

  // Keep the tab the team linked to, if the saved URL points at one.
  const gid = isGoogleSheet ? (sheetUrl!.hash + sheetUrl!.search).match(/gid=(\d+)/)?.[1] : undefined;
  const base = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  return {
    openUrl: `${base}${gid ? `#gid=${gid}` : ''}`,
    embedUrl: `${base}?rm=minimal${gid ? `#gid=${gid}` : ''}`,
  };
}

function OpenInNewTab({ href, primary }: { href: string; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses({ variant: primary ? 'primary' : 'secondary', size: 'sm' })}
      style={{ textDecoration: 'none' }}
    >
      Open in new tab
    </a>
  );
}

function SheetFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      allow="clipboard-read; clipboard-write"
      style={{
        display: 'block',
        width: '100%',
        height: '75vh',
        minHeight: '520px',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-surface)',
      }}
    />
  );
}

export default function CampaignTrackingPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [links, setLinks] = useState<SheetLinks | null>(null);
  // The client's own copy of the Money Leak Calculator (never a sheet shared between clients).
  const [calculatorLinks, setCalculatorLinks] = useState<SheetLinks | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/portal/${clientId}/data`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Your tracking sheet could not be loaded. Please refresh the page.');
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const sheet = (data.integrations || []).find(
          (i: any) => i.integration_type === 'google_sheets' && i.is_active
        );
        setLinks(sheetLinks(sheet?.config_data));
        const calculator = sheet?.config_data;
        setCalculatorLinks(
          calculator?.calculator_url || calculator?.calculator_id
            ? sheetLinks({ sheet_url: calculator.calculator_url, spreadsheet_id: calculator.calculator_id })
            : null
        );
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setLoadError(
          err instanceof TypeError
            ? 'Could not reach the server. Please check your connection and refresh the page.'
            : err?.message || 'Your tracking sheet could not be loaded. Please refresh the page.'
        );
      })
      .finally(() => isMounted && setLoading(false));
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Results Tracking</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Your Google Sheet is where you log calls and outcomes for each lead and track your results.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Your tracking sheet"
          subtitle="Leads, replies, appointments, jobs won, revenue and your targets."
          action={
            loading || loadError ? undefined : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <StatusBadge status={links ? 'Ready' : 'Being set up'} variant={links ? 'done' : 'pending'} />
                {links && <OpenInNewTab href={links.openUrl} primary={!links.embedUrl} />}
              </div>
            )
          }
        />

        {loading ? (
          <Skeleton width="100%" height="520px" borderRadius="var(--radius-md)" />
        ) : loadError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--color-status-danger-text)' }}>
            {loadError}
          </p>
        ) : !links ? (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Your sheet is being created. It will appear here as soon as it is ready.
          </p>
        ) : links.embedUrl ? (
          <>
            <SheetFrame src={links.embedUrl} title="Your tracking sheet (Google Sheets)" />
            <p style={{ margin: 'var(--space-3) 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Not loading? Sign in to Google with the email this sheet was shared with, or open it in a new tab.
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            This sheet cannot be shown inside the portal. Use &ldquo;Open in new tab&rdquo; to view it.
          </p>
        )}
      </Card>

      {!loading && !loadError && (
        <Card style={{ marginTop: 'var(--space-6)' }}>
          <CardHeader
            title="Money Leak Calculator"
            subtitle="See where money slips away between leads, booked appointments, shows and closed jobs."
            action={calculatorLinks ? <OpenInNewTab href={calculatorLinks.openUrl} primary={!calculatorLinks.embedUrl} /> : undefined}
          />
          {!calculatorLinks ? (
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              Your calculator is being set up. It will appear here as soon as it is ready.
            </p>
          ) : calculatorLinks.embedUrl ? (
            <SheetFrame src={calculatorLinks.embedUrl} title="Your Money Leak Calculator (Google Sheets)" />
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              This calculator cannot be shown inside the portal. Use &ldquo;Open in new tab&rdquo; to view it.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
