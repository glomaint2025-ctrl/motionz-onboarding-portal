'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface SidebarProps {
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
  featureToggles?: Record<string, boolean>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  role = 'client',
  clientId = 'demo',
  featureToggles,
}) => {
  const pathname = usePathname();

  const adminNavItems: NavItem[] = [
    {
      label: 'Admin Dashboard',
      href: '/admin',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      label: 'Client Management',
      href: '/admin/clients',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: 'Master Templates',
      href: '/admin/templates',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      label: 'Settings & Integrations',
      href: '/admin/integrations',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      label: 'Security & Audit Logs',
      href: '/admin/audit-logs',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      label: 'Security Alerts',
      href: '/admin/security-alerts',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
  ];

  const clientNavItems: NavItem[] = [
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

  const csmNavItems: NavItem[] = [
    { label: 'CSM Workspace', href: '/csm' },
    { label: 'Assigned Clients', href: '/csm/clients' },
    { label: 'Setup Review Queue', href: '/csm/setup-queue' },
  ];

  const navItems = role === 'admin' ? adminNavItems : role === 'csm' ? csmNavItems : filteredClientNavItems;

  return (
    <aside className="desktop-sidebar">
      {/* Brand Logo & Internal Pill */}
      <div className="sidebar-header" style={{ padding: '0 20px', display: 'flex', alignItems: 'center' }}>
        <Link href="/" className="brand-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <span
            style={{
              fontSize: '22px',
              fontWeight: '800',
              color: '#38bdf8',
              letterSpacing: '-0.03em',
            }}
          >
            Motionz
          </span>
          <span
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: '500',
            }}
          >
            Internal
          </span>
        </Link>
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav" style={{ padding: '16px 12px', gap: '6px' }}>
        {navItems.map((item) => {
          const isRootPage = item.href === `/portal/${clientId}` || item.href === '/admin' || item.href === '/csm';
          const isActive = isRootPage
            ? pathname === item.href
            : (pathname === item.href || pathname.startsWith(item.href + '/'));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? 'nav-link-active' : ''}`.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13.5px',
                textDecoration: 'none',
              }}
            >
              {item.icon && <span style={{ display: 'flex', alignItems: 'center', color: isActive ? '#38bdf8' : '#94a3b8' }}>{item.icon}</span>}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* System Status Footer Widget */}
      <div className="sidebar-footer" style={{ padding: '16px 14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>
            Motionz Internal v1.0
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 8px #10b981',
                display: 'inline-block',
              }}
            />
            System Online
          </div>
        </div>
      </div>
    </aside>
  );
};
