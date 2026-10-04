'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';
import { getNavGroups, isNavItemActive, roleHomeHref } from './nav-config';

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
  const groups = getNavGroups(role, clientId, featureToggles);
  const tag = role === 'admin' ? 'Admin' : role === 'csm' ? 'CSM' : undefined;

  return (
    <aside className="desktop-sidebar" aria-label="Sidebar">
      <div className="sidebar-header">
        <Link href={roleHomeHref(role, clientId)} aria-label="Motionz home" style={{ textDecoration: 'none' }}>
          <MotionzWordmark size={30} tag={tag} />
        </Link>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            {groups.length > 1 && <div className="nav-group-label">{group.label}</div>}
            {group.items.map((item) => {
              const isActive = isNavItemActive(item.href, pathname, role, clientId);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isActive ? 'nav-link-active' : ''}`.trim()}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="nav-link-icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};
