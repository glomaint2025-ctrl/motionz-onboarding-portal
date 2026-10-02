'use client';

import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui';

export interface OnboardingSubmissionView {
  id: string;
  submitter_email?: string;
  answers: Record<string, string>;
  submitted_at: string;
}

/** Shows the client's onboarding form answers (newest submission first) to Admin and CSM. */
export const OnboardingAnswers: React.FC<{ submissions: OnboardingSubmissionView[] }> = ({ submissions }) => {
  const [index, setIndex] = useState(0);
  const current = submissions[index];

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
      <CardHeader
        title="Onboarding form answers"
        subtitle={
          current
            ? `Submitted ${new Date(current.submitted_at).toLocaleString()}${current.submitter_email ? ` by ${current.submitter_email}` : ''}`
            : 'Answers appear here as soon as the client submits the onboarding form.'
        }
      />
      {!current ? (
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
                  className={i === index ? 'ui-pill-status ui-pill-status-active' : 'ui-pill-status'}
                  style={{ cursor: 'pointer', border: 'none' }}
                >
                  {i === 0 ? 'Latest' : new Date(s.submitted_at).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}
          <dl style={{ margin: 0, display: 'grid', gap: 'var(--space-3)' }}>
            {Object.entries(current.answers).map(([question, answer]) => (
              <div key={question}>
                <dt style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{question}</dt>
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
        </>
      )}
    </Card>
  );
};
