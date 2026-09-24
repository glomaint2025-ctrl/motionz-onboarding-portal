import { UserRole } from '../db/schema';

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  issuedAt: number;
  expiresAt: number;
}

export const SESSION_SECRET =
  process.env.SESSION_SECRET || 'motionz-dev-fallback-session-secret-at-least-32-chars';
export const SESSION_COOKIE_NAME = 'motionz_session';

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
  secret = SESSION_SECRET
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [base64Data, signature] = parts;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
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
