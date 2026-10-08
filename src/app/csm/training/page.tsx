'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardSkeleton, StatusBadge, buttonClasses } from '@/components/ui';
import { Icon } from '@/components/brand/Icon';
import { Notice } from '@/components/admin/Notice';
import { LessonVideo, TrainingProgressBar } from '@/components/training/LessonVideo';
import { formatDate } from '@/lib/utils/format';

interface Lesson {
  id: string;
  number: number;
  title: string;
  description: string | null;
  video_url: string | null;
  finished_at: string | null;
  locked: boolean;
}

interface Training {
  available: boolean;
  lessons: Lesson[];
  total: number;
  finished: number;
  complete: boolean;
  required: boolean;
  exempt: boolean;
  blocked: boolean;
  preview: boolean;
}

const numberStyle = (state: 'done' | 'open' | 'locked'): React.CSSProperties => ({
  flex: '0 0 auto',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--radius-full)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)',
  backgroundColor:
    state === 'done' ? 'var(--color-status-done-bg)' : state === 'open' ? 'var(--color-primary-soft)' : 'var(--color-bg-hover)',
  color:
    state === 'done' ? 'var(--color-status-done-text)' : state === 'open' ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
  border: `1px solid ${
    state === 'done' ? 'var(--color-status-done-border)' : state === 'open' ? 'var(--color-primary-border)' : 'var(--color-border-subtle)'
  }`,
});

export default function CsmTrainingPage() {
  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  // Finished lessons stay closed until "Watch again" is clicked, so only one video loads at a time.
  const [rewatch, setRewatch] = useState<Record<string, boolean>>({});

  const load = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await fetch('/api/csm/training');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setTraining(data);
      else setLoadError(data.error || 'Could not load your training.');
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const finish = async (lesson: Lesson) => {
    setBusyId(lesson.id);
    setActionError('');
    try {
      const res = await fetch('/api/csm/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTraining(data);
      } else {
        setActionError(data.error || 'Could not save that. Please try again.');
        // The lesson list may have changed (a lesson was hidden, reordered or removed).
        if (res.status === 404 || res.status === 409) load();
      }
    } catch {
      setActionError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusyId('');
    }
  };

  const nextLessonId = training?.lessons.find((l) => !l.finished_at && !l.locked)?.id;

  return (
    <div>
      <div className="ui-breadcrumb">
        <span className="ui-breadcrumb-current">Training</span>
      </div>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)', letterSpacing: '-0.02em' }}>
          Training
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
          Watch each video, then click Finish to move on to the next lesson.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <CardSkeleton height="96px" />
          <CardSkeleton height="320px" />
        </div>
      ) : loadError ? (
        <Notice onRetry={load}>{loadError}</Notice>
      ) : !training || !training.available ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>Training is not set up yet.</p>
        </Card>
      ) : training.total === 0 ? (
        <Card>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            No lessons have been added yet. {training.preview ? 'Add them on the CSM Training page.' : 'Your CSM Manager will add them here.'}
          </p>
          {training.preview && (
            <Link href="/admin/training" className={buttonClasses({ variant: 'primary', size: 'sm' })} style={{ marginTop: 'var(--space-3)' }}>
              Go to CSM Training
            </Link>
          )}
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {training.preview && (
            <Notice tone="info">
              You are previewing the training as a CSM Manager, so no lesson is locked for you. CSMs take the lessons in order.
            </Notice>
          )}

          {training.complete ? (
            <Card
              style={{
                borderColor: 'var(--color-status-done-border)',
                backgroundColor: 'var(--color-status-done-bg)',
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--color-status-done-text)', display: 'inline-flex', marginTop: '2px' }}>
                  <Icon name="check-circle" size={28} />
                </span>
                <div style={{ flex: '1 1 240px' }}>
                  <h2 style={{ fontSize: 'var(--font-size-lg)', margin: '0 0 var(--space-1)', color: 'var(--color-text-primary)' }}>Training complete</h2>
                  <p style={{ margin: '0 0 var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    You have finished all {training.total} lesson{training.total === 1 ? '' : 's'}. You can watch any of them again below.
                  </p>
                  <TrainingProgressBar finished={training.finished} total={training.total} />
                </div>
                {!training.preview && (
                  <Link href="/csm/clients" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
                    Go to My Clients
                  </Link>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <TrainingProgressBar finished={training.finished} total={training.total} />
              {training.blocked && (
                <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Finish every lesson to unlock My Clients.
                </p>
              )}
            </Card>
          )}

          {actionError && <Notice>{actionError}</Notice>}

          {training.lessons.map((lesson) => {
            const done = Boolean(lesson.finished_at);
            const state = done ? 'done' : lesson.locked ? 'locked' : 'open';
            const showVideo = !lesson.locked && Boolean(lesson.video_url) && (lesson.id === nextLessonId || Boolean(rewatch[lesson.id]));
            return (
              <Card key={lesson.id} style={lesson.locked ? { opacity: 0.75 } : undefined}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <span style={numberStyle(state)} aria-hidden="true">
                    {lesson.number}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0, color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
                        <span className="sr-only">Lesson {lesson.number}: </span>
                        {lesson.title}
                      </h2>
                      {done ? (
                        <StatusBadge status={`Finished on ${formatDate(lesson.finished_at)}`} variant="done" />
                      ) : lesson.locked ? (
                        <StatusBadge status="Locked" variant="pending" dot={false} />
                      ) : (
                        <StatusBadge status={lesson.id === nextLessonId ? 'Up next' : 'Not finished'} variant="progress" />
                      )}
                    </div>

                    {lesson.description && (
                      <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {lesson.description}
                      </p>
                    )}

                    <div style={{ marginTop: 'var(--space-4)' }}>
                      {lesson.locked ? (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                          <Icon name="lock" size={16} />
                          Finish the previous lesson first
                        </p>
                      ) : (
                        <>
                          {showVideo && lesson.video_url && <LessonVideo url={lesson.video_url} title={lesson.title} />}
                          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: showVideo ? 'var(--space-4)' : 0 }}>
                            {!showVideo && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setRewatch((prev) => ({ ...prev, [lesson.id]: true }))}
                              >
                                {done ? 'Watch again' : 'Show video'}
                              </Button>
                            )}
                            {!done && (
                              <Button type="button" variant="primary" onClick={() => finish(lesson)} disabled={Boolean(busyId)}>
                                {busyId === lesson.id ? 'Saving...' : 'Finish'}
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
