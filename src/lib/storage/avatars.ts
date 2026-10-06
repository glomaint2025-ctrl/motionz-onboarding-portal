/**
 * Profile pictures ("My profile").
 *
 * Files live in the PRIVATE Supabase Storage bucket "avatars" under
 * `users/<userId>/<random>.<ext>`. Only the service-role client touches the bucket; the API
 * hands out short-lived signed URLs, never public ones.
 *
 * Only PNG, JPG and WEBP are accepted (no SVG: it can carry scripts). The type is decided by the
 * file's content, checked against the MIME type the browser sent; the file name is never used.
 *
 * When Supabase is not configured (tests / local mock mode) files are kept in memory and a
 * `data:` URL is returned. In production a missing Supabase configuration is an error.
 */
import { randomUUID } from 'node:crypto';
import { getSupabaseServiceClient } from '../db/supabase-client';

export const AVATAR_BUCKET = 'avatars';
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ALLOWED_AVATAR_LABEL = 'PNG, JPG or WEBP';

type AvatarKind = { ext: 'png' | 'jpg' | 'webp'; contentType: string; mimes: string[] };

const AVATAR_KINDS: AvatarKind[] = [
  { ext: 'png', contentType: 'image/png', mimes: ['image/png'] },
  { ext: 'jpg', contentType: 'image/jpeg', mimes: ['image/jpeg', 'image/pjpeg'] },
  { ext: 'webp', contentType: 'image/webp', mimes: ['image/webp'] },
];

export const ALLOWED_AVATAR_MIME_TYPES = AVATAR_KINDS.map((k) => k.contentType);

export class AvatarValidationError extends Error {}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

/** What the content really is, from its first bytes. */
function sniffKind(bytes: Uint8Array): AvatarKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return AVATAR_KINDS[0];
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return AVATAR_KINDS[1];
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return AVATAR_KINDS[2];
  return null;
}

/**
 * Validates a picture by size, declared MIME type and content signature.
 * Returns the extension and canonical content type to store it with, or throws AvatarValidationError.
 */
export function validateAvatar(file: { type: string; bytes: Uint8Array }): { ext: string; contentType: string } {
  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  const declared = AVATAR_KINDS.find((k) => k.mimes.includes(mime));
  if (!declared) {
    throw new AvatarValidationError(`That file type is not supported. Choose a ${ALLOWED_AVATAR_LABEL} picture.`);
  }
  if (file.bytes.byteLength === 0) {
    throw new AvatarValidationError('That file is empty. Choose another picture.');
  }
  if (file.bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new AvatarValidationError('That picture is larger than 2 MB. Choose a smaller one.');
  }
  const actual = sniffKind(file.bytes);
  if (!actual || actual.ext !== declared.ext) {
    throw new AvatarValidationError(`That file does not look like a valid picture. Choose a ${ALLOWED_AVATAR_LABEL} picture.`);
  }
  return { ext: actual.ext, contentType: actual.contentType };
}

/** A path is only ever used for the person it belongs to. */
export function isAvatarPathOf(userId: string, path: unknown): path is string {
  return typeof path === 'string' && /^users\/[^/]+\/[A-Za-z0-9-]+\.(png|jpg|webp)$/.test(path) && path.startsWith(`users/${userId}/`);
}

// ---- In-memory fallback (tests / local mock mode) ----
const mockAvatars = new Map<string, { bytes: Uint8Array; contentType: string }>();

export function getMockStoredAvatars(): Map<string, { bytes: Uint8Array; contentType: string }> {
  return mockAvatars;
}

export function resetMockStoredAvatars(): void {
  mockAvatars.clear();
}

// ---- Supabase Storage ----
let bucketReady: Promise<void> | null = null;

async function ensureBucket(client: NonNullable<ReturnType<typeof getSupabaseServiceClient>>): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await client.storage.getBucket(AVATAR_BUCKET);
      if (data) return;
      const { error } = await client.storage.createBucket(AVATAR_BUCKET, {
        public: false,
        fileSizeLimit: MAX_AVATAR_BYTES,
        allowedMimeTypes: ALLOWED_AVATAR_MIME_TYPES,
      });
      // Another request may have created it in the meantime.
      if (error && !/already exists|duplicate/i.test(error.message || '')) {
        throw new Error(`Could not create storage bucket: ${error.message}`);
      }
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  return bucketReady;
}

/** Stores one already-validated picture for a person and returns its object path. */
export async function uploadAvatar(userId: string, file: { ext: string; contentType: string; bytes: Uint8Array }): Promise<string> {
  const path = `users/${userId}/${randomUUID()}.${file.ext}`;

  const client = getSupabaseServiceClient();
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('File storage is not configured.');
    }
    mockAvatars.set(path, { bytes: file.bytes, contentType: file.contentType });
    return path;
  }

  await ensureBucket(client);
  const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, file.bytes, {
    contentType: file.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Best-effort removal of a picture that is no longer used. */
export async function removeAvatar(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const client = getSupabaseServiceClient();
  if (!client) {
    mockAvatars.delete(path);
    return;
  }
  try {
    await client.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // An orphaned file in a private bucket is harmless; nothing else to do.
  }
}

/**
 * A short-lived link to a person's picture, or null when they have none (or it cannot be read).
 * Never throws: a missing picture must not break the page that shows it.
 */
export async function getAvatarUrl(userId: string, path: string | null | undefined): Promise<string | null> {
  if (!isAvatarPathOf(userId, path)) return null;
  const client = getSupabaseServiceClient();
  if (!client) {
    const file = mockAvatars.get(path);
    return file ? `data:${file.contentType};base64,${Buffer.from(file.bytes).toString('base64')}` : null;
  }
  try {
    const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
    return error || !data?.signedUrl ? null : data.signedUrl;
  } catch {
    return null;
  }
}
