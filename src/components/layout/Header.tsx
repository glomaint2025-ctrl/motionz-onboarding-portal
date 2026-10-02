'use client';

import React, { useState } from 'react';
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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const isAdmin = userRole.toLowerCase().includes('admin');

  return (
    <header className="app-header">
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, maxWidth: '480px' }}>
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

        {/* Global Search Bar as in reference image */}
        <div
          className="header-search-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '6px 12px',
            width: '100%',
            maxWidth: '380px',
            transition: 'border-color 0.15s ease',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: '#94a3b8', marginRight: '8px', flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search anything..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text-primary, #f8fafc)',
              fontSize: '13px',
              width: '100%',
            }}
          />
          <kbd
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              backgroundColor: 'rgba(255, 255, 255, 0.07)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            Ctrl K
          </kbd>
        </div>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {/* Notification Bell with red badge */}
        <button
          type="button"
          aria-label="Notifications"
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '5px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              boxShadow: '0 0 6px #ef4444',
            }}
          />
        </button>

        {/* User Profile Avatar & Role */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                fontSize: '13px',
                boxShadow: '0 0 10px rgba(37, 99, 235, 0.35)',
              }}
            >
              {isAdmin
                ? 'MA'
                : companyName && companyName !== 'Client Workspace'
                ? companyName.substring(0, 2).toUpperCase()
                : userRole.substring(0, 2).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary, #f8fafc)', lineHeight: 1.2 }}>
                {isAdmin ? 'Motionz Admin' : (companyName || 'Client Workspace')}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.2 }}>
                {isAdmin ? 'Administrator' : userRole}
              </span>
            </div>
          </div>

          {/* User Menu Dropdown */}
          {isUserMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '180px',
                backgroundColor: '#0b1329',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '6px',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.75)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <Link
                href="/admin"
                onClick={() => setIsUserMenuOpen(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#cbd5e1',
                  textDecoration: 'none',
                }}
              >
                Dashboard
              </Link>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    color: '#f87171',
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Sign Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
