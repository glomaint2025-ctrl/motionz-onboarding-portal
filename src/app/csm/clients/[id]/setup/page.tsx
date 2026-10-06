'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Select, Button, StatusBadge, buttonClasses } from '@/components/ui';
import { OnboardingAnswers, OnboardingSubmissionView } from '@/components/onboarding/OnboardingAnswers';
import { Notice, useRevealOnMessage } from '@/components/admin/Notice';
import { Icon } from '@/components/brand';

const STEP_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};
const stepStatusLabel = (status: string) => STEP_STATUS_LABELS[status] || 'Unknown';
const TEXT_MAX = 2000;

interface SetupStep {
  id: string;
  step_key: string;
  name: string;
  owner: string;
  status: 'not_started' | 'in_progress' | 'done';
  what_it_is: string;
  right_now: string;
  we_need_from_you?: string;
  unlocks: string;
  sort_order: number;
}

export default function CSMClientSetupEditorPage() {
  const params = useParams();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any | null>(null);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  // Staff-only reminder. Stays hidden unless the server says no contract is attached.
  const [hasContract, setHasContract] = useState(true);
  const [submissions, setSubmissions] = useState<OnboardingSubmissionView[]>([]);
  const [accessError, setAccessError] = useState('');
  const [loadError, setLoadError] = useState('');

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<'not_started' | 'in_progress' | 'done'>('not_started');
  const [editRightNow, setEditRightNow] = useState('');
  const [editWeNeed, setEditWeNeed] = useState('');
  const [editWhatItIs, setEditWhatItIs] = useState('');
  const [editUnlocks, setEditUnlocks] = useState('');
  const [editName, setEditName] = useState('');
  const [saveError, setSaveError] = useState('');
  // Which field the error is about (name, right_now, what_it_is, unlocks, we_need_from_you or status).
  const [saveErrorField, setSaveErrorField] = useState('');
  const saveErrorRef = useRevealOnMessage(saveError);
  const [saving, setSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fetchSetupData = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await fetch(`/api/csm/clients/${clientId}/setup`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setAccessError(data.error || 'This client is not assigned to you.');
      } else if (res.status === 404) {
        setAccessError('This client could not be found. It may have been archived.');
      } else if (res.ok && data.success) {
        setTenant(data.tenant);
        setSteps(data.steps || []);
        setSubmissions(data.onboardingSubmissions || []);
        setProgressPercent(data.progressPercent || 0);
        setHasContract(data.hasContract !== false);
      } else {
        setLoadError(data.error || 'Could not load this client’s setup steps.');
      }
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchSetupData();
  }, [clientId]);

  const startEditing = (step: SetupStep) => {
    setEditingKey(step.step_key);
    setEditStatus(step.status);
    setEditRightNow(step.right_now);
    setEditWeNeed(step.we_need_from_you || '');
    setEditWhatItIs(step.what_it_is);
    setEditUnlocks(step.unlocks);
    setEditName(step.name);
    setSaveError('');
    setSaveErrorField('');
    setFeedbackMessage(null);
  };

  const handleSaveStep = async (stepKey: string) => {
    const required: [string, string, string][] = [
      ['Step name', editName, 'name'],
      ['Right now', editRightNow, 'right_now'],
      ['What it is', editWhatItIs, 'what_it_is'],
      ['Unlocks', editUnlocks, 'unlocks'],
    ];
    const blank = required.find(([, text]) => !text.trim());
    if (blank) {
      setSaveError(`"${blank[0]}" cannot be empty. The client sees this text.`);
      setSaveErrorField(blank[2]);
      return;
    }
    try {
      setSaving(true);
      setSaveError('');
      setSaveErrorField('');
      const res = await fetch(`/api/csm/clients/${clientId}/setup`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepKey,
          name: editName,
          status: editStatus,
          right_now: editRightNow,
          we_need_from_you: editWeNeed,
          what_it_is: editWhatItIs,
          unlocks: editUnlocks,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedbackMessage(`"${data.step?.name || editName.trim()}" was saved.`);
        setEditingKey(null);
        await fetchSetupData();
        setTimeout(() => setFeedbackMessage(null), 3000);
      } else {
        setSaveError(data.error || 'Could not save this step.');
        setSaveErrorField(typeof data.field === 'string' ? data.field : '');
      }
    } catch {
      setSaveError('Could not reach the server. Your changes were not saved.');
    } finally {
      setSaving(false);
    }
  };

  /** Props that mark one input as the field the error is about; editing it clears the mark. */
  const fieldState = (key: string) => (saveErrorField === key ? { 'aria-invalid': true, 'aria-describedby': 'step-field-error' } : {});
  const fieldClass = (base: string, key: string) => (saveErrorField === key ? `${base} ui-input-error` : base);
  const fieldNote = (key: string) =>
    saveErrorField === key ? (
      <span className="ui-error-text" id="step-field-error">
        {saveError}
      </span>
    ) : null;
  const clearFieldError = (key: string) => {
    if (saveErrorField === key) setSaveErrorField('');
  };

  if (loading) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <p>Loading setup steps...</p>
      </Card>
    );
  }

  if (accessError) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <p style={{ marginBottom: 'var(--space-4)' }}>{accessError}</p>
        <Link href="/csm/clients" className={buttonClasses({ variant: 'secondary' })}>
          Back to my clients
        </Link>
      </Card>
    );
  }

  if (loadError || !tenant) {
    return (
      <Card style={{ padding: 'var(--space-6)' }}>
        <Notice onRetry={fetchSetupData} style={{ marginBottom: 'var(--space-4)' }}>
          {loadError || 'Could not load this client’s setup steps.'}
        </Notice>
        <Link href="/csm/clients" className={buttonClasses({ variant: 'secondary' })}>
          Back to my clients
        </Link>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <Link href="/csm/clients" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
            Back to my clients
          </Link>
          <h1 style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            {tenant.name}: setup progress
          </h1>
          <p>Update each setup step and the wording the client sees for it.</p>
        </div>
        <Link
          href={`/portal/${clientId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: 'secondary' })}
        >
          Open portal
          <Icon name="external" size={16} />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      </div>

      {feedbackMessage && (
        <Notice tone="success" style={{ marginBottom: 'var(--space-5)' }}>
          {feedbackMessage}
        </Notice>
      )}

      {!hasContract && (
        <Notice tone="info" style={{ marginBottom: 'var(--space-5)' }}>
          This client has no contract attached yet. Ask an admin to attach it (Admin → Clients → {tenant.name} → Contract).
        </Notice>
      )}

      <OnboardingAnswers submissions={submissions} />

      {/* Progress Bar Summary */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Setup progress"
          subtitle="The share of this client’s setup steps marked Done."
          action={<StatusBadge status={`${progressPercent}% done`} variant={progressPercent === 100 ? 'done' : 'progress'} />}
        />
        <div
          style={{
            width: '100%',
            height: '10px',
            backgroundColor: 'var(--color-bg-surface)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
            marginBottom: 'var(--space-3)',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: 'var(--color-primary)',
              transition: 'width var(--transition-normal)',
            }}
          />
        </div>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          {steps.length === 0
            ? 'This client has no setup steps yet.'
            : `${steps.filter((s) => s.status === 'done').length} of ${steps.length} steps done.`}
        </p>
      </Card>

      {/* Setup step cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {steps.map((step, idx) => {
          const isCurrentlyEditing = editingKey === step.step_key;

          return (
            <Card key={step.step_key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                    STEP {idx + 1} &middot; {step.owner === 'we_handle' ? 'MOTIONZ HANDLES' : 'CLIENT ACTION'}
                  </span>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', marginTop: 'var(--space-1)' }}>
                    {step.name}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <StatusBadge
                    status={stepStatusLabel(step.status)}
                    variant={step.status === 'done' ? 'done' : step.status === 'in_progress' ? 'progress' : 'pending'}
                  />
                  {!isCurrentlyEditing && (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => startEditing(step)} aria-label={`Edit step: ${step.name}`}>
                      Edit step
                    </Button>
                  )}
                </div>
              </div>

              {isCurrentlyEditing ? (
                /* Inline Editing Form for CSM */
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                  {saveError && (
                    <Notice ref={saveErrorRef} style={{ marginBottom: 'var(--space-3)' }}>
                      {saveError}
                    </Notice>
                  )}
                  <div className="ui-form-group">
                    <label className="ui-label" htmlFor={`step-name-${step.step_key}`}>Step name</label>
                    <input
                      id={`step-name-${step.step_key}`}
                      className={fieldClass('ui-input', 'name')}
                      value={editName}
                      maxLength={120}
                      required
                      {...fieldState('name')}
                      onChange={(e) => {
                        setEditName(e.target.value);
                        clearFieldError('name');
                      }}
                    />
                    {fieldNote('name')}
                  </div>
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <Select
                      label="Status"
                      value={editStatus}
                      error={saveErrorField === 'status' ? saveError : undefined}
                      onChange={(e) => {
                        setEditStatus(e.target.value as any);
                        clearFieldError('status');
                      }}
                    >
                      <option value="not_started">{STEP_STATUS_LABELS.not_started}</option>
                      <option value="in_progress">{STEP_STATUS_LABELS.in_progress}</option>
                      <option value="done">{STEP_STATUS_LABELS.done}</option>
                    </Select>
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label" htmlFor={`step-now-${step.step_key}`}>Right now (what is happening on this step)</label>
                    <textarea
                      id={`step-now-${step.step_key}`}
                      className={fieldClass('ui-textarea', 'right_now')}
                      rows={2}
                      maxLength={TEXT_MAX}
                      required
                      value={editRightNow}
                      {...fieldState('right_now')}
                      onChange={(e) => {
                        setEditRightNow(e.target.value);
                        clearFieldError('right_now');
                      }}
                    />
                    {fieldNote('right_now') || <span className="ui-helper-text">The client sees this as the current state of the step.</span>}
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label" htmlFor={`step-need-${step.step_key}`}>What we need from the client (optional)</label>
                    <textarea
                      id={`step-need-${step.step_key}`}
                      className={fieldClass('ui-textarea', 'we_need_from_you')}
                      rows={2}
                      maxLength={TEXT_MAX}
                      value={editWeNeed}
                      {...fieldState('we_need_from_you')}
                      onChange={(e) => {
                        setEditWeNeed(e.target.value);
                        clearFieldError('we_need_from_you');
                      }}
                      placeholder="e.g. Please fill in the texting form so we can register your number."
                    />
                    {fieldNote('we_need_from_you')}
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label" htmlFor={`step-what-${step.step_key}`}>What it is (a short description of the step)</label>
                    <textarea
                      id={`step-what-${step.step_key}`}
                      className={fieldClass('ui-textarea', 'what_it_is')}
                      rows={2}
                      maxLength={TEXT_MAX}
                      required
                      value={editWhatItIs}
                      {...fieldState('what_it_is')}
                      onChange={(e) => {
                        setEditWhatItIs(e.target.value);
                        clearFieldError('what_it_is');
                      }}
                    />
                    {fieldNote('what_it_is')}
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label" htmlFor={`step-unlocks-${step.step_key}`}>Unlocks (what the client gets when this is done)</label>
                    <textarea
                      id={`step-unlocks-${step.step_key}`}
                      className={fieldClass('ui-textarea', 'unlocks')}
                      rows={2}
                      maxLength={TEXT_MAX}
                      required
                      value={editUnlocks}
                      {...fieldState('unlocks')}
                      onChange={(e) => {
                        setEditUnlocks(e.target.value);
                        clearFieldError('unlocks');
                      }}
                    />
                    {fieldNote('unlocks')}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                    <Button variant="secondary" size="sm" disabled={saving} onClick={() => setEditingKey(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={saving}
                      onClick={() => handleSaveStep(step.step_key)}
                    >
                      {saving ? 'Saving...' : 'Save step'}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Read-Only Guidance Card */
                <div>
                  <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
                      RIGHT NOW
                    </span>
                    <p style={{ color: 'var(--color-text-primary)' }}>{step.right_now}</p>
                  </div>

                  {step.we_need_from_you && (
                    <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
                        WHAT WE NEED FROM THE CLIENT
                      </span>
                      <p style={{ color: 'var(--color-text-primary)' }}>{step.we_need_from_you}</p>
                    </div>
                  )}

                  <p style={{ marginBottom: 'var(--space-2)' }}>
                    <strong>What it is:</strong> {step.what_it_is}
                  </p>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    <strong>Unlocks:</strong> {step.unlocks}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
