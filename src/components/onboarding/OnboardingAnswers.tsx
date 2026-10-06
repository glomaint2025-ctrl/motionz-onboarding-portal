'use client';

import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format';
import { fieldLabel } from '@/lib/utils/log-labels';

export interface OnboardingSubmissionView {
  id: string;
  submitter_email?: string;
  answers: Record<string, string>;
  submitted_at: string;
}

/**
 * Shows a client's onboarding form answers, newest submission first.
 * Staff (Admin and CSM) get a full card. With audience="client" it renders only the answers,
 * worded for the client, so the portal can place them inside its own card.
 */
export const OnboardingAnswers: React.FC<{ submissions: OnboardingSubmissionView[]; audience?: 'staff' | 'client' }> = ({
  submissions,
  audience = 'staff',
}) => {
  const [index, setIndex] = useState(0);
  // The list can change after a refresh; fall back to the newest one.
  const current = submissions[index] || submissions[0];
  const isClient = audience === 'client';
  const entries = current ? Object.entries(current.answers) : [];

  const answers = !current ? (
    <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Not submitted yet.</p>
  ) : (
    <>
      {submissions.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          {submissions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={s.id === current.id}
              className={s.id === current.id ? 'ui-pill-status ui-pill-status-active' : 'ui-pill-status'}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {/* Date and time: a client can send the form several times in one day. */}
              {i === 0 ? `Latest · ${formatDateTime(s.submitted_at)}` : formatDateTime(s.submitted_at)}
            </button>
          ))}
        </div>
      )}
      {isClient && current.submitter_email && (
        <p
          style={{
            margin: '0 0 var(--space-3) 0',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            wordBreak: 'break-word',
          }}
        >
          Sent from {current.submitter_email}
        </p>
      )}
      {entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>This form was sent without any answers.</p>
      ) : (
        <dl style={{ margin: 0, display: 'grid', gap: 'var(--space-3)' }}>
          {entries.map(([question, answer]) => (
            <div key={question}>
              <dt style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{fieldLabel(question)}</dt>
              <dd style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {/^https?:\/\//.test(answer) ? (
                  <a href={answer} target="_blank" rel="noopener noreferrer">
                    {answer}
                  </a>
                ) : (
                  answer
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  if (isClient) return <div>{answers}</div>;

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title="Onboarding form answers"
        subtitle={
          current
            ? `Submitted ${formatDateTime(current.submitted_at)}${current.submitter_email ? ` by ${current.submitter_email}` : ''}`
            : 'Answers appear here as soon as the client submits the onboarding form.'
        }
      />
      {answers}
    </Card>
  );
};
