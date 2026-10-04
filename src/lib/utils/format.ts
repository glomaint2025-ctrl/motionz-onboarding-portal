/**
 * One date style for the whole portal, so "3 Oct 2026" never appears next to "10/03/2026".
 * All functions accept an ISO string or Date and return '' for missing or invalid input.
 */
const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** "3 Oct 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** "3 Oct 2026, 10:46 PM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** "Saturday, 3 Oct 2026" */
export function formatLongDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
