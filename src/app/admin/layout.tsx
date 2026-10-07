'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import '@/styles/staff-tables.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      role="admin"
      companyName="Motionz Internal"
      portalTitle="CSM Manager workspace"
    >
      <div className="portal-container">{children}</div>
    </AppShell>
  );
}
