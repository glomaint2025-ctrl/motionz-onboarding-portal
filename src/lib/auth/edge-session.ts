import { UserRole } from '../db/schema';

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  issuedAt: number;
  expiresAt: number;
}

const DEV_FALLBACK_SECRET = 'motionz-dev-fallback-session-secret-at-least-32-chars';

/**
 * Session signing secret. Production refuses to sign or verify sessions without a real
 * SESSION_SECRET (at least 32 characters), so the public dev fallback can never be used there.
 * Resolved lazily so `next build` does not require the secret.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
  }
  return DEV_FALLBACK_SECRET;
}
export const SESSION_COOKIE_NAME = 'motionz_session';

/**
 * Shown to a person whose own access was turned off. The reason is kept for the owner and staff only
 * (the Team dialog promises the person will not see it). A whole-client suspension still shows its reason.
 */
export const PERSONAL_ACCESS_OFF_MESSAGE =
  'Your access to this portal has been turned off. Contact your account owner or your Motionz contact if you think this is a mistake.';

/** Shown to everyone at a client that Motionz has archived. */
export const PORTAL_ARCHIVED_MESSAGE =
  'This portal has been archived by Motionz. Contact your Motionz contact if you think this is a mistake.';

/** An archived client is soft-deleted: deleted_at is set and the status is 'cancelled'. */
export function isTenantArchived(tenant: { deleted_at?: string | null; status?: string | null } | null | undefined): boolean {
  return Boolean(tenant && (tenant.deleted_at || tenant.status === 'cancelled'));
}

export const DEMO_TENANT_UUID = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
export const LEGACY_DEMO_TENANT_UUID = 'd0000000-0000-0000-0000-000000000001';

/**
 * Maps demo aliases to the demo tenant. Real tenant UUIDs (including databases seeded with the
 * older LEGACY_DEMO_TENANT_UUID) are never rewritten.
 */
export const resolveTenantId = (tenantId: string): string => {
  if (
    tenantId === 'demo' ||
    tenantId === 'tenant-demo-abc-roofing' ||
    tenantId === 'abc-roofing'
  ) {
    return DEMO_TENANT_UUID;
  }
  return tenantId;
};

function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseBase64UrlJson<T>(base64url: string): T | null {
  try {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const json = atob(base64);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Edge-compatible session verification using the Web Cryptography API (crypto.subtle).
 * Zero Node.js dependencies, 100% compatible with Vercel Edge Runtime and Next.js middleware.
 */
export async function verifyEdgeSession(
  token: string,
  secret?: string
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [base64Data, signature] = parts;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret ?? getSessionSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64UrlToUint8Array(signature);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      encoder.encode(base64Data)
    );

    if (!isValid) return null;

    const payload = parseBase64UrlJson<SessionPayload>(base64Data);
    if (!payload || !payload.expiresAt) return null;

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Edge-compatible check to inspect whether a tenant is suspended.
 * Uses native fetch to Supabase PostgREST REST API without any Node.js dependencies.
 */
export async function checkEdgeTenantSuspension(
  tenantId: string
): Promise<{ suspended: boolean; reason?: string }> {
  const resolvedId = resolveTenantId(tenantId);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key || !resolvedId) return { suspended: false };

  try {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        resolvedId
      );
    const filter = isUuid
      ? `or=(id.eq.${resolvedId},slug.eq.${resolvedId})`
      : `slug.eq.${resolvedId}`;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/tenants?${filter}&select=status,settings,deleted_at`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) return { suspended: false };
    const rows = await res.json();
    if (rows && rows.length > 0) {
      const tenant = rows[0];
      const suspension = tenant.settings?.suspension;
      if (isTenantArchived(tenant)) {
        return { suspended: true, reason: PORTAL_ARCHIVED_MESSAGE };
      }
      if (tenant.status === 'suspended' || suspension?.suspended_at) {
        return {
          suspended: true,
          reason:
            suspension?.suspended_reason ||
            'Client account disabled by Motionz administrator.',
        };
      }
    }
  } catch {
    // Fail safe to allow normal fallback flow
  }
  return { suspended: false };
}

/**
 * Edge-compatible check to inspect whether a user account is suspended.
 */
export async function checkEdgeUserSuspension(
  userId: string
): Promise<{ suspended: boolean; reason?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key || !userId) return { suspended: false };

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=status`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) return { suspended: false };
    const rows = await res.json();
    if (rows && rows.length > 0) {
      const user = rows[0];
      if (user.status === 'suspended') {
        return { suspended: true, reason: PERSONAL_ACCESS_OFF_MESSAGE };
      }
    }
  } catch {
    // Fail safe
  }
  return { suspended: false };
}

