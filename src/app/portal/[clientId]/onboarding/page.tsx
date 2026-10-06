'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Skeleton } from '@/components/ui';
import { SetupCard } from '@/components/onboarding/SetupCard';
import { GHLOnboardingFormEmbed } from '@/components/onboarding/GHLOnboardingFormEmbed';
import { A2PFormEmbed } from '@/components/onboarding/A2PFormEmbed';
import { calculateSetupProgress } from '@/lib/onboarding/progress';
import { ClientSetupStep } from '@/lib/db/schema';

/** Steps that are not finished yet. */
const isOpen = (step: ClientSetupStep) => step.status !== 'done';

export default function SetupProgressPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = (params?.clientId as string) || 'demo';

  const [steps, setSteps] = useState<ClientSetupStep[]>([]);
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [isGHLFormOpen, setIsGHLFormOpen] = useState(false);
  const [isA2PFormOpen, setIsA2PFormOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(undefined);
  // Form ids set by an admin. Empty until loaded; the pop-ups then use the built-in forms.
  const [formIds, setFormIds] = useState<{ onboarding_form_id?: string; a2p_form_id?: string }>({});

  useEffect(() => {
    let isMounted = true;
    async function loadSteps() {
      setIsLoading(true);
      setLoadError('');
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        const data = await res.json().catch(() => ({}));
        if (!isMounted) return;
        if (!res.ok) {
          setLoadError(data.error || 'Your setup steps could not be loaded.');
          return;
        }
        setSteps(data.setupSteps || []);
        setFeatureToggles(data.featureToggles || {});
        setFormIds(data.forms || {});
        const isClient = data.viewer?.role === 'client' || data.viewer?.role === 'client_member';
        setPrefillEmail(isClient ? data.viewer.email : data.tenant?.primary_email);
      } catch {
        if (isMounted) setLoadError('We could not reach the server. Check your connection and try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadSteps();
    return () => {
      isMounted = false;
    };
  }, [clientId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const progress = calculateSetupProgress(steps);
  const openCount = steps.filter(isOpen).length;
  const doneCount = steps.filter((s) => s.status === 'done').length;

  const filteredSteps = steps.filter((step) => {
    if (filter === 'open') return isOpen(step);
    if (filter === 'completed') return step.status === 'done';
    return true;
  });

  const trackingEnabled = featureToggles.tracking !== false;
  const bookCallEnabled = featureToggles.book_call !== false;
  // The texting form opens from its own step. If this client has no such step, offer it with the other form.
  const hasA2PStep = steps.some((s) => s.step_key === 'ghl_a2p');

  const handleStepAction = (stepKey: string) => {
    if (stepKey === 'google_sheet') {
      router.push(`/portal/${clientId}/tracking`);
    } else if (stepKey === 'ghl_a2p') {
      setIsA2PFormOpen(true);
    }
  };

  const header = (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h1 style={{ marginBottom: 'var(--space-1)' }}>Setup Progress</h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        The steps to get your campaigns live. We handle them and tell you if we need anything from you.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <Skeleton width="220px" height="20px" style={{ marginBottom: 'var(--space-3)' }} />
          <Skeleton width="100%" height="10px" borderRadius="var(--radius-full)" style={{ marginBottom: 'var(--space-4)' }} />
          <Skeleton width="60%" height="16px" />
        </Card>
        {[1, 2, 3].map((i) => (
          <Card key={i} style={{ marginBottom: 'var(--space-4)' }}>
            <Skeleton width="240px" height="22px" style={{ marginBottom: 'var(--space-3)' }} />
            <Skeleton width="100%" height="72px" borderRadius="var(--radius-md)" />
          </Card>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        {header}
        <Card>
          <p role="alert" style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-status-danger-text)' }}>
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {header}

      {/* Progress overview */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Overall progress"
          subtitle={
            progress.totalSteps > 0
              ? `${progress.completedSteps} of ${progress.totalSteps} steps done`
              : 'Your Motionz team will add your setup steps here.'
          }
          action={
            progress.totalSteps > 0 ? (
              <StatusBadge status={`${progress.percentage}% done`} variant={progress.isComplete ? 'done' : 'progress'} />
            ) : undefined
          }
        />

        {progress.totalSteps > 0 && (
          <>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percentage}
              aria-label="Setup progress"
              style={{
                width: '100%',
                height: '10px',
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  width: `${progress.percentage}%`,
                  height: '100%',
                  backgroundColor: 'var(--color-primary)',
                  transition: 'width var(--transition-normal)',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <div>
                {progress.isComplete ? (
                  <strong style={{ color: 'var(--color-text-primary)' }}>All steps are done</strong>
                ) : (
                  <>
                    Current step:{' '}
                    <strong style={{ color: 'var(--color-text-primary)' }}>{progress.currentStep?.name}</strong>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button variant={filter === 'all' ? 'primary' : 'outline'} size="sm" onClick={() => setFilter('all')}>
                  All steps ({steps.length})
                </Button>
                <Button
                  variant={filter === 'open' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('open')}
                >
                  Still to do ({openCount})
                </Button>
                <Button
                  variant={filter === 'completed' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('completed')}
                >
                  Done ({doneCount})
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* The forms we need from the client. The texting form opens from its own step when there is one. */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Tell us about your business"
          subtitle="We use your answers to build your ads, website and follow-up messages."
          action={
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setIsGHLFormOpen(true)}>
                Open onboarding form
              </Button>
              {!hasA2PStep && (
                <Button variant="secondary" size="sm" onClick={() => setIsA2PFormOpen(true)}>
                  Open texting form
                </Button>
              )}
            </div>
          }
        />
      </Card>

      {/* Step cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {filteredSteps.length === 0 ? (
          <Card>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
              {steps.length === 0
                ? 'No setup steps yet. Your Motionz team will add them here.'
                : filter === 'open'
                  ? 'All steps are done.'
                  : 'No steps are done yet.'}
            </p>
          </Card>
        ) : (
          filteredSteps.map((step) => (
            <SetupCard
              key={step.step_key}
              step={step}
              stepNumber={steps.indexOf(step) + 1}
              onActionClick={handleStepAction}
              showTrackingLink={trackingEnabled}
            />
          ))
        )}
      </div>

      {/* One help callout */}
      {bookCallEnabled && (
        <Card>
          <CardHeader
            title="Need help? Book a call"
            subtitle="Your CSM can walk you through any step."
            action={
              <Button variant="secondary" size="sm" onClick={() => router.push(`/portal/${clientId}/book-call`)}>
                Book a call
              </Button>
            }
          />
        </Card>
      )}

      <GHLOnboardingFormEmbed
        formId={formIds.onboarding_form_id}
        isModal={true}
        isOpen={isGHLFormOpen}
        onClose={() => setIsGHLFormOpen(false)}
        prefillEmail={prefillEmail}
      />

      <A2PFormEmbed
        formId={formIds.a2p_form_id}
        isModal={true}
        isOpen={isA2PFormOpen}
        onClose={() => setIsA2PFormOpen(false)}
        prefillEmail={prefillEmail}
      />
    </div>
  );
}
