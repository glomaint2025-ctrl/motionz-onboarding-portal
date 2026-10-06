'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/brand/Icon';
import { MotionzMark } from '@/components/brand/MotionzLogo';

export interface HeaderProps {
  /** The workspace shown on the left (the client's company, or the staff area). */
  companyName?: string;
  /** The signed-in person shown in the account menu. Falls back to the role label alone. */
  userName?: string;
  /** Shows a placeholder in the account menu while the person's name loads. */
  isUserLoading?: boolean;
  portalTitle?: string;
  userRole?: string;
  onMenuToggle?: () => void;
  onLogout?: () => void;
  /** The person's profile picture (a short-lived link). Initials are shown without it. */
  avatarUrl?: string | null;
  /** Where "My profile" in the user menu goes. Hidden when not set. */
  profileHref?: string;
  /** Where "Home" in the user menu goes. */
  homeHref?: string;
  /** Shows a placeholder instead of the company name while it loads. */
  isLoading?: boolean;
  /** Whether the mobile drawer is open (for aria-expanded on the menu button). */
  isMenuOpen?: boolean;
}

function initialsFrom(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const Header: React.FC<HeaderProps> = ({
  companyName = '',
  userName = '',
  isUserLoading = false,
  portalTitle = '',
  userRole = '',
  onMenuToggle,
  onLogout,
  avatarUrl,
  profileHref,
  homeHref,
  isLoading = false,
  isMenuOpen,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const displayName = companyName.trim();
  const showSkeleton = !displayName && isLoading;
  const personName = userName.trim();
  const avatarText = isUserLoading && !personName ? '' : initialsFrom(personName || userRole || '');

  // A picture that fails to load (e.g. an expired link) falls back to initials.
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState<string | null>(null);
  const pictureUrl = avatarUrl && avatarUrl !== brokenAvatarUrl ? avatarUrl : null;
  const avatarContent = (iconSize: number) =>
    pictureUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={pictureUrl} alt="" onError={() => setBrokenAvatarUrl(pictureUrl)} />
    ) : (
      avatarText || <Icon name="user" size={iconSize} />
    );

  // Close the user menu on outside click or Escape.
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isUserMenuOpen]);

  return (
    <header className="app-header">
      <div className="header-left">
        {onMenuToggle && (
          <button
            type="button"
            className="header-icon-btn mobile-menu-btn"
            onClick={onMenuToggle}
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-drawer"
          >
            <Icon name="menu" size={22} />
          </button>
        )}

        <span className="header-mobile-brand">
          <MotionzMark size={28} />
        </span>
        <span className="header-divider" aria-hidden="true" />

        <div className="header-context">
          {showSkeleton ? (
            <span className="ui-skeleton header-skeleton" aria-label="Loading company name" />
          ) : (
            displayName && <span className="header-company-name">{displayName}</span>
          )}
          {portalTitle && <span className="header-portal-label">{portalTitle}</span>}
        </div>
      </div>

      <div className="header-right">
        <div className="user-menu" ref={menuRef}>
          <button
            ref={triggerRef}
            type="button"
            className="user-menu-trigger"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            aria-label={`Account menu${personName ? ` for ${personName}` : ''}`}
          >
            <span className="user-avatar" aria-hidden="true">
              {avatarContent(16)}
            </span>
            <span className="user-menu-meta">
              {personName ? (
                <span className="user-menu-name">{personName}</span>
              ) : (
                isUserLoading && <span className="ui-skeleton header-skeleton" aria-label="Loading your name" />
              )}
              {userRole && <span className="user-menu-role">{userRole}</span>}
            </span>
            <span className="user-menu-chevron" aria-hidden="true">
              <Icon name="chevron-down" size={16} />
            </span>
          </button>

          {isUserMenuOpen && (
            <div className="user-menu-dropdown" role="menu" aria-label="Account">
              <div className="user-menu-header">
                <span className="user-avatar user-avatar-lg" aria-hidden="true">
                  {avatarContent(18)}
                </span>
                <span style={{ minWidth: 0 }}>
                  {personName && <span className="user-menu-name" style={{ display: 'block' }}>{personName}</span>}
                  {userRole && <span className="user-menu-role">{userRole}</span>}
                </span>
              </div>
              {profileHref && (
                <Link
                  href={profileHref}
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <Icon name="user" size={18} />
                  My profile
                </Link>
              )}
              {homeHref && (
                <Link
                  href={homeHref}
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <Icon name="home" size={18} />
                  Home
                </Link>
              )}
              {onLogout && (
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item user-menu-item-danger"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                >
                  <Icon name="logout" size={18} />
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
