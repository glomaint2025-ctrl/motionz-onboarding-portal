'use client';

import React from 'react';
import { Card, StatusBadge, Button } from '@/components/ui';
import { ClientSetupStep } from '@/lib/db/schema';

export interface SetupCardProps {
  step: ClientSetupStep;
  stepNumber: number;
  onActionClick?: (stepKey: string) => void;
  /** False when the Results Tracking section is switched off for this viewer. */
  showTrackingLink?: boolean;
}

export const SetupCard: React.FC<SetupCardProps> = ({
  step,
  stepNumber,
  onActionClick,
  showTrackingLink = true,
}) => {
  const isClientAction = step.owner === 'client_action';
  const isDone = step.status === 'done';
  const isInProgress = step.status === 'in_progress';
  const showTracking = step.step_key === 'google_sheet' && showTrackingLink;
  const showA2PForm = step.step_key === 'ghl_a2p';

  return (
    <Card style={{ marginBottom: 'var(--space-4)' }}>
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>
              Step {stepNumber}: {step.name}
            </h2>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: isClientAction ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                color: isClientAction ? 'var(--color-on-primary)' : 'var(--color-text-secondary)',
                border: isClientAction ? 'none' : '1px solid var(--color-border-subtle)',
              }}
            >
              {isClientAction ? 'Your action' : 'We handle this'}
            </span>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>
            {isClientAction
              ? 'We need something from you for this step'
              : 'The Motionz team takes care of this step'}
          </span>
        </div>

        <StatusBadge
          status={isDone ? 'Done' : isInProgress ? 'In Progress' : 'Not Started'}
          variant={isDone ? 'done' : isInProgress ? 'progress' : 'pending'}
        />
      </div>

      {/* Content Grid */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          padding: 'var(--space-4)',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-subtle)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
            What it is
          </span>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
            {step.what_it_is}
          </p>
        </div>

        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
            Right now
          </span>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
            {step.right_now}
          </p>
        </div>

        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
            Unlocks
          </span>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-status-done-text)', margin: 0, fontWeight: 'var(--font-weight-medium)' }}>
            {step.unlocks}
          </p>
        </div>
      </div>

      {/* "We Need From You" Callout if present */}
      {step.we_need_from_you && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-progress-bg)',
            color: 'var(--color-status-progress-text)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-status-progress-border)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <strong>We need from you:</strong> {step.we_need_from_you}
        </div>
      )}

      {/* Action Footer */}
      {(showTracking || showA2PForm) && (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        {showTracking && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            Open Results Tracking
          </Button>
        )}

        {showA2PForm && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            Open texting form
          </Button>
        )}
      </div>
      )}
    </Card>
  );
};
