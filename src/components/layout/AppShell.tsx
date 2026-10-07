'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { roleHomeHref } from './nav-config';
import { VIEWER_ROLE_LABELS, myProfileHref } from '@/lib/account/role-labels';

/** The signed-in person, shown in the top-right of the header. */
export interface ShellViewer {
  name?: string;
  /** Their real role: admin, csm, client or client_member. */
  role?: string | null;
  /** How their role is named ("CSM Manager", "Tech"…), when the server said so. */
  roleLabel?: string | null;
  /** Their profile picture (a short-lived link), when they have one. */
  avatarUrl?: string | null;
}

/** Fired by My profile after a change the header shows (name, picture). */
const PROFILE_UPDATED_EVENT = 'motionz:profile-updated';

export interface AppShellProps {
  children: React.ReactNode;
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
  /** Shown in the header. Leave empty until the real name is known (a placeholder shows while isLoading). */
  companyName?: string;
  portalTitle?: string;
  featureToggles?: Record<string, boolean>;
  /**
   * The signed-in person. Pass it when the page already knows who they are (null when nobody is
   * signed in); leave it out and the shell looks it up itself.
   */
  viewer?: ShellViewer | null;
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
  viewer,
  isLoading = false,
  onLogout,
}) => {
  const [fetchedViewer, setFetchedViewer] = useState<ShellViewer | null>(null);
  const [isViewerLoading, setIsViewerLoading] = useState(viewer === undefined);
  const needsLookup = viewer === undefined;
  // Bumped when the person edits their profile, so the header shows the new name or picture.
  const [viewerVersion, setViewerVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setViewerVersion((n) => n + 1);
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!needsLookup) return;
    let isMounted = true;
    fetch('/api/auth/me')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        // Signed out elsewhere, or the account was removed: go to sign-in instead of showing a half-working page.
        if (res.status === 401) {
          window.location.assign('/auth/login');
          return;
        }
        if (isMounted && res.ok) {
          setFetchedViewer({ name: data.fullName || '', role: data.role || null, roleLabel: data.roleLabel || null, avatarUrl: data.avatarUrl || null });
        }
      })
      .catch(() => {
        // The header falls back to the role label alone.
      })
      .finally(() => {
        if (isMounted) setIsViewerLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [needsLookup, viewerVersion]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), []);

  const person = needsLookup ? fetchedViewer : viewer;
  const personRole = person?.role || (role === 'client' ? '' : role);
  // Staff looking at a client portal are still shown as themselves, never as the client.
  const roleLabel = person?.roleLabel || VIEWER_ROLE_LABELS[personRole] || (role === 'client' ? 'Client' : '');
  const isClientPerson = personRole === 'client' || personRole === 'client_member' || (!personRole && role === 'client');
  const userName = (person?.name || '').trim() || (isClientPerson ? companyName : '');

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
          userName={userName}
          isUserLoading={needsLookup && isViewerLoading}
          portalTitle={portalTitle}
          userRole={roleLabel}
          avatarUrl={person?.avatarUrl || null}
          profileHref={myProfileHref(person?.role, clientId) || undefined}
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
