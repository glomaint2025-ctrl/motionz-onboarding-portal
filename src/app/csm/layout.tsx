'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import '@/styles/staff-tables.css';

export default function CSMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      role="csm"
      companyName="Motionz Success"
      portalTitle="CSM Workspace"
    >
      <div className="portal-container">{children}</div>
    </AppShell>
  );
}
