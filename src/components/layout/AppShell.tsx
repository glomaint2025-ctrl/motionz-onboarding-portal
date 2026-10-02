'use client';

import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export interface AppShellProps {
  children: React.ReactNode;
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
  companyName?: string;
  portalTitle?: string;
  featureToggles?: Record<string, boolean>;
  isLoading?: boolean;
  onLogout?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  role = 'client',
  clientId = 'demo',
  companyName = 'ABC Roofing',
  portalTitle = 'Client Portal',
  featureToggles,
  isLoading = false,
  onLogout,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const roleLabel = role === 'admin' ? 'Motionz Admin' : role === 'csm' ? 'Motionz CSM' : 'Client';

  const handleLogout = onLogout || (async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors
    } finally {
      window.location.href = '/auth/login';
    }
  });

  return (
    <div className="app-shell">
      {/* Desktop Persistent Sidebar */}
      <Sidebar
        role={role}
        clientId={clientId}
        featureToggles={featureToggles}
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        <Header
          companyName={companyName}
          portalTitle={portalTitle}
          userRole={roleLabel}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
        />

        <main className="content-body">
          {children}
        </main>
      </div>

      {/* Mobile Off-Canvas Drawer & Bottom Quick Bar */}
      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpen={() => setIsMobileMenuOpen(true)}
        role={role}
        clientId={clientId}
        featureToggles={featureToggles}
      />
    </div>
  );
};
