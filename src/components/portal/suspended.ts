/**
 * Where to send someone whose access was turned off. Only a short code goes in the URL
 * (never the free-text reason); the page maps the code to fixed wording.
 */
export function suspendedPageUrl(apiError?: { code?: string } | null): string {
  const reason = apiError?.code === 'TENANT_SUSPENDED' ? 'portal' : 'account';
  return `/auth/suspended?reason=${reason}`;
}
