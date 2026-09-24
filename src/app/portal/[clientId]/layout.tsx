'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';
  const [companyName, setCompanyName] = useState<string>(
    clientId === 'demo' ? 'ABC Roofing' : `Client ${clientId}`
  );

  useEffect(() => {
    let isMounted = true;
    async function loadBranding() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (data.tenant?.name && isMounted) {
            setCompanyName(data.tenant.name);
          }
        }
      } catch (err) {
        // Fallback remains active
      }
    }
    loadBranding();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  return (
    <AppShell
      role="client"
      clientId={clientId}
      companyName={companyName}
      portalTitle="Client Portal"
    >
      <div className="portal-container">{children}</div>
    </AppShell>
  );
}
