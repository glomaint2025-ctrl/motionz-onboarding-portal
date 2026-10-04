/**
 * Attachments for client website change requests.
 *
 * Files live in the PRIVATE Supabase Storage bucket "website-requests" under
 * `<tenantId>/<uuid>-<sanitized filename>`. Only the service-role client touches the bucket;
 * staff receive time-limited signed URLs by email.
 *
 * When Supabase is not configured (tests / local mock mode) files are kept in memory and a
 * `mock://` URL is returned. In production a missing Supabase configuration is an error.
 */
import { randomUUID } from 'node:crypto';
import { getSupabaseServiceClient } from '../db/supabase-client';

export const WEBSITE_REQUEST_BUCKET = 'website-requests';
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Allowed extension -> accepted MIME types (the first one is canonical and used for storage). */
const ALLOWED_TYPES: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  svg: ['image/svg+xml'],
  pdf: ['application/pdf'],
};

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_TYPES);
export const ALLOWED_ATTACHMENT_MIME_TYPES = Array.from(new Set(Object.values(ALLOWED_TYPES).flat()));
export const ALLOWED_ATTACHMENT_LABEL = 'PNG, JPG, WEBP, GIF, SVG or PDF';

export class AttachmentValidationError extends Error {}

export interface StoredAttachment {
  /** Sanitized file name. */
  name: string;
  /** Object path inside the bucket. */
  path: string;
  size: number;
  contentType: string;
  /** Signed URL (7 days) or a `mock://` URL in mock mode. */
  url: string;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/** Strips any path, unsafe characters and leading dots; keeps the extension; never returns an empty name. */
export function sanitizeFilename(original: string): string {
  const base = String(original || '').split(/[\\/]/).pop() || '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');
  const ext = extensionOf(cleaned);
  const stem = (ext ? cleaned.slice(0, -(ext.length + 1)) : cleaned).slice(0, 80).replace(/[.-]+$/, '') || 'file';
  return ext ? `${stem}.${ext}` : stem;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** The file content must look like what its extension claims. */
function contentMatchesExtension(ext: string, bytes: Uint8Array): boolean {
  switch (ext) {
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'gif':
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    case 'webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case 'pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'svg':
      return /<svg[\s>]/i.test(Buffer.from(bytes.subarray(0, 4096)).toString('utf8'));
    default:
      return false;
  }
}

/**
 * Validates one attachment (extension, MIME type, size, content signature).
 * Returns the sanitized name and canonical content type, or throws AttachmentValidationError.
 */
export function validateAttachment(file: { name: string; type: string; size: number; bytes?: Uint8Array }): {
  name: string;
  contentType: string;
} {
  const name = sanitizeFilename(file.name);
  const ext = extensionOf(name);
  const allowedMimes = ALLOWED_TYPES[ext];
  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  if (!allowedMimes || !allowedMimes.includes(mime)) {
    throw new AttachmentValidationError(`"${name}" is not an allowed file type. Attach ${ALLOWED_ATTACHMENT_LABEL} files.`);
  }
  if (file.size <= 0) {
    throw new AttachmentValidationError(`"${name}" is empty.`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError(`"${name}" is larger than 10 MB.`);
  }
  if (file.bytes && !contentMatchesExtension(ext, file.bytes)) {
    throw new AttachmentValidationError(`"${name}" does not look like a valid .${ext} file.`);
  }
  return { name, contentType: allowedMimes[0] };
}

// ---- In-memory fallback (tests / local mock mode) ----
const mockFiles = new Map<string, { bytes: Uint8Array; contentType: string }>();

export function getMockStoredFiles(): Map<string, { bytes: Uint8Array; contentType: string }> {
  return mockFiles;
}

export function resetMockStoredFiles(): void {
  mockFiles.clear();
}

// ---- Supabase Storage ----
let bucketReady: Promise<void> | null = null;

async function ensureBucket(client: NonNullable<ReturnType<typeof getSupabaseServiceClient>>): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await client.storage.getBucket(WEBSITE_REQUEST_BUCKET);
      if (data) return;
      const { error } = await client.storage.createBucket(WEBSITE_REQUEST_BUCKET, {
        public: false,
        fileSizeLimit: MAX_ATTACHMENT_BYTES,
        allowedMimeTypes: ALLOWED_ATTACHMENT_MIME_TYPES,
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

/**
 * Stores one already-validated attachment for a tenant and returns where it lives plus a
 * signed URL valid for 7 days.
 */
export async function uploadWebsiteRequestFile(
  tenantId: string,
  file: { name: string; contentType: string; bytes: Uint8Array }
): Promise<StoredAttachment> {
  const name = sanitizeFilename(file.name);
  const path = `${tenantId}/${randomUUID()}-${name}`;
  const base = { name, path, size: file.bytes.byteLength, contentType: file.contentType };

  const client = getSupabaseServiceClient();
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('File storage is not configured.');
    }
    mockFiles.set(path, { bytes: file.bytes, contentType: file.contentType });
    return { ...base, url: `mock://${WEBSITE_REQUEST_BUCKET}/${path}` };
  }

  await ensureBucket(client);
  const bucket = client.storage.from(WEBSITE_REQUEST_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file.bytes, {
    contentType: file.contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data, error: signError } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    await bucket.remove([path]).catch(() => undefined);
    throw new Error(`Could not create a download link: ${signError?.message || 'unknown error'}`);
  }
  return { ...base, url: data.signedUrl };
}

/** Best-effort cleanup of files uploaded for a request that could not be completed. */
export async function removeWebsiteRequestFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const client = getSupabaseServiceClient();
  if (!client) {
    paths.forEach((p) => mockFiles.delete(p));
    return;
  }
  try {
    await client.storage.from(WEBSITE_REQUEST_BUCKET).remove(paths);
  } catch {
    // Orphaned files in a private bucket are harmless; nothing else to do.
  }
}
