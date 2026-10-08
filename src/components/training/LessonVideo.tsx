'use client';

import React from 'react';
import { buttonClasses } from '@/components/ui';
import { toVideoEmbed } from '@/lib/training/embed';

const PROVIDER_NAMES = { youtube: 'YouTube', loom: 'Loom', vimeo: 'Vimeo', drive: 'Google Drive' } as const;

/** One line for a CSM Manager: how a pasted link will be shown to CSMs. */
export function describeVideoLink(link: string): string {
  const video = toVideoEmbed(link);
  if (!video) return 'Not a usable link (it must start with https://).';
  return video.kind === 'embed'
    ? `${PROVIDER_NAMES[video.provider]} video: plays inside the Training page.`
    : 'Opens in a new tab (only YouTube, Loom, Vimeo and Google Drive links play inside the page).';
}

/**
 * A lesson's video. YouTube, Loom, Vimeo and Google Drive links play inside the page;
 * any other https link is an "Open video" button that opens a new tab.
 */
export function LessonVideo({ url, title }: { url: string; title: string }) {
  const video = toVideoEmbed(url);

  if (!video) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
        This lesson&rsquo;s video link does not work. Please tell your CSM Manager.
      </p>
    );
  }

  if (video.kind === 'link') {
    return (
      <a href={video.href} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'outline' })}>
        Open video
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-bg-base)',
        }}
      >
        <iframe
          src={video.src}
          title={title}
          loading="lazy"
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-block', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}
      >
        Video not showing? Open it in a new tab
      </a>
    </div>
  );
}

/** "3 of 8 lessons finished" with a bar. */
export function TrainingProgressBar({ finished, total }: { finished: number; total: number }) {
  const percent = total > 0 ? Math.round((finished / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
          {finished} of {total} lesson{total === 1 ? '' : 's'} finished
        </span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Training progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finished}
        aria-valuetext={`${finished} of ${total} lessons finished`}
        style={{
          height: '8px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-bg-hover)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            backgroundColor: percent === 100 ? 'var(--color-status-done-solid)' : 'var(--color-primary)',
            transition: 'width var(--transition-normal)',
          }}
        />
      </div>
    </div>
  );
}
