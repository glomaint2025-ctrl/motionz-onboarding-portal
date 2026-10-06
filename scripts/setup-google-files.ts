// Brings existing clients to the per-client Google Drive structure: one Drive folder per client,
// holding their tracking sheet and their own Money Leak Calculator copy. It does for every client
// what the "Set up Google files" button on the admin client page does for one.
// Uses the database and Google script settings in .env.local. Archived clients are skipped.
// Safe to run again: clients that already have everything are skipped, and the setup itself reuses
// the files a client already has (an existing tracking sheet is moved into the folder, not copied).
// Usage: npx tsx scripts/setup-google-files.ts [--dry-run] [--only=<tenant id>] [--sync-access]
//   --dry-run      only lists each client and what is missing; changes nothing
//   --only=ID      work on that one client
//   --sync-access  afterwards, make Google Drive access match the portal's people: admins on the
//                  parent folder, then every client (CSM, owner, team). Needs the updated Google script.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.local before anything from src/ is imported: the app reads its settings at import time.
// Values already set in the shell win, so a single run can be pointed somewhere else.
let envText = '';
try {
  envText = readFileSync('.env.local', 'utf8');
} catch {
  // No .env.local: rely on the shell's environment; the checks below explain what is missing.
}
for (const line of envText.split(/\r?\n/)) {
  if (!/^[A-Z_][A-Z0-9_]*=/.test(line)) continue;
  const key = line.slice(0, line.indexOf('='));
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (process.env[key] === undefined) process.env[key] = value;
}

const dryRun = process.argv.includes('--dry-run');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length) || null;
const syncAccess = process.argv.includes('--sync-access');

interface TenantRow {
  id: string;
  name: string;
  primary_email: string | null;
  status: string | null;
  deleted_at: string | null;
}

interface SavedFiles {
  folder_url?: string;
  sheet_url?: string;
  calculator_url?: string;
}

const has = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** The same three things the admin client page lists under "Still missing". */
function missingFiles(saved: SavedFiles): string[] {
  return [
    !has(saved.folder_url) && 'folder',
    !has(saved.sheet_url) && 'tracking sheet',
    !has(saved.calculator_url) && 'calculator',
  ].filter((name): name is string => Boolean(name));
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Cannot run: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local).');
    process.exitCode = 1;
    return;
  }
  if (!process.env.GOOGLE_SHEETS_SCRIPT_URL || !process.env.GOOGLE_SHEETS_SCRIPT_SECRET) {
    console.error(
      'Cannot run: GOOGLE_SHEETS_SCRIPT_URL and GOOGLE_SHEETS_SCRIPT_SECRET must both be set (in .env.local).\n' +
        'They point the portal at the Google Apps Script that creates the Drive folder, tracking sheet and calculator.\n' +
        'Nothing was read or changed.'
    );
    process.exitCode = 1;
    return;
  }

  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const tenantsRes = await db.from('tenants').select('id, name, primary_email, status, deleted_at').order('created_at');
  if (tenantsRes.error) {
    console.error(`Could not read the clients: ${tenantsRes.error.message}`);
    process.exitCode = 1;
    return;
  }
  const allTenants = (tenantsRes.data || []) as TenantRow[];
  const tenants = allTenants.filter((t) => !t.deleted_at && t.status !== 'cancelled' && (!only || t.id === only));

  if (only && tenants.length === 0) {
    const match = allTenants.find((t) => t.id === only);
    console.error(match ? `"${match.name}" is archived, so it is skipped.` : `No client has the id ${only}.`);
    process.exitCode = 1;
    return;
  }

  const configsRes = await db.from('integration_configs').select('tenant_id, config_data').eq('integration_type', 'google_sheets');
  if (configsRes.error) {
    console.error(`Could not read the saved Google files: ${configsRes.error.message}`);
    process.exitCode = 1;
    return;
  }
  const savedByTenant = new Map<string, SavedFiles>();
  for (const row of configsRes.data || []) savedByTenant.set(row.tenant_id, (row.config_data || {}) as SavedFiles);

  console.log(`${dryRun ? 'Dry run: nothing will be changed. ' : ''}${tenants.length} client${tenants.length === 1 ? '' : 's'} to check.\n`);

  // Imported only now, after the environment is loaded.
  const { provisionClientSheet } = dryRun
    ? { provisionClientSheet: null }
    : await import('../src/lib/integrations/sheets/provision');

  const summary = { complete: 0, wouldSetUp: 0, setUp: 0, withWarnings: 0, failed: 0 };
  const failures: string[] = [];

  for (const tenant of tenants) {
    const missing = missingFiles(savedByTenant.get(tenant.id) || {});
    if (missing.length === 0) {
      summary.complete++;
      console.log(`${tenant.name}: nothing missing.`);
      continue;
    }
    console.log(`${tenant.name}: missing ${missing.join(', ')}.`);

    if (!provisionClientSheet) {
      summary.wouldSetUp++;
      continue;
    }

    try {
      const result = await provisionClientSheet({
        tenantId: tenant.id,
        clientName: tenant.name,
        clientEmail: tenant.primary_email || undefined,
      });

      if (result.folderUrl) console.log(`  Drive folder:   ${result.folderUrl}`);
      if (result.url) console.log(`  Tracking sheet: ${result.url}`);
      if (result.calculatorUrl) console.log(`  Calculator:     ${result.calculatorUrl}`);
      for (const warning of result.warnings || []) console.log(`  Warning: ${warning}`);

      const stillMissing = missingFiles({ folder_url: result.folderUrl, sheet_url: result.url, calculator_url: result.calculatorUrl });
      if (!result.ok) {
        summary.failed++;
        failures.push(`${tenant.name}: ${result.error || 'unknown error'}`);
        console.log(`  Failed: ${result.error || 'unknown error'}`);
      } else if (stillMissing.length > 0 || (result.warnings || []).length > 0) {
        summary.withWarnings++;
        if (stillMissing.length > 0) console.log(`  Still missing: ${stillMissing.join(', ')}.`);
      } else {
        summary.setUp++;
        console.log('  Done.');
      }
    } catch (err: any) {
      // provisionClientSheet does not throw, but one client must never stop the rest.
      summary.failed++;
      failures.push(`${tenant.name}: ${err?.message || err}`);
      console.log(`  Failed: ${err?.message || err}`);
    }
  }

  console.log('\nSummary');
  console.log(`  Already complete:      ${summary.complete}`);
  if (dryRun) {
    console.log(`  Would be set up:       ${summary.wouldSetUp}`);
    console.log('Dry run only. Run again without --dry-run to set them up.');
    if (syncAccess) console.log('Drive access was not checked: --sync-access does nothing in a dry run.');
    return;
  }
  console.log(`  Set up:                ${summary.setUp}`);
  console.log(`  Set up with warnings:  ${summary.withWarnings}`);
  console.log(`  Failed:                ${summary.failed}`);
  for (const failure of failures) console.log(`    - ${failure}`);
  if (summary.failed > 0) {
    console.log('Run the script again to retry the failed clients; finished clients are skipped.');
    process.exitCode = 1;
  }

  if (syncAccess) await syncAllAccess(allTenants.filter((t) => !only || t.id === only));
}

/**
 * --sync-access: gives and removes Google Drive access so it matches the portal's people.
 * First the parent folder (admins), then every client, archived ones included (their people
 * lose access). Clients without a Drive folder are skipped. Safe to run again.
 */
async function syncAllAccess(tenants: TenantRow[]): Promise<void> {
  const { syncAdminDriveAccess, syncClientDriveAccess, describeDriveSync, OLD_SCRIPT_WARNING } = await import(
    '../src/lib/integrations/sheets/access'
  );
  const options = { actorEmail: 'setup-google-files script', actorRole: 'system', budgetMs: 120_000 };

  console.log('\nGoogle Drive access');
  const parent = await syncAdminDriveAccess(options);
  console.log(`  Parent folder (admins): ${describeDriveSync(parent)}`);
  if (parent.warnings.includes(OLD_SCRIPT_WARNING)) {
    console.log('  Update the Google script first (docs/07-integrations/google-sheets.md), then run this again.');
    process.exitCode = 1;
    return;
  }

  let problems = parent.warnings.length > 0 ? 1 : 0;
  for (const tenant of tenants) {
    const result = await syncClientDriveAccess(tenant.id, options);
    console.log(`  ${tenant.name}: ${result.skipped ? 'no Drive folder yet, skipped.' : describeDriveSync(result)}`);
    if (result.warnings.length > 0) problems++;
  }
  if (problems > 0) {
    console.log(`  ${problems} with something to check (see above). Run again after fixing; it only changes what differs.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Stopped: ${err?.message || err}`);
  process.exitCode = 1;
});
