import { integrationConfigRepository } from '../../db/repositories';

export interface SheetProvisionResult {
  /** True when the tracking sheet exists and its link is saved. */
  ok: boolean;
  /** Tracking sheet link and id. */
  url?: string;
  spreadsheetId?: string;
  /** The client's own Drive folder. */
  folderId?: string;
  folderUrl?: string;
  /** The client's own copy of the Money Leak Calculator. */
  calculatorId?: string;
  calculatorUrl?: string;
  /** True when the client has their own calculator copy. */
  calculatorOk?: boolean;
  /** Things that went wrong without stopping the setup (sharing, a missing calculator...). */
  warnings?: string[];
  error?: string;
}

export interface RenameClientFilesResult {
  ok: boolean;
  /** True when there was nothing to rename (no saved folder, or the script is not configured). */
  skipped?: boolean;
  error?: string;
}

/** Fields of the tenant's google_sheets integration config that this module reads and writes. */
export interface SavedGoogleFiles {
  folder_id?: string;
  folder_url?: string;
  spreadsheet_id?: string;
  sheet_url?: string;
  calculator_id?: string;
  calculator_url?: string;
  [key: string]: any;
}

interface ScriptResponse {
  ok?: boolean;
  error?: string;
  folderId?: string | null;
  folderUrl?: string | null;
  spreadsheetId?: string | null;
  url?: string | null;
  calculatorId?: string | null;
  calculatorUrl?: string | null;
  warnings?: unknown;
}

export const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** The id inside a Google Sheets link, for configs that only have the link saved. */
export function sheetIdFromUrl(url: unknown): string | undefined {
  return text(url)?.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})/)?.[1];
}

export async function loadSavedFiles(tenantId: string): Promise<SavedGoogleFiles> {
  const configs = await integrationConfigRepository.listByTenant(tenantId);
  const saved = configs.find((c) => c.integration_type === 'google_sheets');
  return (saved?.config_data as SavedGoogleFiles) || {};
}

/** True when the portal knows where the Apps Script web app is and how to sign its requests. */
export const isSheetsScriptConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_SHEETS_SCRIPT_URL && process.env.GOOGLE_SHEETS_SCRIPT_SECRET);

/** One signed POST to the Apps Script web app. Throws when it cannot be reached or takes too long. */
export async function callScript<T = ScriptResponse>(payload: Record<string, unknown>, timeoutMs: number): Promise<{ status: number; data: T | null }> {
  const res = await fetch(process.env.GOOGLE_SHEETS_SCRIPT_URL as string, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: process.env.GOOGLE_SHEETS_SCRIPT_SECRET, ...payload }),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, data };
}

/**
 * Sets up the client's Google files by calling the Motionz Google Apps Script web app
 * (scripts/google-apps-script/create-client-sheet.gs): one Drive folder per client, holding
 * the client's tracking sheet and their own copy of the Money Leak Calculator, both shared
 * with the client as editor. The links are stored in the tenant's google_sheets integration
 * so the portal can show them on Results Tracking.
 *
 * Safe to run again: the ids already saved are sent back, so the script reuses the same
 * folder and files. For a client created before folders existed, the existing tracking sheet
 * is moved into the new folder (not copied) and a calculator copy is added.
 *
 * Never throws: a failed setup must not block client creation. Admins can retry later.
 */
export async function provisionClientSheet(params: {
  tenantId: string;
  clientName: string;
  clientEmail?: string;
}): Promise<SheetProvisionResult> {
  if (!process.env.GOOGLE_SHEETS_SCRIPT_URL || !process.env.GOOGLE_SHEETS_SCRIPT_SECRET) {
    return { ok: false, error: 'Google Sheets script is not configured.' };
  }

  try {
    let saved: SavedGoogleFiles = {};
    try {
      saved = await loadSavedFiles(params.tenantId);
    } catch (err: any) {
      // Without the saved ids the script could create a second set of files, so stop here.
      console.error(`[sheets] Could not read the saved Google files for "${params.clientName}":`, err?.message);
      return { ok: false, error: 'Could not read the saved Google files. Please try again.' };
    }

    const { status, data } = await callScript(
      {
        action: 'provision',
        clientName: params.clientName,
        clientEmail: params.clientEmail || '',
        folderId: text(saved.folder_id) || '',
        trackingSheetId: text(saved.spreadsheet_id) || sheetIdFromUrl(saved.sheet_url) || '',
        calculatorSheetId: text(saved.calculator_id) || sheetIdFromUrl(saved.calculator_url) || '',
      },
      120_000
    );

    if (status < 200 || status >= 300 || !data?.ok || !data.spreadsheetId || !data.url) {
      const error = data?.error || `Sheet script responded with ${status}.`;
      console.error(`[sheets] Could not set up Google files for "${params.clientName}": ${error}`);
      return { ok: false, error };
    }

    const warnings = Array.isArray(data.warnings) ? data.warnings.filter((w): w is string => typeof w === 'string' && Boolean(w)) : [];

    // Only fields the script actually returned are written, so a script that has not been
    // updated yet (no folder or calculator in its answer) never wipes what is already saved.
    const fresh: SavedGoogleFiles = {
      spreadsheet_id: data.spreadsheetId,
      sheet_url: data.url,
      ...(text(data.folderId) ? { folder_id: text(data.folderId) } : {}),
      ...(text(data.folderUrl) ? { folder_url: text(data.folderUrl) } : {}),
      ...(text(data.calculatorId) ? { calculator_id: text(data.calculatorId) } : {}),
      ...(text(data.calculatorUrl) ? { calculator_url: text(data.calculatorUrl) } : {}),
    };
    const config: SavedGoogleFiles = {
      ...saved,
      ...fresh,
      created_at: saved.created_at || new Date().toISOString(),
    };

    const calculatorOk = Boolean(config.calculator_url);
    if (!calculatorOk && warnings.length === 0) {
      warnings.push('The calculator was not created. The Google script may need to be updated.');
    }

    const result: SheetProvisionResult = {
      ok: true,
      url: config.sheet_url,
      spreadsheetId: config.spreadsheet_id,
      folderId: config.folder_id,
      folderUrl: config.folder_url,
      calculatorId: config.calculator_id,
      calculatorUrl: config.calculator_url,
      calculatorOk,
      warnings,
    };

    try {
      await integrationConfigRepository.save(params.tenantId, 'google_sheets', config);
    } catch (err: any) {
      console.error(`[sheets] Google files created but their links could not be saved for "${params.clientName}":`, err?.message);
      return { ...result, ok: false, error: 'Sheet created but its link could not be saved.' };
    }

    if (warnings.length) console.warn(`[sheets] Google files for "${params.clientName}" set up with warnings: ${warnings.join(' | ')}`);
    return result;
  } catch (err: any) {
    console.error(`[sheets] Failed to reach sheet script for "${params.clientName}":`, err?.message);
    return { ok: false, error: 'Could not reach the Google Sheets script.' };
  }
}

/**
 * Renames the client's Drive folder and both files to match a new client name.
 * File ids and links do not change, so nothing needs saving afterwards.
 *
 * Does nothing (ok: true, skipped: true) when the script is not configured or the client has
 * no Drive folder saved yet. The folder id is the proof that the per-client-folder script is
 * the one deployed; an older script would not understand "rename". Never throws.
 */
export async function renameClientFiles(params: { tenantId: string; clientName: string }): Promise<RenameClientFilesResult> {
  if (!process.env.GOOGLE_SHEETS_SCRIPT_URL || !process.env.GOOGLE_SHEETS_SCRIPT_SECRET) {
    return { ok: true, skipped: true };
  }

  try {
    const saved = await loadSavedFiles(params.tenantId);
    const folderId = text(saved.folder_id);
    if (!folderId) return { ok: true, skipped: true };

    const { status, data } = await callScript(
      {
        action: 'rename',
        clientName: params.clientName,
        folderId,
        trackingSheetId: text(saved.spreadsheet_id) || sheetIdFromUrl(saved.sheet_url) || '',
        calculatorSheetId: text(saved.calculator_id) || sheetIdFromUrl(saved.calculator_url) || '',
      },
      30_000
    );

    if (status < 200 || status >= 300 || !data?.ok) {
      const error = data?.error || `Sheet script responded with ${status}.`;
      console.error(`[sheets] Could not rename Google files for "${params.clientName}": ${error}`);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err: any) {
    console.error(`[sheets] Failed to rename Google files for "${params.clientName}":`, err?.message);
    return { ok: false, error: 'Could not reach the Google Sheets script.' };
  }
}
