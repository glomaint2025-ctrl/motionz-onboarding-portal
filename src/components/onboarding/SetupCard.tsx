'use client';

import React from 'react';
import { Card, StatusBadge, Button } from '@/components/ui';
import { ClientSetupStep } from '@/lib/db/schema';

export interface SetupCardProps {
  step: ClientSetupStep;
  stepNumber: number;
  onActionClick?: (stepKey: string) => void;
}

export const SetupCard: React.FC<SetupCardProps> = ({
  step,
  stepNumber,
  onActionClick,
}) => {
  const isClientAction = step.owner === 'client_action';
  const isDone = step.status === 'done';
  const isInProgress = step.status === 'in_progress';

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
                color: isClientAction ? '#ffffff' : 'var(--color-text-secondary)',
                border: isClientAction ? 'none' : '1px solid var(--color-border-subtle)',
              }}
            >
              {isClientAction ? 'YOUR ACTION' : 'WE HANDLE'}
            </span>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>
            {isClientAction
              ? 'Requires your direct input or access confirmation'
              : 'Handled entirely by the Motionz technical and onboarding team'}
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
            What It Is
          </span>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
            {step.what_it_is}
          </p>
        </div>

        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
            Right Now
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
          <strong>We Need From You:</strong> {step.we_need_from_you}
        </div>
      )}

      {/* Action Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        {step.step_key === 'google_sheet' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            View Tracking Tab
          </Button>
        )}

        {step.step_key === 'ghl_a2p' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            Complete A2P Form
          </Button>
        )}

        {step.step_key === 'facebook' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            Confirm Facebook Access
          </Button>
        )}

        {step.step_key === 'domain_web' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            Verify Domain Status
          </Button>
        )}

        {step.step_key === 'phone_system' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onActionClick && onActionClick(step.step_key)}
          >
            Check Phone Provisioning
          </Button>
        )}
      </div>
    </Card>
  );
};
