'use client';

import React, { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { ghlFormUrl } from '@/lib/portal-links';

export interface GhlFormFrameProps {
  formId: string;
  /** Read by screen readers as the name of the embedded form. */
  title: string;
  /** Pre-fills the form's email so the submission is matched to this client's portal. */
  prefillEmail?: string;
}

/** A GoHighLevel form in an iframe, with a "Loading" cover that offers the new-tab link. */
export const GhlFormFrame: React.FC<GhlFormFrameProps> = ({ formId, title, prefillEmail }) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const formUrl = ghlFormUrl(formId, prefillEmail);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '620px',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
      }}
    >
      {!iframeLoaded && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--color-bg-card)',
            zIndex: 1,
            padding: 'var(--space-6)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-2)' }}>
            Loading the form...
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
            Taking a while? You can open it in a new tab instead.
          </span>
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              Open in new tab
            </Button>
          </a>
        </div>
      )}

      <iframe
        src={formUrl}
        style={{
          width: '100%',
          height: '650px',
          border: 'none',
          display: 'block',
        }}
        scrolling="yes"
        id={`msgsndr-form-${formId}`}
        onLoad={() => setIframeLoaded(true)}
        title={title}
      />
    </div>
  );
};

export interface GhlFormModalProps extends GhlFormFrameProps {
  isOpen: boolean;
  onClose: () => void;
  /** Short explanation shown above the form. */
  intro?: React.ReactNode;
}

/**
 * Pop-up holding a GoHighLevel form. A click outside does not close it, so a half-filled form
 * is not lost by accident; the × button, Esc and "Close" do.
 */
export const GhlFormModal: React.FC<GhlFormModalProps> = ({ formId, title, isOpen, onClose, prefillEmail, intro }) => {
  if (!formId) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} dismissOnOverlay={false}>
      {intro && (
        <div style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          {intro}
        </div>
      )}
      <GhlFormFrame formId={formId} title={title} prefillEmail={prefillEmail} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-4)',
        }}
      >
        <a href={ghlFormUrl(formId, prefillEmail)} target="_blank" rel="noopener noreferrer">
          <Button variant="outline">Open in new tab</Button>
        </a>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};
