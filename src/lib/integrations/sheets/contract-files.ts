/**
 * Contract files uploaded by an admin.
 *
 * The file is kept in the client's own Google Drive folder (the Apps Script's `upload_file`),
 * never in public storage. Only named people can open it: staff through the folder, and the
 * client owner as viewer once the Drive access sync has run.
 *
 * A contract that was uploaded remembers its Drive file in the existing `storage_path` column
 * as `gdrive:<fileId>`, so no database change is needed. Contracts added by pasting a link
 * have no `storage_path`.
 */
import type { Contract } from '../../db/schema';
import { sanitizeFilename } from '../../storage/website-requests';
import { callScript, isSheetsScriptConfigured, loadSavedFiles, text } from './provision';

// Vercel rejects request bodies over about 4.5 MB, so one contract file must stay under 4 MB.
export const MAX_CONTRACT_FILE_BYTES = 4 * 1024 * 1024;
export const CONTRACT_FILE_LABEL = 'PDF, DOCX, PNG or JPG';
export const CONTRACT_FILE_ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Allowed extension -> accepted MIME types (the first one is used when storing the file). */
const ALLOWED_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  // Computers without Word often send a .docx with no type at all; the content check below still applies.
  docx: [DOCX_MIME, 'application/octet-stream', ''],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
};

export class ContractFileError extends Error {
  statusCode = 400;
}

const DRIVE_PREFIX = 'gdrive:';

/** The Drive file id of an uploaded contract, or undefined for a contract added as a link. */
export function contractDriveFileId(contract: Pick<Contract, 'storage_path'> | null | undefined): string | undefined {
  const path = text(contract?.storage_path);
  return path?.startsWith(DRIVE_PREFIX) ? text(path.slice(DRIVE_PREFIX.length)) : undefined;
}

/** What to save in `storage_path` for a contract kept in Google Drive. */
export const driveStoragePath = (fileId: string): string => `${DRIVE_PREFIX}${fileId}`;

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
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
    case 'docx':
      // A .docx is a zip archive that holds a "word/" folder.
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && Buffer.from(bytes).includes('word/');
    default:
      return false;
  }
}

/**
 * Checks one contract file (extension, MIME type, size, content signature).
 * Returns the cleaned-up name and the content type to store, or throws ContractFileError.
 */
export function validateContractFile(file: { name: string; type: string; size: number; bytes: Uint8Array }): {
  name: string;
  contentType: string;
} {
  const name = sanitizeFilename(file.name);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const allowedMimes = ALLOWED_TYPES[ext];
  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  if (!allowedMimes || !allowedMimes.includes(mime)) {
    throw new ContractFileError(`"${name}" is not an allowed file type. Upload a ${CONTRACT_FILE_LABEL} file.`);
  }
  if (file.size <= 0 || file.bytes.length === 0) {
    throw new ContractFileError(`"${name}" is empty.`);
  }
  if (file.size > MAX_CONTRACT_FILE_BYTES || file.bytes.length > MAX_CONTRACT_FILE_BYTES) {
    throw new ContractFileError(`"${name}" is larger than 4 MB. Upload a smaller file, or paste a link instead.`);
  }
  if (!contentMatchesExtension(ext, file.bytes)) {
    throw new ContractFileError(`"${name}" does not look like a valid .${ext} file.`);
  }
  return { name, contentType: allowedMimes[0] };
}

export type ContractUploadResult =
  | { ok: true; fileId: string; url: string }
  | { ok: false; error: string; status: number };

export const NO_FOLDER_ERROR =
  'This client has no Google Drive folder yet. Press "Set up Google files" under Company details first, then upload the contract again.';
const OLD_SCRIPT_UPLOAD_ERROR = 'The Google script needs updating before files can be uploaded. Paste a link instead for now.';

/**
 * Puts an already validated contract file in the client's Drive folder. Never throws.
 * The request holds no `clientName`, so a script that has not been updated yet cannot mistake
 * it for a new client; an answer without a file id is treated as coming from an older script.
 */
export async function uploadContractFile(params: {
  tenantId: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<ContractUploadResult> {
  if (!isSheetsScriptConfigured()) {
    return { ok: false, status: 400, error: 'Google Drive is not connected, so files cannot be uploaded. Paste a link instead.' };
  }
  try {
    const folderId = text((await loadSavedFiles(params.tenantId)).folder_id);
    if (!folderId) return { ok: false, status: 400, error: NO_FOLDER_ERROR };

    const { data } = await callScript<{ ok?: boolean; error?: string; fileId?: string; url?: string; [key: string]: unknown }>(
      {
        action: 'upload_file',
        folderId,
        name: params.name,
        mimeType: params.contentType,
        base64: Buffer.from(params.bytes).toString('base64'),
      },
      60_000
    );

    const fileId = text(data?.fileId);
    const url = text(data?.url);
    if (data?.ok === true && fileId && url && /^https:\/\//.test(url)) return { ok: true, fileId, url };

    const scriptError = text(data?.error);
    const oldScript = !data || data.ok === true || 'spreadsheetId' in data || /unknown action|clientname is required/i.test(scriptError || '');
    if (data && !oldScript && scriptError) {
      console.error(`[contracts] Upload to Google Drive failed: ${scriptError}`);
      return { ok: false, status: 502, error: `The file could not be saved in Google Drive: ${scriptError}` };
    }
    return { ok: false, status: 502, error: data ? OLD_SCRIPT_UPLOAD_ERROR : 'Google Drive did not answer. Nothing was uploaded. Please try again.' };
  } catch (err: any) {
    console.error('[contracts] Upload to Google Drive failed:', err?.message);
    return { ok: false, status: 502, error: 'Could not reach Google Drive. Nothing was uploaded. Please try again.' };
  }
}

/** Moves an uploaded contract file to the bin in Google Drive. Never throws. */
export async function trashContractFile(fileId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSheetsScriptConfigured()) return { ok: false, error: 'Google Drive is not connected.' };
  try {
    const { data } = await callScript<{ ok?: boolean; error?: string; [key: string]: unknown }>({ action: 'trash_file', fileId }, 30_000);
    if (data?.ok === true && !('spreadsheetId' in data)) return { ok: true };
    const scriptError = text(data?.error);
    if (!data || 'spreadsheetId' in data || /unknown action|clientname is required/i.test(scriptError || '')) {
      return { ok: false, error: 'The Google script needs updating.' };
    }
    return { ok: false, error: scriptError || 'Google Drive did not answer as expected.' };
  } catch (err: any) {
    console.error('[contracts] Could not bin a contract file:', err?.message);
    return { ok: false, error: 'Could not reach Google Drive.' };
  }
}
