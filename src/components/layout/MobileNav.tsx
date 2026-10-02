'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/brand/Icon';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';
import { getBottomBarItems, getNavGroups, isNavItemActive } from './nav-config';

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  role?: 'client' | 'admin' | 'csm';
  clientId?: string;
  featureToggles?: Record<string, boolean>;
  isLoading?: boolean;
  /** Optional sign-out handler shown at the bottom of the drawer. */
  onLogout?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  onOpen,
  role = 'client',
  clientId = 'demo',
  featureToggles,
  onLogout,
}) => {
  const pathname = usePathname();
  const groups = getNavGroups(role, clientId, featureToggles);
  const bottomItems = getBottomBarItems(role, clientId, featureToggles);
  const tag = role === 'admin' ? 'Admin' : role === 'csm' ? 'CSM' : undefined;

  // Escape closes the drawer; lock page scroll while it is open.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const bottomBarCoversPath = bottomItems.some((item) => isNavItemActive(item.href, pathname, role, clientId));

  return (
    <>
      {/* Off-canvas navigation drawer */}
      {isOpen && (
        <div className="mobile-drawer-overlay" onClick={onClose}>
          <div
            className="mobile-drawer"
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <MotionzWordmark size={28} tag={tag} />
              <button type="button" className="header-icon-btn" onClick={onClose} aria-label="Close menu" autoFocus>
                <Icon name="close" size={20} />
              </button>
            </div>
            <nav className="drawer-nav" aria-label="Main navigation">
              {groups.map((group) => (
                <div className="nav-group" key={group.label}>
                  {groups.length > 1 && <div className="nav-group-label">{group.label}</div>}
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(item.href, pathname, role, clientId);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`nav-link ${isActive ? 'nav-link-active' : ''}`.trim()}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className="nav-link-icon">
                          <Icon name={item.icon} size={20} />
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            {onLogout && (
              <div className="drawer-footer">
                <button
                  type="button"
                  className="user-menu-item user-menu-item-danger"
                  style={{ minHeight: 'var(--tap-target)' }}
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                >
                  <Icon name="logout" size={18} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phone bottom tab bar */}
      <nav className="mobile-bottom-bar" aria-label="Quick navigation">
        {bottomItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname, role, clientId);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bottom-tab-item ${isActive ? 'bottom-tab-item-active' : ''}`.trim()}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="bottom-tab-icon">
                <Icon name={item.icon} size={20} />
              </span>
              <span>{item.shortLabel || item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`bottom-tab-item ${!bottomBarCoversPath || isOpen ? 'bottom-tab-item-active' : ''}`.trim()}
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="mobile-nav-drawer"
        >
          <span className="bottom-tab-icon">
            <Icon name="menu" size={20} />
          </span>
          <span>More</span>
        </button>
      </nav>
    </>
  );
};
