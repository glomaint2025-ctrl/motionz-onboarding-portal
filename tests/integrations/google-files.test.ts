import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}
// Tests must never send real email or create real Google files. The script URL is set to a
// made-up address only while global fetch is replaced by the fake below.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GOOGLE_SHEETS_SCRIPT_SECRET']) delete process.env[key];

async function run() {
  console.log('Running Google Files Tests (per-client Drive folder, tracking sheet, calculator copy, rename)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { integrationConfigRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { provisionClientSheet, renameClientFiles } = await import('../../src/lib/integrations/sheets/provision');
  const clientRoute = await import('../../src/app/api/admin/clients/[id]/route');
  const { GET: getPortalData } = await import('../../src/app/api/portal/[clientId]/data/route');

  resetStore();
  const store = getStore();
  const demoTenant = store.tenants.find((t) => t.slug === 'abc-roofing')!;
  const demo = demoTenant.id;
  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');

  function req(path: string, method = 'GET', body?: unknown) {
    const headers = new Headers({ 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` });
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const ctx = (id: string) => ({ params: { id } });
  const savedConfig = async (tenantId: string): Promise<Record<string, any>> =>
    (await integrationConfigRepository.listByTenant(tenantId)).find((c) => c.integration_type === 'google_sheets')?.config_data || {};

  // ---------------------------------------------------------------- fake Apps Script
  const SCRIPT_URL = 'https://script.invalid/macros/s/test/exec';
  const realFetch = globalThis.fetch;
  const calls: Array<Record<string, any>> = [];
  let respond: (body: Record<string, any>) => { status?: number; json?: unknown } | Promise<never> = () => ({ json: { ok: false } });

  globalThis.fetch = (async (input: any, init?: any) => {
    assert.strictEqual(String(input), SCRIPT_URL, 'only the script URL may be called');
    const body = JSON.parse(String(init?.body || '{}'));
    calls.push(body);
    const answer = await respond(body);
    return new Response(JSON.stringify(answer.json ?? null), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const fullAnswer = (suffix = '') => ({
    ok: true,
    folderId: `folder${suffix}_0123456789`,
    folderUrl: `https://drive.google.com/drive/folders/folder${suffix}_0123456789`,
    spreadsheetId: `tracking${suffix}_0123456789`,
    url: `https://docs.google.com/spreadsheets/d/tracking${suffix}_0123456789/edit`,
    calculatorId: `calculator${suffix}_0123456789`,
    calculatorUrl: `https://docs.google.com/spreadsheets/d/calculator${suffix}_0123456789/edit#gid=2143281968`,
    warnings: [],
  });

  try {
    // ---------------------------------------------------------------- 1. not configured: nothing is called
    let result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing', clientEmail: 'owner@abc.example' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error, 'an unconfigured script is reported, not thrown');
    let renamed = await renameClientFiles({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.deepStrictEqual(renamed, { ok: true, skipped: true }, 'rename is a quiet no-op without a script');
    assert.strictEqual(calls.length, 0);
    console.log(' PASS: without a configured script nothing is called and nothing throws.');

    process.env.GOOGLE_SHEETS_SCRIPT_URL = SCRIPT_URL;
    process.env.GOOGLE_SHEETS_SCRIPT_SECRET = 'test-secret';

    // ---------------------------------------------------------------- 2. an older client is migrated; saved fields are merged
    // The demo client already has a tracking sheet (spreadsheet_id + tab_name) but no folder or calculator.
    renamed = await renameClientFiles({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.deepStrictEqual(renamed, { ok: true, skipped: true }, 'no saved folder means there is nothing to rename');
    assert.strictEqual(calls.length, 0, 'the script is not called for a client without a saved folder');

    respond = (body) => ({ json: { ...fullAnswer(), spreadsheetId: body.trackingSheetId, url: `https://docs.google.com/spreadsheets/d/${body.trackingSheetId}/edit` } });
    result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing', clientEmail: 'owner@abc.example' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.calculatorOk, true);
    assert.deepStrictEqual(result.warnings, []);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].action, 'provision');
    assert.strictEqual(calls[0].secret, 'test-secret');
    assert.strictEqual(calls[0].clientName, 'ABC Roofing');
    assert.strictEqual(calls[0].clientEmail, 'owner@abc.example');
    assert.strictEqual(calls[0].trackingSheetId, 'sheet_demo_123', 'the existing sheet id is sent so the sheet is moved, not copied');
    assert.strictEqual(calls[0].folderId, '');
    assert.strictEqual(calls[0].calculatorSheetId, '');

    let config = await savedConfig(demo);
    assert.strictEqual(config.spreadsheet_id, 'sheet_demo_123', 'the tracking sheet keeps its id');
    assert.strictEqual(config.sheet_url, 'https://docs.google.com/spreadsheets/d/sheet_demo_123/edit');
    assert.strictEqual(config.folder_id, 'folder_0123456789');
    assert.strictEqual(config.folder_url, 'https://drive.google.com/drive/folders/folder_0123456789');
    assert.strictEqual(config.calculator_id, 'calculator_0123456789');
    assert.ok(String(config.calculator_url).endsWith('#gid=2143281968'), 'the calculator link opens the calculator tab');
    assert.strictEqual(config.tab_name, 'Campaign Leads', 'fields saved earlier are kept');
    assert.ok(config.created_at);
    assert.strictEqual(result.folderUrl, config.folder_url);
    assert.strictEqual(result.calculatorUrl, config.calculator_url);
    console.log(' PASS: an existing client gets a folder and calculator; new fields are merged into the saved config.');

    // ---------------------------------------------------------------- 3. running it again sends every saved id
    const createdAt = config.created_at;
    calls.length = 0;
    result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls[0].folderId, 'folder_0123456789');
    assert.strictEqual(calls[0].trackingSheetId, 'sheet_demo_123');
    assert.strictEqual(calls[0].calculatorSheetId, 'calculator_0123456789');
    assert.strictEqual((await savedConfig(demo)).created_at, createdAt, 'the original created date is kept');
    console.log(' PASS: a repeat run sends the saved folder, sheet and calculator ids (no duplicates).');

    // ---------------------------------------------------------------- 4. a missing calculator is a warning, not a failure
    const fresh = await createTenant({ name: 'Fresh Start Roofing', slug: 'fresh-start', primary_email: 'owner@freshstart.example' });
    calls.length = 0;
    respond = () => ({
      json: { ...fullAnswer('B'), calculatorId: null, calculatorUrl: null, warnings: ['The calculator was not created: CALCULATOR_TEMPLATE_ID is not set in the script properties.'] },
    });
    result = await provisionClientSheet({ tenantId: fresh.id, clientName: fresh.name, clientEmail: fresh.primary_email });
    assert.strictEqual(result.ok, true, 'the tracking sheet still counts as created');
    assert.strictEqual(result.calculatorOk, false);
    assert.strictEqual(result.warnings?.length, 1);
    config = await savedConfig(fresh.id);
    assert.strictEqual(config.spreadsheet_id, 'trackingB_0123456789');
    assert.strictEqual(config.folder_id, 'folderB_0123456789');
    assert.ok(!('calculator_id' in config) && !('calculator_url' in config), 'no empty calculator fields are saved');

    // A script that has not been updated yet answers with the tracking sheet only.
    const legacy = await createTenant({ name: 'Legacy Sheet Roofing', slug: 'legacy-sheet', primary_email: 'owner@legacysheet.example' });
    respond = () => ({ json: { ok: true, spreadsheetId: 'legacy_0123456789', url: 'https://docs.google.com/spreadsheets/d/legacy_0123456789/edit' } });
    result = await provisionClientSheet({ tenantId: legacy.id, clientName: legacy.name });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.calculatorOk, false);
    assert.ok(result.warnings && result.warnings.length === 1, 'the missing calculator is explained');

    // A later answer without a calculator never wipes a calculator that is already saved.
    respond = (body) => ({ json: { ok: true, spreadsheetId: body.trackingSheetId, url: `https://docs.google.com/spreadsheets/d/${body.trackingSheetId}/edit` } });
    result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.strictEqual(result.calculatorOk, true);
    assert.strictEqual((await savedConfig(demo)).calculator_id, 'calculator_0123456789');
    assert.strictEqual((await savedConfig(demo)).folder_id, 'folder_0123456789');
    console.log(' PASS: a missing calculator gives a warning; the tracking sheet is still saved; saved fields are never wiped.');

    // ---------------------------------------------------------------- 5. failures never throw and change nothing
    const before = JSON.stringify(await savedConfig(demo));
    respond = () => ({ json: { ok: false, error: 'unauthorized' } });
    result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.deepStrictEqual(result, { ok: false, error: 'unauthorized' });

    respond = () => ({ status: 500, json: null });
    result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);

    respond = () => Promise.reject(new Error('network down'));
    result = await provisionClientSheet({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'Could not reach the Google Sheets script.');
    renamed = await renameClientFiles({ tenantId: demo, clientName: 'ABC Roofing' });
    assert.deepStrictEqual(renamed, { ok: false, error: 'Could not reach the Google Sheets script.' });
    assert.strictEqual(JSON.stringify(await savedConfig(demo)), before, 'a failed run leaves the saved links alone');
    console.log(' PASS: script errors, bad responses and network failures are returned, never thrown.');

    // ---------------------------------------------------------------- 6. rename uses the saved ids
    calls.length = 0;
    respond = () => ({ json: { ok: true, warnings: [] } });
    renamed = await renameClientFiles({ tenantId: demo, clientName: 'ABC Roofing & Solar' });
    assert.deepStrictEqual(renamed, { ok: true });
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(
      { action: calls[0].action, clientName: calls[0].clientName, folderId: calls[0].folderId, trackingSheetId: calls[0].trackingSheetId, calculatorSheetId: calls[0].calculatorSheetId, secret: calls[0].secret },
      { action: 'rename', clientName: 'ABC Roofing & Solar', folderId: 'folder_0123456789', trackingSheetId: 'sheet_demo_123', calculatorSheetId: 'calculator_0123456789', secret: 'test-secret' }
    );
    assert.strictEqual(JSON.stringify(await savedConfig(demo)), before, 'renaming changes no saved ids or links');

    respond = () => ({ json: { ok: false, error: 'The Drive folder could not be found.' } });
    renamed = await renameClientFiles({ tenantId: demo, clientName: 'ABC Roofing & Solar' });
    assert.deepStrictEqual(renamed, { ok: false, error: 'The Drive folder could not be found.' });
    console.log(' PASS: rename sends the saved folder, sheet and calculator ids and reports a failure without throwing.');

    // ---------------------------------------------------------------- 7. saving a client: a new name renames the Drive files
    calls.length = 0;
    respond = () => ({ json: { ok: true, warnings: [] } });
    let res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { name: demoTenant.name, phone: '+1 555 234 5678' }), ctx(demo));
    let body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0, 'saving without a name change does not touch Google Drive');
    assert.ok(!('driveWarning' in body));

    res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { name: 'ABC Roofing Group' }), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.tenant.name, 'ABC Roofing Group');
    assert.ok(!('driveWarning' in body), 'a clean rename has no warning');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].action, 'rename');
    assert.strictEqual(calls[0].clientName, 'ABC Roofing Group');
    assert.strictEqual(calls[0].folderId, 'folder_0123456789');
    console.log(' PASS: changing the company name renames the Drive folder and files; other saves do not call Google.');

    // ---------------------------------------------------------------- 8. a failed rename still saves
    respond = () => ({ json: { ok: false, error: 'The Drive folder could not be found.' } });
    res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { name: 'ABC Roofing Holdings' }), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200, 'the save still succeeds');
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.driveWarning, 'The Drive folder could not be found.');
    assert.strictEqual(store.tenants.find((t) => t.id === demo)!.name, 'ABC Roofing Holdings', 'the new name is saved');

    respond = () => Promise.reject(new Error('network down'));
    res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { name: 'ABC Roofing' }), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(body.driveWarning, 'an unreachable script is a warning too');
    assert.strictEqual(store.tenants.find((t) => t.id === demo)!.name, 'ABC Roofing');
    console.log(' PASS: a Drive rename failure never fails the save; the page gets a driveWarning.');

    // ---------------------------------------------------------------- 9. "Set up Google files" and what the pages are given
    calls.length = 0;
    respond = () => ({ json: fullAnswer('C') });
    res = await clientRoute.PATCH(req(`/api/admin/clients/${legacy.id}`, 'PATCH', { action: 'setup_google_files' }), ctx(legacy.id));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(calls[0].trackingSheetId, 'legacy_0123456789', 'a client with a sheet but no folder is migrated, not duplicated');
    assert.strictEqual(body.googleFiles.calculatorUrl, fullAnswer('C').calculatorUrl);
    assert.strictEqual(body.googleFiles.folderUrl, fullAnswer('C').folderUrl);

    res = await clientRoute.GET(req(`/api/admin/clients/${legacy.id}`), ctx(legacy.id));
    body = await res.json();
    assert.strictEqual(body.googleFiles.trackingSheetUrl, body.trackingSheetUrl);
    assert.strictEqual(body.googleFiles.calculatorUrl, fullAnswer('C').calculatorUrl);
    assert.strictEqual(body.googleFiles.folderUrl, fullAnswer('C').folderUrl);

    respond = () => ({ json: { ok: false, error: 'unauthorized' } });
    res = await clientRoute.PATCH(req(`/api/admin/clients/${legacy.id}`, 'PATCH', { action: 'create_sheet' }), ctx(legacy.id));
    assert.strictEqual(res.status, 502, 'the older action name still works and reports a failure');

    // The client portal is given the client's own calculator link, but never the Drive folder.
    res = await getPortalData(req(`/api/portal/${demo}/data`), { params: { clientId: demo } });
    body = await res.json();
    const portalSheet = body.integrations.find((i: any) => i.integration_type === 'google_sheets');
    assert.strictEqual(portalSheet.config_data.calculator_id, 'calculator_0123456789');
    assert.ok(String(portalSheet.config_data.calculator_url).includes('calculator_0123456789'));
    assert.ok(!('folder_id' in portalSheet.config_data) && !('folder_url' in portalSheet.config_data), 'the folder link stays staff-only');
    console.log(' PASS: "Set up Google files" migrates older clients; admin and portal pages get the right links.');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_SHEETS_SCRIPT_URL;
    delete process.env.GOOGLE_SHEETS_SCRIPT_SECRET;
  }

  console.log('Google Files Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
