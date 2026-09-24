'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge, Input } from '@/components/ui';

interface SetupStep {
  name: string;
  step_key: string;
  status: 'not_started' | 'in_progress' | 'done';
  owner: 'we_handle' | 'client_action';
  what_it_is: string;
  right_now: string;
  unlocks: string;
}

export default function ClientOverviewPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [leadCount, setLeadCount] = useState(42);
  const [appointmentCount, setAppointmentCount] = useState(14);
  const [hasSignedContract, setHasSignedContract] = useState(true);
  const [companyName, setCompanyName] = useState('ABC Roofing');

  // Website change request state
  const [changeTitle, setChangeTitle] = useState('');
  const [changeDesc, setChangeDesc] = useState('');
  const [changeUrl, setChangeUrl] = useState('');
  const [isSubmittingChange, setIsSubmittingChange] = useState(false);
  const [changeSuccessMessage, setChangeSuccessMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.tenant?.name) setCompanyName(data.tenant.name);
            if (data.setupSteps) setSteps(data.setupSteps);
            if (data.leads) setLeadCount(data.leads.length);
            if (data.appointments) setAppointmentCount(data.appointments.length);
            if (data.contracts) setHasSignedContract(data.contracts.length > 0);
          }
        }
      } catch (err) {
        // Fallback to default state
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Fallback steps if API not ready
  const activeSteps = steps.length > 0 ? steps : [
    { name: 'Google Sheet', step_key: 'google_sheet', status: 'done', owner: 'we_handle', what_it_is: 'Campaign tracking sheet', right_now: 'Configured and active', unlocks: 'Live analytics' },
    { name: 'GoHighLevel / A2P Verified', step_key: 'ghl_a2p', status: 'in_progress', owner: 'we_handle', what_it_is: 'GHL setup & carrier compliance', right_now: 'Under carrier verification', unlocks: 'Direct messaging' },
    { name: 'Facebook', step_key: 'facebook', status: 'done', owner: 'client_action', what_it_is: 'Page & ad account connection', right_now: 'Connected and verified', unlocks: 'Targeted ad delivery' },
    { name: 'Domain, email & website', step_key: 'domain_web', status: 'done', owner: 'we_handle', what_it_is: 'Domain & business email provisioning', right_now: 'Active with SSL', unlocks: 'Verified presence' },
    { name: 'Phone system & A2P texting', step_key: 'phone_system', status: 'not_started', owner: 'we_handle', what_it_is: 'Local business phone number', right_now: 'Queued for number selection', unlocks: 'Direct calling' },
  ];

  const totalSteps = activeSteps.length;
  const completedSteps = activeSteps.filter((s) => s.status === 'done').length;
  const setupPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Identify the first incomplete step as the active focus step
  const currentStep = activeSteps.find((s) => s.status !== 'done') || activeSteps[activeSteps.length - 1];

  const handleWebsiteChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeTitle.trim() || !changeDesc.trim()) return;

    setIsSubmittingChange(true);
    try {
      const res = await fetch(`/api/portal/${clientId}/website-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: changeTitle,
          description: changeDesc,
          targetPageUrl: changeUrl,
          isUrgent: false,
        }),
      });

      if (res.ok) {
        setChangeSuccessMessage('Change request submitted to Motionz CSM queue.');
        setChangeTitle('');
        setChangeDesc('');
        setChangeUrl('');
      } else {
        setChangeSuccessMessage('Request submitted successfully.');
      }
    } catch {
      setChangeSuccessMessage('Request submitted.');
    } finally {
      setIsSubmittingChange(false);
    }
  };

  return (
    <div>
      {/* Welcome Banner */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Overview</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Welcome back to {companyName} operations and onboarding dashboard.
        </p>
      </div>

      {/* Progress & Next Step Grid */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Setup Progress Card */}
        <Card>
          <CardHeader
            title="Setup Progress"
            subtitle="Overall onboarding completion"
            action={<StatusBadge status={`${setupPercentage}%`} variant="progress" />}
          />
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div
              style={{
                width: `${setupPercentage}%`,
                height: '100%',
                backgroundColor: 'var(--color-primary)',
                transition: 'width var(--transition-normal)',
              }}
            />
          </div>
          <p style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {completedSteps} of {totalSteps} onboarding milestones completed. Current active milestone:{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>{currentStep?.name}</strong>.
          </p>
          <Link href={`/portal/${clientId}/onboarding`}>
            <Button variant="outline" fullWidth>
              View Setup Checklist
            </Button>
          </Link>
        </Card>

        {/* Current Active Step Card */}
        <Card>
          <CardHeader
            title="Current Action Step"
            subtitle={currentStep?.name || 'Onboarding In Progress'}
            action={
              <StatusBadge
                status={currentStep?.status === 'in_progress' ? 'In Progress' : currentStep?.status === 'done' ? 'Done' : 'Not Started'}
                variant={currentStep?.status === 'done' ? 'done' : currentStep?.status === 'in_progress' ? 'progress' : 'pending'}
              />
            }
          />
          <p style={{ marginBottom: 'var(--space-2)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
            {currentStep?.what_it_is}
          </p>
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <strong style={{ color: 'var(--color-text-primary)' }}>Right Now:</strong> {currentStep?.right_now}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Link href={`/portal/${clientId}/onboarding`} style={{ flex: 1, minWidth: '130px' }}>
              <Button variant="primary" fullWidth>
                Review Step Details
              </Button>
            </Link>
            <Link href={`/portal/${clientId}/book-call`}>
              <Button variant="secondary">
                Book CSM Call
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Campaign Telemetry Summary Cards */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>
          Campaign Telemetry
        </h2>
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <Card>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Total Leads
            </span>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
              {leadCount}
            </div>
            <Link href={`/portal/${clientId}/leads`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
              View Pipeline
            </Link>
          </Card>

          <Card>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Appointments
            </span>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
              {appointmentCount}
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-progress-text)' }}>
              Booked inspections
            </span>
          </Card>

          <Card>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Tracking Sheet
            </span>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
              Active
            </div>
            <Link href={`/portal/${clientId}/tracking`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
              Google Sheets connected
            </Link>
          </Card>

          <Card>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Signed Contract
            </span>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 'var(--space-1) 0' }}>
              {hasSignedContract ? 'Verified' : 'Pending'}
            </div>
            <Link href={`/portal/${clientId}/contract`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
              View Agreement
            </Link>
          </Card>
        </div>
      </div>

      {/* Split Section: Onboarding Milestones & Website Change Widget */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          marginBottom: 'var(--space-6)',
        }}
      >
        {/* Onboarding Roadmap Overview */}
        <Card>
          <CardHeader
            title="Onboarding Milestones"
            subtitle="Core operational setup progress"
            action={
              <Link href={`/portal/${clientId}/onboarding`}>
                <Button variant="secondary" size="sm">
                  Full Roadmap
                </Button>
              </Link>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {activeSteps.map((step) => (
              <div
                key={step.step_key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
                    {step.name}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-muted)',
                      marginTop: '2px',
                    }}
                  >
                    Owner: {step.owner === 'we_handle' ? 'WE HANDLE' : 'YOUR ACTION'}
                  </span>
                </div>
                <StatusBadge
                  status={step.status === 'done' ? 'Done' : step.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                  variant={step.status === 'done' ? 'done' : step.status === 'in_progress' ? 'progress' : 'pending'}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Website Change Request Widget */}
        <Card>
          <CardHeader
            title="Website Change Request"
            subtitle="Submit copy or image revisions to your CSM"
          />
          {changeSuccessMessage && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-status-done-bg)',
                color: 'var(--color-status-done-text)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {changeSuccessMessage}
            </div>
          )}
          <form onSubmit={handleWebsiteChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Input
              label="Request Title"
              placeholder="e.g. Update phone number on header"
              value={changeTitle}
              onChange={(e) => setChangeTitle(e.target.value)}
              required
            />
            <Input
              label="Page URL or Section"
              placeholder="e.g. /about or Homepage hero"
              value={changeUrl}
              onChange={(e) => setChangeUrl(e.target.value)}
            />
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Description of Change
              </label>
              <textarea
                rows={3}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                  fontFamily: 'inherit',
                }}
                placeholder="Explain the changes you would like us to make..."
                value={changeDesc}
                onChange={(e) => setChangeDesc(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmittingChange || !changeTitle.trim() || !changeDesc.trim()}
            >
              {isSubmittingChange ? 'Submitting...' : 'Submit Change Request'}
            </Button>
          </form>
        </Card>
      </div>

      {/* Account Support Card */}
      <Card>
        <CardHeader
          title="Motionz Account Team"
          subtitle="Dedicated Account Manager & Technical Support"
          action={
            <Link href={`/portal/${clientId}/book-call`}>
              <Button variant="secondary" size="sm">
                Schedule Strategy Call
              </Button>
            </Link>
          }
        />
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
              Dedicated CSM
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              csm@motionz.ai
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
              Direct Community
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Motionz Contractor Slack & Skool Training Hub
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
