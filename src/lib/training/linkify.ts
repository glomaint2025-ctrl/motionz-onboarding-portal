/**
 * Splits plain text into text and https links, so a lesson description can show a pasted link
 * as a real link. Pure (no server code): the pages and the tests use the same rules. The page
 * renders the pieces as React elements; nothing here produces HTML.
 */

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const URL_PATTERN = /https:\/\/[^\s<>"']+/gi;
/** Punctuation that usually ends a sentence rather than the link. */
const TRAILING = /[.,;:!?]+$/;

export function splitTextWithLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;

  const pattern = new RegExp(URL_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    let link = match[0].replace(TRAILING, '');
    // "(see https://x.com/a)": a closing bracket without an opening one is not part of the link.
    while (link.endsWith(')') && !link.includes('(')) link = link.slice(0, -1).replace(TRAILING, '');

    let host = '';
    try {
      host = new URL(link).hostname;
    } catch {
      host = '';
    }
    if (!host) continue;

    const start = match.index as number;
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) });
    parts.push({ kind: 'link', text: link, href: link });
    last = start + link.length;
  }

  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
