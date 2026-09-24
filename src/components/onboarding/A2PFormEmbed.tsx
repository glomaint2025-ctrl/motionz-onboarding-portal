'use client';

import React, { useState } from 'react';
import { Card, CardHeader, Button, Modal } from '@/components/ui';

export interface A2PFormEmbedProps {
  formId?: string;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const A2PFormEmbed: React.FC<A2PFormEmbedProps> = ({
  formId = 'SH2jCt6DkV69gF6YHPni',
  isModal = false,
  isOpen = false,
  onClose = () => {},
}) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const formUrl = `https://api.leadconnectorhq.com/widget/form/${formId}`;

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
        <strong>Carrier 10DLC Compliance Notice:</strong> Cellular networks (AT&T, Verizon, T-Mobile) require accurate Employer Identification Numbers (EIN) and matching legal business names for A2P texting verification.
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
              Loading Carrier A2P Verification Engine...
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Connecting to secure form instance ({formId})
            </span>
            <a href={formUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Open in Dedicated Tab
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
          title="GoHighLevel A2P 10DLC Carrier Verification Form"
        />
      </div>
    </div>
  );

  if (isModal) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Carrier A2P 10DLC Verification Form">
        {renderContent()}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={onClose}>
            Close Form
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Carrier A2P 10DLC Verification Form"
        subtitle="GoHighLevel Form #SH2jCt6DkV69gF6YHPni"
        action={
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              Open Fullscreen Tab
            </Button>
          </a>
        }
      />
      {renderContent()}
    </Card>
  );
};
