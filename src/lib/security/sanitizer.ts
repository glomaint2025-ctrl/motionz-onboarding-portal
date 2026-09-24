/**
 * Input sanitization and XSS mitigation utilities.
 * Strips dangerous HTML tags, inline scripts, event handlers, and protocol injections.
 */

export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/on\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
}

export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const matchHtmlRegExp = /["'&<>]/;
  const match = matchHtmlRegExp.exec(input);
  if (!match) return input;

  let html = '';
  let index = 0;
  let lastIndex = 0;

  for (index = match.index; index < input.length; index++) {
    let escape = '';
    switch (input.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;';
        break;
      case 38: // &
        escape = '&amp;';
        break;
      case 39: // '
        escape = '&#39;';
        break;
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += input.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ? html + input.substring(lastIndex, index) : html;
}

export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return escapeHtml(sanitizeHtml(input.trim()));
}
