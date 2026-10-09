import React from 'react';
import { splitTextWithLinks } from '@/lib/training/linkify';

/** Plain text where any https:// link can be clicked. It opens in a new tab. */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitTextWithLinks(text).map((part, index) =>
        part.kind === 'link' ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}
