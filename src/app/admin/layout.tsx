'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      role="admin"
      companyName="Motionz Internal"
      portalTitle="Admin Command Center"
    >
      <div className="portal-container">{children}</div>
    </AppShell>
  );
}
