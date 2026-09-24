'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export interface HeaderProps {
  companyName?: string;
  portalTitle?: string;
  userRole?: string;
  onMenuToggle?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  companyName = 'ABC Roofing',
  portalTitle = 'Client Portal',
  userRole = 'Client',
  onMenuToggle,
  onLogout,
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        {onMenuToggle && (
          <Button
            variant="secondary"
            size="sm"
            className="mobile-menu-btn"
            onClick={onMenuToggle}
            aria-label="Open Navigation Menu"
          >
            Menu
          </Button>
        )}
        <div className="header-client-badge">
          <span className="header-company-name">{companyName}</span>
          <span className="header-portal-label">{portalTitle}</span>
        </div>
      </div>

      <div className="header-right">
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          {userRole}
        </span>
        {onLogout && (
          <Button variant="outline" size="sm" onClick={onLogout}>
            Sign Out
          </Button>
        )}
      </div>
    </header>
  );
};
