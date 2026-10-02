import { integrationConfigRepository } from '../../db/repositories';

export interface SheetProvisionResult {
  ok: boolean;
  url?: string;
  spreadsheetId?: string;
  error?: string;
}

/**
 * Creates the client's tracking sheet by calling the Motionz Google Apps Script web app
 * (scripts/google-apps-script/create-client-sheet.gs), which copies the template sheet,
 * shares it with the client as an editor, and returns the link. The link is stored as the
 * tenant's google_sheets integration so the portal can show "Open my tracking sheet".
 *
 * Never throws: a failed sheet must not block client creation. Admins can retry later.
 */
export async function provisionClientSheet(params: {
  tenantId: string;
  clientName: string;
  clientEmail?: string;
}): Promise<SheetProvisionResult> {
  const url = process.env.GOOGLE_SHEETS_SCRIPT_URL;
  const secret = process.env.GOOGLE_SHEETS_SCRIPT_SECRET;
  if (!url || !secret) {
    return { ok: false, error: 'Google Sheets script is not configured.' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, clientName: params.clientName, clientEmail: params.clientEmail || '' }),
      redirect: 'follow',
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; spreadsheetId?: string; url?: string; error?: string }
      | null;

    if (!res.ok || !data?.ok || !data.spreadsheetId || !data.url) {
      const error = data?.error || `Sheet script responded with ${res.status}.`;
      console.error(`[sheets] Could not create sheet for "${params.clientName}": ${error}`);
      return { ok: false, error };
    }

    try {
      await integrationConfigRepository.save(params.tenantId, 'google_sheets', {
        spreadsheet_id: data.spreadsheetId,
        sheet_url: data.url,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`[sheets] Sheet created but its link could not be saved for "${params.clientName}":`, err?.message);
      return { ok: false, url: data.url, spreadsheetId: data.spreadsheetId, error: 'Sheet created but its link could not be saved.' };
    }

    return { ok: true, url: data.url, spreadsheetId: data.spreadsheetId };
  } catch (err: any) {
    console.error(`[sheets] Failed to reach sheet script for "${params.clientName}":`, err?.message);
    return { ok: false, error: 'Could not reach the Google Sheets script.' };
  }
}
