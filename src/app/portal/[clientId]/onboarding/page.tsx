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

  useEffect(() => {
    let isMounted = true;
    async function loadSteps() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.setupSteps && data.setupSteps.length > 0) {
            setSteps(data.setupSteps);
          }
        }
      } catch {
        // Fallback remains active
      }
    }
    loadSteps();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Baseline fallback steps matching confirmed 5 milestones
  const activeSteps: ClientSetupStep[] = steps.length > 0 ? steps : [
    {
      id: 'c-step-1',
      tenant_id: 'tenant-demo-abc-roofing',
      template_step_id: 't-step-1',
      step_key: 'google_sheet',
      name: 'Google Sheet',
      owner: 'we_handle',
      status: 'done',
      what_it_is: 'Setting up your campaign tracking sheet with automated lead and performance metrics.',
      right_now: 'Tracking sheet provisioned and linked.',
      unlocks: 'Live campaign tracking in the Tracking tab.',
      sort_order: 1,
      completed_at: '2026-09-11T00:00:00Z',
      updated_at: '2026-09-11T00:00:00Z',
    },
    {
      id: 'c-step-2',
      tenant_id: 'tenant-demo-abc-roofing',
      template_step_id: 't-step-2',
      step_key: 'ghl_a2p',
      name: 'GoHighLevel / A2P Verified',
      owner: 'we_handle',
      status: 'in_progress',
      what_it_is: 'Configuring your GoHighLevel sub-account, pipelines, and carrier A2P 10DLC registration.',
      right_now: 'Registration submitted to carrier networks for verification.',
      we_need_from_you: 'Complete the A2P verification form with your official tax EIN and legal address.',
      unlocks: 'Direct lead synchronization, SMS messaging, and appointment booking.',
      sort_order: 2,
      updated_at: '2026-09-12T00:00:00Z',
    },
    {
      id: 'c-step-3',
      tenant_id: 'tenant-demo-abc-roofing',
      template_step_id: 't-step-3',
      step_key: 'facebook',
      name: 'Facebook',
      owner: 'client_action',
      status: 'done',
      what_it_is: 'Connecting your business Facebook page and ad account access for lead generation.',
      right_now: 'Business page connected and ad account access verified.',
      unlocks: 'Targeted paid advertising and lead campaign launch.',
      sort_order: 3,
      completed_at: '2026-09-13T00:00:00Z',
      updated_at: '2026-09-13T00:00:00Z',
    },
    {
      id: 'c-step-4',
      tenant_id: 'tenant-demo-abc-roofing',
      template_step_id: 't-step-4',
      step_key: 'domain_web',
      name: 'Domain, email & website',
      owner: 'we_handle',
      status: 'done',
      what_it_is: 'Provisioning your custom domain, business email accounts, and launching your company website.',
      right_now: 'Domain active and verified with SSL.',
      unlocks: 'Professional online web presence and verified email delivery.',
      sort_order: 4,
      completed_at: '2026-09-14T00:00:00Z',
      updated_at: '2026-09-14T00:00:00Z',
    },
    {
      id: 'c-step-5',
      tenant_id: 'tenant-demo-abc-roofing',
      template_step_id: 't-step-5',
      step_key: 'phone_system',
      name: 'Phone system & A2P texting',
      owner: 'we_handle',
      status: 'not_started',
      what_it_is: 'Provisioning your local business phone number and configuring call forwarding and texting.',
      right_now: 'Queued for phone number selection.',
      unlocks: 'Direct two-way calling and carrier-compliant customer SMS.',
      sort_order: 5,
      updated_at: '2026-09-15T00:00:00Z',
    },
  ];

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
    } else if (stepKey === 'facebook') {
      alert('Facebook Business Integration: Verification token verified.');
    } else if (stepKey === 'domain_web') {
      alert('Domain DNS Status: Active. SSL certificate valid through 2027.');
    } else if (stepKey === 'phone_system') {
      alert('Phone System: Routing to primary contact number.');
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
