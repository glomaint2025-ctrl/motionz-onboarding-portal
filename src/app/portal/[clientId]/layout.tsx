'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button, PortalPreloader } from '@/components/ui';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/brand/Icon';
import { suspendedPageUrl } from '@/components/portal/suspended';

/** Portal section (URL segment) to the module that switches it on or off. */
const FEATURE_ROUTE_MAP: Record<string, string> = {
  'onboarding': 'onboarding',
  'leads': 'leads',
  'tracking': 'tracking',
  'contract': 'contracts',
  'tools': 'tools',
  'roof-measurement': 'roof_measurement',
  'video-scripts': 'video_scripts',
  'book-call': 'book_call',
  'team': 'team',
};

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();

  const clientId = (params?.clientId as string) || 'demo';
  const [companyName, setCompanyName] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState<string>('');
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // A missing portal or one this person may not open: retrying will not help.
  const [isNoAccess, setIsNoAccess] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Extract the portal sub-section: /portal/[clientId]/[section]
  const pathSegments = pathname ? pathname.split('/').filter(Boolean) : [];
  const currentSection = pathSegments[2];
  const requiredFeatureKey = currentSection ? FEATURE_ROUTE_MAP[currentSection] : undefined;

  useEffect(() => {
    let isMounted = true;
    async function loadPortal() {
      setIsLoading(true);
      setLoadError('');
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data?.suspended) {
          window.location.href = suspendedPageUrl(data);
          return;
        }
        if (res.status === 401) {
          window.location.href = '/auth/login';
          return;
        }
        if (!isMounted) return;
        if (!res.ok) {
          // Without this we do not know which sections are switched on, so nothing is shown.
          setIsNoAccess(res.status === 403 || res.status === 404);
          setLoadError(
            res.status === 403
              ? 'You do not have access to this portal.'
              : res.status === 404
                ? 'We could not find this portal.'
                : 'Your portal could not be loaded.'
          );
          return;
        }
        setCompanyName(data.tenant?.name || '');
        setTenantId(data.tenant?.id || '');
        setViewerRole(data.viewer?.role || null);
        setViewerName(typeof data.viewer?.full_name === 'string' ? data.viewer.full_name : '');
        setFeatureToggles(data.featureToggles || {});
      } catch {
        if (isMounted) setLoadError('We could not reach the server. Check your connection and try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadPortal();
    return () => {
      isMounted = false;
    };
  }, [clientId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Check if current route is disabled by feature toggle
  const isAccessDenied =
    !isLoading &&
    !loadError &&
    Boolean(requiredFeatureKey) &&
    featureToggles[requiredFeatureKey as string] === false;

  useEffect(() => {
    if (isAccessDenied) {
      router.replace(`/portal/${clientId}`);
    }
  }, [isAccessDenied, clientId, router]);

  // 1. Show preloader screen until auth, tenant profile, and side menu features are loaded
  if (isLoading) {
    return <PortalPreloader />;
  }

  // 2. The portal settings did not load: say so and offer a retry, instead of showing every section.
  if (loadError) {
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-6)',
          textAlign: 'center',
          backgroundColor: 'var(--color-bg-page, var(--color-bg-surface))',
          color: 'var(--color-text-primary)',
        }}
      >
        <span style={{ color: 'var(--color-status-danger-text)' }}>
          <Icon name="alert" size={32} />
        </span>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>{isNoAccess ? 'This portal is not available to you' : 'Something went wrong'}</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', maxWidth: '44ch' }}>{loadError}</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
          {isNoAccess ? (
            <Link href="/" className={buttonClasses({ variant: 'primary' })} style={{ textDecoration: 'none' }}>
              Go to my home page
            </Link>
          ) : (
            <>
              <Button variant="primary" onClick={retry}>
                Try again
              </Button>
              <Link href="/auth/login" className={buttonClasses({ variant: 'outline' })} style={{ textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const isStaffViewer = viewerRole === 'admin' || viewerRole === 'csm';
  // The header shows the signed-in person (staff stay themselves while viewing a client).
  const shellViewer = viewerRole ? { name: viewerName, role: viewerRole } : null;
  const staffBackHref =
    viewerRole === 'admin'
      ? `/admin/clients/${tenantId || clientId}`
      : `/csm/clients/${tenantId || clientId}/setup`;

  const staffBar = isStaffViewer ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        padding: '6px 12px',
        marginBottom: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-primary-muted)',
        border: '1px solid var(--color-primary-border)',
        color: 'var(--color-primary-text)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
      }}
    >
      <span>Viewing as staff{companyName ? ` · ${companyName}` : ''}</span>
      <Link
        href={staffBackHref}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'inherit', textDecoration: 'underline' }}
      >
        <Icon name="arrow-left" size={14} />
        {viewerRole === 'admin' ? 'Back to Admin' : 'Back to CSM'}
      </Link>
    </div>
  ) : null;

  // 3. This section is switched off for the viewer: send them to Home.
  if (isAccessDenied) {
    return (
      <AppShell
        role="client"
        clientId={clientId}
        companyName={companyName || 'Client Workspace'}
        portalTitle="Client Portal"
        featureToggles={featureToggles}
        viewer={shellViewer}
      >
        <div className="portal-container">
          {staffBar}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '360px',
              gap: '16px',
              padding: '40px 20px',
            }}
          >
            <p
              role="status"
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
                margin: 0,
              }}
            >
              This page isn&apos;t available on your account. Taking you back to Home...
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  // 4. Render the shell; each page handles its own loading state
  return (
    <AppShell
      role="client"
      clientId={clientId}
      companyName={companyName || 'Client Workspace'}
      portalTitle="Client Portal"
      featureToggles={featureToggles}
    >
      <div className="portal-container">
        {staffBar}
        {children}
      </div>
    </AppShell>
  );
}
