'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { QuickLinksBar } from '@/components/onboarding/QuickLinksBar';
import { SetupCard } from '@/components/onboarding/SetupCard';
import { GHLOnboardingFormEmbed } from '@/components/onboarding/GHLOnboardingFormEmbed';
import { A2PFormEmbed } from '@/components/onboarding/A2PFormEmbed';
import { calculateSetupProgress } from '@/lib/onboarding/progress';
import { ClientSetupStep } from '@/lib/db/schema';

export default function OnboardingRoadmapPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = (params?.clientId as string) || 'demo';

  const [steps, setSteps] = useState<ClientSetupStep[]>([]);
  const [filter, setFilter] = useState<'all' | 'action_required' | 'completed'>('all');
  const [isGHLFormOpen, setIsGHLFormOpen] = useState(false);
  const [isA2PFormOpen, setIsA2PFormOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    async function loadSteps() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setSteps(data.setupSteps || []);
            const isClient = data.viewer?.role === 'client' || data.viewer?.role === 'client_member';
            setPrefillEmail(isClient ? data.viewer.email : data.tenant?.primary_email);
          }
        }
      } catch {
        // Leave the list empty; the page shows its empty state
      }
    }
    loadSteps();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const activeSteps: ClientSetupStep[] = steps;

  const progress = calculateSetupProgress(activeSteps);

  const filteredSteps = activeSteps.filter((step) => {
    if (filter === 'action_required') {
      return step.owner === 'client_action' || step.status === 'in_progress';
    }
    if (filter === 'completed') {
      return step.status === 'done';
    }
    return true;
  });

  const handleStepAction = (stepKey: string) => {
    if (stepKey === 'google_sheet') {
      router.push(`/portal/${clientId}/tracking`);
    } else if (stepKey === 'ghl_a2p') {
      setIsA2PFormOpen(true);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Onboarding & Setup Roadmap</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Track the five foundational milestones required to launch and scale your commercial operations.
        </p>
      </div>

      {/* Top Quick Links Bar */}
      <QuickLinksBar
        clientId={clientId}
        onOpenGHLForm={() => setIsGHLFormOpen(true)}
        onOpenA2PForm={() => setIsA2PFormOpen(true)}
      />

      {/* Setup Progress Overview Card */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Overall Setup Completion"
          subtitle={`${progress.completedSteps} of ${progress.totalSteps} Milestones Completed`}
          action={<StatusBadge status={`${progress.percentage}% Complete`} variant="progress" />}
        />

        <div
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
            Current active focus:{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {progress.currentStep?.name || 'All Steps Complete'}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant={filter === 'all' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All Steps ({activeSteps.length})
            </Button>
            <Button
              variant={filter === 'action_required' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter('action_required')}
            >
              Action Required ({activeSteps.filter((s) => s.owner === 'client_action' || s.status === 'in_progress').length})
            </Button>
            <Button
              variant={filter === 'completed' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter('completed')}
            >
              Completed ({activeSteps.filter((s) => s.status === 'done').length})
            </Button>
          </div>
        </div>
      </Card>

      {/* Confirmed 5 Setup Milestone Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {filteredSteps.map((step, idx) => (
          <SetupCard
            key={step.step_key}
            step={step}
            stepNumber={step.sort_order || idx + 1}
            onActionClick={handleStepAction}
          />
        ))}
      </div>

      {/* Support Callout */}
      <Card>
        <CardHeader
          title="Need Assistance with Your Setup?"
          subtitle="Motionz Customer Success Managers monitor your onboarding progress daily"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/portal/${clientId}/book-call`)}
            >
              Schedule Review Call
            </Button>
          }
        />
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          If you have questions regarding domain DNS propagation, Facebook business permissions, or carrier A2P 10DLC registration, contact your assigned CSM directly or book a strategy session.
        </p>
      </Card>

      {/* Embedded GoHighLevel Intake Form Modal */}
      <GHLOnboardingFormEmbed
        isModal={true}
        isOpen={isGHLFormOpen}
        onClose={() => setIsGHLFormOpen(false)}
        prefillEmail={prefillEmail}
      />

      {/* Embedded A2P Carrier Verification Form Modal */}
      <A2PFormEmbed
        isModal={true}
        isOpen={isA2PFormOpen}
        onClose={() => setIsA2PFormOpen(false)}
      />
    </div>
  );
}
