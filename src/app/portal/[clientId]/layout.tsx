'use client';

import React, { useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PortalPreloader } from '@/components/ui';

const FEATURE_ROUTE_MAP: Record<string, string> = {
  'onboarding': 'onboarding',
  'leads': 'leads',
  'tracking': 'tracking',
  'performance': 'tracking',
  'contract': 'contracts',
  'tools': 'tools',
  'roof-measurement': 'roof_measurement',
  'measure': 'roof_measurement',
  'video-scripts': 'video_scripts',
  'scripts': 'video_scripts',
  'book-call': 'book_call',
  'booking': 'book_call',
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
  const [companyName, setCompanyName] = useState<string>(
    ''
  );
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Extract the portal sub-section: /portal/[clientId]/[section]
  const pathSegments = pathname ? pathname.split('/').filter(Boolean) : [];
  const currentSection = pathSegments[2];
  const requiredFeatureKey = currentSection ? FEATURE_ROUTE_MAP[currentSection] : undefined;

  useEffect(() => {
    let isMounted = true;
    async function loadBranding() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.suspended) {
            window.location.href = `/auth/suspended?reason=${encodeURIComponent(data.reason || 'Your account access has been suspended.')}`;
            return;
          }
        }
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.tenant?.name) {
              setCompanyName(data.tenant.name);
            }
            if (data.featureToggles) {
              setFeatureToggles(data.featureToggles);
            }
          }
        }
      } catch (err) {
        // Fallback remains active
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadBranding();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Check if current route is disabled by feature toggle
  const isAccessDenied =
    !isLoading &&
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

  // 2. If attempting to access a disabled module, show gentle transition while redirecting to overview
  if (isAccessDenied) {
    return (
      <AppShell
        role="client"
        clientId={clientId}
        companyName={companyName || 'Client Workspace'}
        portalTitle="Client Portal"
        featureToggles={featureToggles}
      >
        <div className="portal-container">
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
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                margin: 0,
              }}
            >
              Module disabled. Redirecting to overview...
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  // 3. Render dashboard with sidebar and header immediately; page content handles its own in-page data loading skeletons
  return (
    <AppShell
      role="client"
      clientId={clientId}
      companyName={companyName || 'Client Workspace'}
      portalTitle="Client Portal"
      featureToggles={featureToggles}
    >
      <div className="portal-container">
        {children}
      </div>
    </AppShell>
  );
}
