'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
  featureToggles?: Record<string, boolean>;
  isLoading?: boolean;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  onOpen,
  role = 'client',
  clientId = 'demo',
  featureToggles,
  isLoading = false,
}) => {
  const pathname = usePathname();

  const clientNavItems = [
    { label: 'Overview', href: `/portal/${clientId}` },
    { label: 'Setup Progress', href: `/portal/${clientId}/onboarding` },
    { label: 'Leads & Pipeline', href: `/portal/${clientId}/leads` },
    { label: 'Campaign Tracking', href: `/portal/${clientId}/tracking` },
    { label: 'Signed Contract', href: `/portal/${clientId}/contract` },
    { label: 'Orders & Shipping', href: `/portal/${clientId}/orders` },
    { label: 'Tools & Resources', href: `/portal/${clientId}/tools` },
    { label: 'Roof Measurement', href: `/portal/${clientId}/roof-measurement` },
    { label: 'Video Scripts', href: `/portal/${clientId}/video-scripts` },
    { label: 'Book CSM Call', href: `/portal/${clientId}/book-call` },
    { label: 'Company Profile', href: `/portal/${clientId}/profile` },
    { label: 'Team Members', href: `/portal/${clientId}/team` },
  ];

  const featureKeyMap: Record<string, string> = {
    [`/portal/${clientId}/onboarding`]: 'onboarding',
    [`/portal/${clientId}/leads`]: 'leads',
    [`/portal/${clientId}/tracking`]: 'tracking',
    [`/portal/${clientId}/contract`]: 'contracts',
    [`/portal/${clientId}/orders`]: 'orders',
    [`/portal/${clientId}/tools`]: 'tools',
    [`/portal/${clientId}/roof-measurement`]: 'roof_measurement',
    [`/portal/${clientId}/video-scripts`]: 'video_scripts',
    [`/portal/${clientId}/book-call`]: 'book_call',
    [`/portal/${clientId}/team`]: 'team',
  };

  const filteredClientNavItems = clientNavItems.filter((item) => {
    const key = featureKeyMap[item.href];
    if (!key) return true;
    if (featureToggles && featureToggles[key] === false) {
      return false;
    }
    return true;
  });

  const adminNavItems = [
    { label: 'Admin Dashboard', href: '/admin' },
    { label: 'Client Management', href: '/admin/clients' },
    { label: 'Master Templates', href: '/admin/templates' },
    { label: 'Settings & Integrations', href: '/admin/integrations' },
    { label: 'Security & Audit Logs', href: '/admin/audit-logs' },
    { label: 'Security Alerts', href: '/admin/security-alerts' },
  ];

  const csmNavItems = [
    { label: 'CSM Workspace', href: '/csm' },
    { label: 'Assigned Clients', href: '/csm/clients' },
    { label: 'Setup Review Queue', href: '/csm/setup-queue' },
  ];

  const navItems = role === 'admin' ? adminNavItems : role === 'csm' ? csmNavItems : filteredClientNavItems;

  return (
    <>
      {/* Off-Canvas Navigation Drawer */}
      {isOpen && (
        <div className="mobile-drawer-overlay" onClick={onClose}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="brand-logo">Motionz</span>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
            <nav className="drawer-nav">
              {navItems.map((item) => {
                const isRootPage = item.href === `/portal/${clientId}` || item.href === '/admin' || item.href === '/csm';
                const isActive = isRootPage
                  ? pathname === item.href
                  : (pathname === item.href || pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`nav-link ${isActive ? 'nav-link-active' : ''}`.trim()}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
        {role === 'client' ? (
          <>
            <Link
              href={`/portal/${clientId}`}
              className={`bottom-tab-item ${pathname === `/portal/${clientId}` ? 'bottom-tab-item-active' : ''}`}
            >
              Overview
            </Link>
            {(!featureToggles || featureToggles.onboarding !== false) && (
              <Link
                href={`/portal/${clientId}/onboarding`}
                className={`bottom-tab-item ${pathname === `/portal/${clientId}/onboarding` ? 'bottom-tab-item-active' : ''}`}
              >
                Setup
              </Link>
            )}
            {(!featureToggles || featureToggles.leads !== false) && (
              <Link
                href={`/portal/${clientId}/leads`}
                className={`bottom-tab-item ${pathname === `/portal/${clientId}/leads` ? 'bottom-tab-item-active' : ''}`}
              >
                Leads
              </Link>
            )}
            {(!featureToggles || featureToggles.tracking !== false) && (
              <Link
                href={`/portal/${clientId}/tracking`}
                className={`bottom-tab-item ${pathname === `/portal/${clientId}/tracking` ? 'bottom-tab-item-active' : ''}`}
              >
                Tracking
              </Link>
            )}
            <button
              type="button"
              className="bottom-tab-item"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={onOpen}
            >
              More
            </button>
          </>
        ) : (
          <>
            <Link
              href={role === 'admin' ? '/admin' : '/csm'}
              className="bottom-tab-item bottom-tab-item-active"
            >
              Dashboard
            </Link>
            <Link
              href={role === 'admin' ? '/admin/clients' : '/csm/clients'}
              className="bottom-tab-item"
            >
              Clients
            </Link>
            <button
              type="button"
              className="bottom-tab-item"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={onOpen}
            >
              Menu
            </button>
          </>
        )}
      </nav>
    </>
  );
};
