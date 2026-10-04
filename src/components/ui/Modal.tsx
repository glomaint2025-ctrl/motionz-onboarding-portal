'use client';

import React, { useEffect, useId } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional max width of the dialog (e.g. 720 or '48rem'). */
  maxWidth?: number | string;
  /** Set false for dialogs holding a form or one-time information, so a stray click outside does not discard it. */
  dismissOnOverlay?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth,
  dismissOnOverlay = true,
}) => {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="ui-modal-overlay" onClick={dismissOnOverlay ? onClose : undefined}>
      <div
        className="ui-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={maxWidth !== undefined ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <h3 className="ui-modal-title" id={titleId}>{title}</h3>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Close dialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
