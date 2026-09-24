'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  label: string;
  href: string;
}

export interface SidebarProps {
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  role = 'client',
  clientId = 'demo',
}) => {
  const pathname = usePathname();

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

  const adminNavItems: NavItem[] = [
    { label: 'Admin Dashboard', href: '/admin' },
    { label: 'Client Management', href: '/admin/clients' },
    { label: 'Master Templates', href: '/admin/templates' },
    { label: 'Integration Settings', href: '/admin/integrations' },
    { label: 'Security & Audit Logs', href: '/admin/audit-logs' },
    { label: 'Security Alerts', href: '/admin/security-alerts' },
  ];

  const csmNavItems: NavItem[] = [
    { label: 'CSM Workspace', href: '/csm' },
    { label: 'Assigned Clients', href: '/csm/clients' },
    { label: 'Setup Review Queue', href: '/csm/setup-queue' },
  ];

  const navItems = role === 'admin' ? adminNavItems : role === 'csm' ? csmNavItems : clientNavItems;

  return (
    <aside className="desktop-sidebar">
      <div className="sidebar-header">
        <Link href="/" className="brand-logo">
          Motionz
        </Link>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {role.toUpperCase()}
        </span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? 'nav-link-active' : ''}`.trim()}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div>Motionz Portal v1.0</div>
        <div style={{ color: 'var(--color-primary)', marginTop: 'var(--space-1)' }}>
          Secure Multi-Tenant
        </div>
      </div>
    </aside>
  );
};
