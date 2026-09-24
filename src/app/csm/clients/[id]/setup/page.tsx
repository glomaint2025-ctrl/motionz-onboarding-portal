'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Select, Button, StatusBadge } from '@/components/ui';

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

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<'not_started' | 'in_progress' | 'done'>('not_started');
  const [editRightNow, setEditRightNow] = useState('');
  const [editWeNeed, setEditWeNeed] = useState('');
  const [editWhatItIs, setEditWhatItIs] = useState('');
  const [editUnlocks, setEditUnlocks] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fetchSetupData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/csm/clients/${clientId}/setup`);
      const data = await res.json();
      if (data.success) {
        setTenant(data.tenant);
        setSteps(data.steps || []);
        setProgressPercent(data.progressPercent || 0);
      }
    } catch (err) {
      console.error('Failed to load setup steps:', err);
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
    setFeedbackMessage(null);
  };

  const handleSaveStep = async (stepKey: string) => {
    try {
      setSaving(true);
      const res = await fetch(`/api/csm/clients/${clientId}/setup`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepKey,
          status: editStatus,
          right_now: editRightNow,
          we_need_from_you: editWeNeed,
          what_it_is: editWhatItIs,
          unlocks: editUnlocks,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedbackMessage(`Step "${stepKey}" updated successfully.`);
        setEditingKey(null);
        await fetchSetupData();
        setTimeout(() => setFeedbackMessage(null), 3000);
      }
    } catch (err) {
      console.error('Failed to save step:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <p>Loading client setup roadmap...</p>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <Link href="/csm/clients" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
            Back to Assigned Clients
          </Link>
          <h1 style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            {tenant?.name} Setup Progress
          </h1>
          <p>Update onboarding milestones, edit real-time guidance copy, and advance setup velocity.</p>
        </div>
        <Link href={`/portal/${clientId}`}>
          <Button variant="secondary">
            Open Client Portal View
          </Button>
        </Link>
      </div>

      {feedbackMessage && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-done-bg)',
            border: '1px solid var(--color-status-done-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-status-done-text)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-5)',
          }}
        >
          {feedbackMessage}
        </div>
      )}

      {/* Progress Bar Summary */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title="Onboarding Completion Velocity"
          subtitle={`Mathematically derived from the 5 confirmed setup steps`}
          action={<StatusBadge status={`${progressPercent}% Done`} variant="progress" />}
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
          {steps.filter((s) => s.status === 'done').length} of {steps.length} milestones complete.
        </p>
      </Card>

      {/* Five Confirmed Setup Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {steps.map((step, idx) => {
          const isCurrentlyEditing = editingKey === step.step_key;

          return (
            <Card key={step.step_key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                    STEP {idx + 1} &middot; {step.owner === 'we_handle' ? 'WE HANDLE' : 'YOUR ACTION'}
                  </span>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', marginTop: 'var(--space-1)' }}>
                    {step.name}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <StatusBadge status={step.status.replace('_', ' ')} />
                  {!isCurrentlyEditing && (
                    <Button variant="outline" size="sm" onClick={() => startEditing(step)}>
                      Edit Guidance & Status
                    </Button>
                  )}
                </div>
              </div>

              {isCurrentlyEditing ? (
                /* Inline Editing Form for CSM */
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <label className="ui-label">Milestone Status</label>
                    <select
                      className="ui-select"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label">Right Now (Live Operational Status)</label>
                    <textarea
                      className="ui-textarea"
                      rows={2}
                      value={editRightNow}
                      onChange={(e) => setEditRightNow(e.target.value)}
                    />
                    <span className="ui-helper-text">Visible to the client as the current live state.</span>
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label">We Need From You (Client Action If Applicable)</label>
                    <textarea
                      className="ui-textarea"
                      rows={2}
                      value={editWeNeed}
                      onChange={(e) => setEditWeNeed(e.target.value)}
                      placeholder="e.g. Awaiting client Facebook page admin access delegation."
                    />
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label">What It Is (Milestone Description)</label>
                    <textarea
                      className="ui-textarea"
                      rows={2}
                      value={editWhatItIs}
                      onChange={(e) => setEditWhatItIs(e.target.value)}
                    />
                  </div>

                  <div className="ui-form-group">
                    <label className="ui-label">Unlocks</label>
                    <textarea
                      className="ui-textarea"
                      rows={2}
                      value={editUnlocks}
                      onChange={(e) => setEditUnlocks(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                    <Button variant="secondary" size="sm" onClick={() => setEditingKey(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={saving}
                      onClick={() => handleSaveStep(step.step_key)}
                    >
                      {saving ? 'Saving...' : 'Save Step Updates'}
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
                    <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
                        WE NEED FROM YOU
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
