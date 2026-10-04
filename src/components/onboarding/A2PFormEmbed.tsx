'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button, Modal } from '@/components/ui';
import { PORTAL_LINKS, ghlFormUrl } from '@/lib/portal-links';

export interface A2PFormEmbedProps {
  formId?: string;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  /** Pre-fills the form's email so the submission is matched to this client's portal. */
  prefillEmail?: string;
}

const TITLE = 'Texting registration form';

export const A2PFormEmbed: React.FC<A2PFormEmbedProps> = ({
  formId = PORTAL_LINKS.a2pFormId,
  isModal = false,
  isOpen = false,
  onClose = () => {},
  prefillEmail,
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const formUrl = ghlFormUrl(formId, prefillEmail);

  const renderContent = () => (
    <div>
      <div
        style={{
          padding: 'var(--space-3)',
          backgroundColor: 'var(--color-status-progress-bg)',
          color: 'var(--color-status-progress-text)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-status-progress-border)',
          fontSize: 'var(--font-size-xs)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <strong>Before you start:</strong> US phone carriers check these details before they let a business text
        its leads. Enter your EIN and your legal business name exactly as they appear on your tax records.
      </div>

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
          title={TITLE}
        />
      </div>
    </div>
  );

  if (isModal) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={TITLE} dismissOnOverlay={false}>
        {renderContent()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Card>
      <CardHeader
        title={TITLE}
        subtitle="Needed before we can text your leads"
        action={
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              Open in new tab
            </Button>
          </a>
        }
      />
      {renderContent()}
    </Card>
  );
};
