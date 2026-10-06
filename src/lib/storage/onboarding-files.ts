/**
 * Files a client uploads with the onboarding form.
 *
 * They live in the PRIVATE Supabase Storage bucket "onboarding-files" under
 * `<tenantId>/<random folder>/<sanitized filename>`. Only the service-role client touches the
 * bucket; people download a file through an authenticated route that hands out a short-lived
 * signed URL.
 *
 * When Supabase is not configured (tests / local mock mode) files are kept in memory.
 * In production a missing Supabase configuration is an error.
 */
import { randomUUID } from 'node:crypto';
import { getSupabaseServiceClient } from '../db/supabase-client';
import { sanitizeFilename } from './website-requests';
import {
  ALLOWED_UPLOAD_LABEL,
  MAX_TOTAL_UPLOAD_BYTES,
  extensionOf,
  type OnboardingFileRef,
} from '../onboarding/form-definition';

export const ONBOARDING_FILES_BUCKET = 'onboarding-files';
/** Long enough to start a download, short enough that a copied link is soon useless. */
export const ONBOARDING_FILE_URL_TTL_SECONDS = 5 * 60;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Browsers report no type (or a generic one) for office and CSV files on computers without Office.
const UNKNOWN = ['', 'application/octet-stream'];

/** Allowed extension -> accepted MIME types (the first one is canonical and used for storage). */
const ALLOWED_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  webp: ['image/webp'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', ...UNKNOWN],
  xlsx: [XLSX, 'application/zip', ...UNKNOWN],
  docx: [DOCX, 'application/zip', ...UNKNOWN],
  txt: ['text/plain'],
};

const BUCKET_MIME_TYPES = Array.from(new Set(Object.values(ALLOWED_TYPES).map((types) => types[0])));

export class OnboardingFileError extends Error {}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** Plain text never holds a zero byte; every binary format we must refuse does within its first bytes. */
function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8192);
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) return false;
  }
  return true;
}

/** The file content must look like what its extension claims. */
function contentMatchesExtension(ext: string, bytes: Uint8Array): boolean {
  switch (ext) {
    case 'pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case 'xlsx':
    case 'docx':
      // Both are ZIP containers.
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case 'csv':
    case 'txt':
      return looksLikeText(bytes);
    default:
      return false;
  }
}

/**
 * Validates one uploaded file (extension, MIME type, size, content signature).
 * Returns the sanitized name and canonical content type, or throws OnboardingFileError.
 */
export function validateOnboardingFile(file: { name: string; type: string; size: number; bytes?: Uint8Array }): {
  name: string;
  contentType: string;
} {
  const name = sanitizeFilename(file.name);
  const ext = extensionOf(name);
  const allowedMimes = ALLOWED_TYPES[ext];
  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  if (!allowedMimes || !allowedMimes.includes(mime)) {
    throw new OnboardingFileError(`"${name}" is not an allowed file type. Send ${ALLOWED_UPLOAD_LABEL} files.`);
  }
  if (file.size <= 0) {
    throw new OnboardingFileError(`"${name}" is empty.`);
  }
  if (file.size > MAX_TOTAL_UPLOAD_BYTES) {
    throw new OnboardingFileError(`"${name}" is larger than 4 MB.`);
  }
  if (file.bytes && !contentMatchesExtension(ext, file.bytes)) {
    throw new OnboardingFileError(`"${name}" does not look like a valid .${ext} file.`);
  }
  return { name, contentType: allowedMimes[0] };
}

// ---- In-memory fallback (tests / local mock mode) ----
const mockFiles = new Map<string, { bytes: Uint8Array; contentType: string }>();

export function getMockOnboardingFiles(): Map<string, { bytes: Uint8Array; contentType: string }> {
  return mockFiles;
}

export function resetMockOnboardingFiles(): void {
  mockFiles.clear();
}

// ---- Supabase Storage ----
let bucketReady: Promise<void> | null = null;

async function ensureBucket(client: NonNullable<ReturnType<typeof getSupabaseServiceClient>>): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await client.storage.getBucket(ONBOARDING_FILES_BUCKET);
      if (data) return;
      const { error } = await client.storage.createBucket(ONBOARDING_FILES_BUCKET, {
        public: false,
        fileSizeLimit: MAX_TOTAL_UPLOAD_BYTES,
        allowedMimeTypes: BUCKET_MIME_TYPES,
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

/** A new folder for the files of one submission. */
export function newOnboardingFileFolder(): string {
  return randomUUID();
}

/** Stores one already-validated file for a tenant and returns where it lives. */
export async function uploadOnboardingFile(
  tenantId: string,
  folder: string,
  file: { name: string; contentType: string; bytes: Uint8Array }
): Promise<OnboardingFileRef> {
  const name = sanitizeFilename(file.name);
  const path = `${tenantId}/${folder}/${name}`;
  const stored: OnboardingFileRef = { name, path, size: file.bytes.byteLength };

  const client = getSupabaseServiceClient();
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('File storage is not configured.');
    }
    mockFiles.set(path, { bytes: file.bytes, contentType: file.contentType });
    return stored;
  }

  await ensureBucket(client);
  const { error } = await client.storage.from(ONBOARDING_FILES_BUCKET).upload(path, file.bytes, {
    contentType: file.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return stored;
}

/** Best-effort cleanup of files uploaded for a submission that could not be saved. */
export async function removeOnboardingFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const client = getSupabaseServiceClient();
  if (!client) {
    paths.forEach((p) => mockFiles.delete(p));
    return;
  }
  try {
    await client.storage.from(ONBOARDING_FILES_BUCKET).remove(paths);
  } catch {
    // Orphaned files in a private bucket are harmless; nothing else to do.
  }
}

export type OnboardingFileDownload =
  | { kind: 'redirect'; url: string }
  | { kind: 'bytes'; bytes: Uint8Array; contentType: string }
  | null;

/**
 * How to hand a stored file to someone who is allowed to have it: a signed URL that works for a
 * few minutes, or (mock mode only) the bytes themselves. Null when the file does not exist.
 * The caller must already have checked that the path belongs to the tenant.
 */
export async function getOnboardingFileDownload(path: string): Promise<OnboardingFileDownload> {
  const client = getSupabaseServiceClient();
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('File storage is not configured.');
    }
    const file = mockFiles.get(path);
    return file ? { kind: 'bytes', bytes: file.bytes, contentType: file.contentType } : null;
  }

  const { data, error } = await client.storage
    .from(ONBOARDING_FILES_BUCKET)
    .createSignedUrl(path, ONBOARDING_FILE_URL_TTL_SECONDS, { download: path.split('/').pop() || true });
  if (error || !data?.signedUrl) {
    if (/not found|does not exist/i.test(error?.message || '')) return null;
    throw new Error(`Could not create a download link: ${error?.message || 'unknown error'}`);
  }
  return { kind: 'redirect', url: data.signedUrl };
}
