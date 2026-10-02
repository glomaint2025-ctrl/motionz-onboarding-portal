'use client';

import React, { useCallback, useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { roleHomeHref } from './nav-config';

export interface AppShellProps {
  children: React.ReactNode;
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
  /** Shown in the header. Leave empty until the real name is known (a placeholder shows while isLoading). */
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
  companyName = '',
  portalTitle = '',
  featureToggles,
  isLoading = false,
  onLogout,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), []);

  const roleLabel = role === 'admin' ? 'Motionz Admin' : role === 'csm' ? 'Customer Success' : 'Client';

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
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Desktop persistent sidebar */}
      <Sidebar
        role={role}
        clientId={clientId}
        featureToggles={featureToggles}
      />

      {/* Main content area */}
      <div className="main-wrapper">
        <Header
          companyName={companyName}
          portalTitle={portalTitle}
          userRole={roleLabel}
          homeHref={roleHomeHref(role, clientId)}
          isLoading={isLoading}
          isMenuOpen={isMobileMenuOpen}
          onMenuToggle={openMobileMenu}
          onLogout={handleLogout}
        />

        <main className="content-body" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* Phone drawer and bottom bar */}
      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
        onOpen={openMobileMenu}
        role={role}
        clientId={clientId}
        featureToggles={featureToggles}
        onLogout={handleLogout}
      />
    </div>
  );
};
