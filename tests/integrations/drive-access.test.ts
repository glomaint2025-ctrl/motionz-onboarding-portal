import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}
// Tests must never send real email or touch real Google files. The script URL is set to a
// made-up address only while global fetch is replaced by the fake Drive below.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GOOGLE_SHEETS_SCRIPT_SECRET']) delete process.env[key];

async function run() {
  console.log('Running Drive Access Tests (who can open the Google files, contract upload)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { integrationConfigRepository, csmAssignmentRepository, contractRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { createInvitation } = await import('../../src/lib/auth/invitations');
  const { invitationService } = await import('../../src/lib/services/invitation.service');
  const access = await import('../../src/lib/integrations/sheets/access');
  const { desiredDriveAccess, diffDriveAccess, syncClientDriveAccess, syncAdminDriveAccess, describeDriveSync, OLD_SCRIPT_WARNING } = access;
  const { validateContractFile, contractDriveFileId, NO_FOLDER_ERROR } = await import('../../src/lib/integrations/sheets/contract-files');
  const clientRoute = await import('../../src/app/api/admin/clients/[id]/route');
  const clientsRoute = await import('../../src/app/api/admin/clients/route');
  const recordsRoute = await import('../../src/app/api/admin/clients/[id]/records/route');
  const staffRoute = await import('../../src/app/api/admin/staff/route');
  const teamRoute = await import('../../src/app/api/portal/[clientId]/team/route');
  const portalContracts = await import('../../src/app/api/portal/[clientId]/contracts/route');

  resetStore();
  const store = getStore();
  const demo = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;
  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const ownerCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', demo);

  function req(path: string, method = 'GET', body?: unknown, cookie = adminCookie) {
    const headers = new Headers({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isForm) headers.set('content-type', 'application/json');
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  }
  const ctx = (id: string) => ({ params: { id } });
  const portalCtx = (clientId: string) => ({ params: { clientId } });
  const user = (id: string) => store.users.find((u) => u.id === id)!;
  const syncLogs = () => store.auditLogs.filter((l) => l.action === 'drive.access_synced');

  // ================================================================ 1. who should have access
  const admin = { id: 'a1', email: 'Admin@Motionz.ai', full_name: 'A', role: 'admin', created_at: '', updated_at: '' } as any;
  const offAdmin = { ...admin, id: 'a2', email: 'gone@motionz.ai', status: 'suspended' };
  const csm = { id: 'c1', email: 'csm@motionz.ai', full_name: 'C', role: 'csm', created_at: '', updated_at: '' } as any;
  const owner = { id: 'o1', email: 'Owner@Client.com', full_name: 'O', role: 'client', created_at: '', updated_at: '' } as any;
  const memberAll = { id: 'm1', email: 'all@client.com', role: 'client_member' } as any; // no restriction list
  const memberTracking = { id: 'm2', email: 'tracking@client.com', role: 'client_member', allowed_modules: ['leads', 'tracking'] } as any;
  const memberNoTracking = { id: 'm3', email: 'leads@client.com', role: 'client_member', allowed_modules: ['leads'] } as any;
  const memberOff = { id: 'm4', email: 'off@client.com', role: 'client_member', status: 'suspended' } as any;
  const files = { folderId: 'F', trackingId: 'T', calculatorId: 'C', contractFileIds: ['K1', 'K2'] };
  const liveTenant = { status: 'active' as const, primary_email: 'owner@client.com' };
  const users = [owner, memberAll, memberTracking, memberNoTracking, memberOff];
  const line = (e: { target: string; id: string; email: string; role: string }) => `${e.target}:${e.id}:${e.email}:${e.role}`;
  const table = (entries: Array<{ target: string; id: string; email: string; role: string }>) => entries.map(line).sort();

  let desired = desiredDriveAccess({ tenant: liveTenant, parentFolderId: 'P', files, users, csm, admins: [admin, offAdmin] });
  assert.deepStrictEqual(table(desired), [
    'calculator:C:all@client.com:editor',
    'calculator:C:owner@client.com:editor',
    'calculator:C:tracking@client.com:editor',
    'contract:K1:owner@client.com:viewer',
    'contract:K2:owner@client.com:viewer',
    'folder:F:csm@motionz.ai:editor',
    'parent:P:admin@motionz.ai:editor',
    'tracking:T:all@client.com:editor',
    'tracking:T:owner@client.com:editor',
    'tracking:T:tracking@client.com:editor',
  ]);
  assert.ok(!desired.some((e) => e.target === 'folder' && e.email !== 'csm@motionz.ai'), 'only the CSM is on the client folder');
  assert.ok(!desired.some((e) => e.target === 'contract' && e.email !== 'owner@client.com'), 'only the owner sees the contract');
  assert.ok(!desired.some((e) => e.email === 'leads@client.com'), 'a member without Results Tracking gets no sheet');
  assert.ok(!desired.some((e) => e.email === 'off@client.com' || e.email === 'gone@motionz.ai'), 'disabled people get nothing');

  // A disabled CSM, a CSM who is now an admin, a disabled owner.
  desired = desiredDriveAccess({ tenant: liveTenant, files, users: [{ ...owner, status: 'suspended' }], csm: { ...csm, status: 'suspended' } });
  assert.deepStrictEqual(desired, [], 'a disabled owner and a disabled CSM get nothing (the main email does not stand in for a disabled owner)');

  // Before the owner has accepted their invitation, the client's main email stands in for them.
  desired = desiredDriveAccess({ tenant: liveTenant, files, users: [] });
  assert.deepStrictEqual(table(desired), [
    'calculator:C:owner@client.com:editor',
    'contract:K1:owner@client.com:viewer',
    'contract:K2:owner@client.com:viewer',
    'tracking:T:owner@client.com:editor',
  ]);

  // Suspended, cancelled and archived clients: their people get nothing; staff keep their access.
  for (const tenant of [
    { status: 'suspended' as const, primary_email: 'owner@client.com' },
    { status: 'cancelled' as const, primary_email: 'owner@client.com' },
    { status: 'active' as const, primary_email: 'owner@client.com', deleted_at: '2026-10-01T00:00:00Z' },
  ]) {
    desired = desiredDriveAccess({ tenant, parentFolderId: 'P', files, users, csm, admins: [admin] });
    assert.deepStrictEqual(table(desired), ['folder:F:csm@motionz.ai:editor', 'parent:P:admin@motionz.ai:editor']);
  }

  // Targets that do not exist yet are simply left out.
  desired = desiredDriveAccess({ tenant: liveTenant, files: { folderId: 'F' }, users, csm, admins: [admin] });
  assert.deepStrictEqual(table(desired), ['folder:F:csm@motionz.ai:editor']);
  console.log(' PASS: desired access: admins on the parent, CSM on the folder, owner and tracking members on the sheets, owner on contracts.');

  // ================================================================ 2. the difference
  const targets = [
    { target: 'parent' as const, id: 'P' },
    { target: 'folder' as const, id: 'F', group: 'g' },
    { target: 'tracking' as const, id: 'T', group: 'g' },
    { target: 'contract' as const, id: 'K1', group: 'g' },
  ];
  const want = [
    { target: 'parent' as const, id: 'P', email: 'admin@motionz.ai', role: 'editor' as const },
    { target: 'folder' as const, id: 'F', email: 'csm@motionz.ai', role: 'editor' as const },
    { target: 'tracking' as const, id: 'T', email: 'owner@client.com', role: 'editor' as const },
    { target: 'tracking' as const, id: 'T', email: 'new@client.com', role: 'editor' as const },
    { target: 'contract' as const, id: 'K1', email: 'owner@client.com', role: 'viewer' as const },
  ];
  let changes = diffDriveAccess({
    targets,
    desired: want,
    protectedEmails: ['Script@Owner.com'],
    current: [
      { id: 'P', ok: true, owner: 'script@owner.com', editors: ['ADMIN@motionz.ai'], viewers: [] },
      // The admin shows on everything below the parent because Drive passes access down.
      { id: 'F', ok: true, owner: 'script@owner.com', editors: ['admin@motionz.ai', 'old.csm@motionz.ai'], viewers: [] },
      {
        id: 'T',
        ok: true,
        owner: 'script@owner.com',
        editors: ['admin@motionz.ai', 'old.csm@motionz.ai', 'Owner@Client.com', 'left@client.com', 'script@owner.com'],
        viewers: [],
      },
      { id: 'K1', ok: true, owner: 'script@owner.com', editors: ['admin@motionz.ai', 'owner@client.com'], viewers: ['script@owner.com'] },
    ],
  });
  assert.deepStrictEqual(changes.map((c) => `${c.target}:${c.email}:${c.role}`), [
    'folder:csm@motionz.ai:editor', // add
    'folder:old.csm@motionz.ai:none', // removal
    'tracking:new@client.com:editor', // add
    'tracking:old.csm@motionz.ai:none', // was also on the sheet itself
    'tracking:left@client.com:none', // removal
    'contract:owner@client.com:viewer', // role change: editor -> viewer
  ]);
  assert.ok(!changes.some((c) => c.email === 'admin@motionz.ai'), 'already right (whatever the letter case), and inherited access is left alone');
  assert.ok(!changes.some((c) => c.email === 'script@owner.com'), 'the owner / script account is never removed');
  assert.strictEqual(changes[0].target, 'folder', 'folders are changed before the files inside them');

  // The owner is never added either, and a target that could not be read is left alone.
  changes = diffDriveAccess({
    targets,
    desired: [...want, { target: 'tracking', id: 'T', email: 'File.Owner@x.com', role: 'editor' }],
    current: [
      { id: 'P', ok: true, editors: ['admin@motionz.ai'], viewers: [] },
      { id: 'F', ok: false, error: 'Not found in Google Drive.' },
      { id: 'T', ok: true, owner: 'file.owner@x.com', editors: ['owner@client.com', 'new@client.com'], viewers: [] },
      { id: 'K1', ok: true, editors: [], viewers: ['owner@client.com'] },
    ],
  });
  assert.deepStrictEqual(changes, [], 'nothing to do');

  // Parent folder: by default anyone unwanted is removed; a filter can protect people shared by hand.
  const parentOnly = {
    targets: [{ target: 'parent' as const, id: 'P' }],
    desired: [want[0]],
    current: [{ id: 'P', ok: true, editors: ['ex.admin@motionz.ai', 'friend@gmail.com'], viewers: ['watcher@gmail.com'] }],
  };
  assert.deepStrictEqual(diffDriveAccess(parentOnly).map((c) => `${c.email}:${c.role}`).sort(), [
    'admin@motionz.ai:editor',
    'ex.admin@motionz.ai:none',
    'friend@gmail.com:none',
    'watcher@gmail.com:none',
  ]);
  assert.deepStrictEqual(
    diffDriveAccess({ ...parentOnly, parentRemovable: (email) => email.endsWith('@motionz.ai') }).map((c) => `${c.email}:${c.role}`),
    ['admin@motionz.ai:editor', 'ex.admin@motionz.ai:none']
  );
  console.log(' PASS: the difference: adds, removals, role change, case-insensitive, owner never touched, inherited access left alone.');

  // ================================================================ fake Google Drive (the Apps Script)
  const SCRIPT_URL = 'https://script.invalid/macros/s/test/exec';
  const PARENT = 'parent_folder_0123456789';
  const SCRIPT_USER = 'drive.owner@example.com';
  const realFetch = globalThis.fetch;
  const calls: Array<Record<string, any>> = [];
  const allCalls: Array<Record<string, any>> = [];
  type Item = { editors: Set<string>; viewers: Set<string>; parent?: string; trashed?: boolean };
  const drive = new Map<string, Item>();
  const item = (id: string, parent?: string) => {
    if (!drive.has(id)) drive.set(id, { editors: new Set(), viewers: new Set(), parent });
    return drive.get(id)!;
  };
  item(PARENT);
  /** Editors as Drive reports them: the item's own plus everything passed down from above. */
  const editorsOf = (id: string): string[] => {
    const own = drive.get(id)!;
    return Array.from(new Set(Array.from(own.editors).concat(own.parent ? editorsOf(own.parent) : [])));
  };
  const describe = (id: string) => {
    const found = drive.get(id);
    if (!found || found.trashed) return { id, ok: false, owner: '', editors: [], viewers: [], error: 'Not found in Google Drive.' };
    return { id, ok: true, owner: SCRIPT_USER, editors: editorsOf(id), viewers: Array.from(found.viewers) };
  };
  let scriptMode: 'new' | 'old-unknown-action' | 'old-provisions-everything' | 'down' = 'new';
  let failEmail = '';
  let fileCounter = 0;
  let provisionCounter = 0;

  globalThis.fetch = (async (input: any, init?: any) => {
    assert.strictEqual(String(input), SCRIPT_URL, 'only the script URL may be called');
    const body = JSON.parse(String(init?.body || '{}'));
    calls.push(body);
    allCalls.push(body);
    assert.strictEqual(body.secret, 'test-secret');
    const answer = (json: unknown) => new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    if (scriptMode === 'down') throw new Error('network down');

    if (body.action === 'provision') {
      const n = ++provisionCounter;
      const folderId = body.folderId || `folder${n}_0123456789`;
      const trackingId = body.trackingSheetId || `tracking${n}_0123456789`;
      const calculatorId = body.calculatorSheetId || `calculator${n}_0123456789`;
      item(folderId, PARENT);
      item(trackingId, folderId);
      item(calculatorId, folderId);
      if (body.clientEmail) {
        item(trackingId).editors.add(body.clientEmail);
        item(calculatorId).editors.add(body.clientEmail);
      }
      return answer({
        ok: true,
        folderId,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        spreadsheetId: trackingId,
        url: `https://docs.google.com/spreadsheets/d/${trackingId}/edit`,
        calculatorId,
        calculatorUrl: `https://docs.google.com/spreadsheets/d/${calculatorId}/edit#gid=2143281968`,
        warnings: [],
      });
    }
    if (body.action === 'rename') return answer({ ok: true, warnings: [] });

    // An older script: either it refuses the new actions, or (older still) it treats everything as "provision".
    if (scriptMode === 'old-unknown-action') return answer({ ok: false, error: `Unknown action: ${body.action}` });
    if (scriptMode === 'old-provisions-everything') {
      return answer(body.clientName ? { ok: true, spreadsheetId: 'oops', url: 'https://docs.google.com/spreadsheets/d/oops/edit' } : { ok: false, error: 'clientName is required' });
    }

    if (body.action === 'list_access') {
      return answer({ ok: true, version: 3, parentFolderId: PARENT, scriptUser: SCRIPT_USER, parent: describe(PARENT), items: (body.ids || []).map(describe) });
    }
    if (body.action === 'set_access') {
      const results = (body.changes || []).map((change: any) => {
        const found = drive.get(change.id);
        if (!found) return { ...change, ok: false, error: 'Not found in Google Drive.' };
        if (change.email === failEmail) return { ...change, ok: false, error: 'Invalid argument: not a Google account' };
        found.editors.delete(change.email);
        found.viewers.delete(change.email);
        if (change.role === 'editor') found.editors.add(change.email);
        if (change.role === 'viewer') found.viewers.add(change.email);
        return { ...change, ok: true };
      });
      return answer({ ok: true, results });
    }
    if (body.action === 'upload_file') {
      if (!drive.has(body.folderId)) return answer({ ok: false, error: 'The Drive folder could not be found.' });
      const fileId = `contractfile${++fileCounter}_0123456789`;
      item(fileId, body.folderId);
      return answer({ ok: true, fileId, url: `https://drive.google.com/file/d/${fileId}/view` });
    }
    if (body.action === 'trash_file') {
      const found = drive.get(body.fileId);
      if (found) {
        found.trashed = true;
        found.viewers.clear();
      }
      return answer({ ok: true });
    }
    return answer({ ok: false, error: `Unknown action: ${body.action}` });
  }) as typeof fetch;

  const actions = () => calls.map((c) => c.action);
  const synced = () => actions().includes('list_access');
  const begin = () => {
    calls.length = 0;
  };

  try {
    // ================================================================ 3. nothing to do: no script, no folder
    let result = await syncClientDriveAccess(demo);
    assert.deepStrictEqual(result, { ok: true, skipped: true, added: 0, removed: 0, warnings: [] }, 'no script configured: a quiet no-op');
    assert.deepStrictEqual(await syncAdminDriveAccess(), { ok: true, skipped: true, added: 0, removed: 0, warnings: [] });

    process.env.GOOGLE_SHEETS_SCRIPT_URL = SCRIPT_URL;
    process.env.GOOGLE_SHEETS_SCRIPT_SECRET = 'test-secret';

    // The demo client has a tracking sheet but no Drive folder yet.
    result = await syncClientDriveAccess(demo);
    assert.deepStrictEqual(result, { ok: true, skipped: true, added: 0, removed: 0, warnings: [] }, 'no folder yet: a quiet no-op');
    result = await syncClientDriveAccess('no-such-client');
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(calls.length, 0, 'Google is not called at all');
    assert.strictEqual(syncLogs().length, 0, 'and nothing is logged');
    console.log(' PASS: without a script, or without a client folder, the sync does nothing and never throws.');

    // ================================================================ 4. an older script is spotted, nothing is changed
    await integrationConfigRepository.save(demo, 'google_sheets', {
      spreadsheet_id: 'demo_tracking_0123456789',
      sheet_url: 'https://docs.google.com/spreadsheets/d/demo_tracking_0123456789/edit',
      folder_id: 'demo_folder_0123456789',
      folder_url: 'https://drive.google.com/drive/folders/demo_folder_0123456789',
      calculator_id: 'demo_calculator_0123456789',
      calculator_url: 'https://docs.google.com/spreadsheets/d/demo_calculator_0123456789/edit#gid=2143281968',
    });
    item('demo_folder_0123456789', PARENT);
    item('demo_tracking_0123456789', 'demo_folder_0123456789').editors.add('john@abcroofing.com');
    item('demo_calculator_0123456789', 'demo_folder_0123456789').editors.add('john@abcroofing.com');

    for (const mode of ['old-unknown-action', 'old-provisions-everything'] as const) {
      scriptMode = mode;
      begin();
      result = await syncClientDriveAccess(demo);
      assert.strictEqual(result.ok, false);
      assert.deepStrictEqual(result.warnings, [OLD_SCRIPT_WARNING]);
      assert.deepStrictEqual(actions(), ['list_access'], 'only the read-only question is asked; set_access is never sent to an old script');
      assert.ok(!('clientName' in calls[0]) && !('clientEmail' in calls[0]), 'nothing an old script could take for a new client');
      assert.strictEqual(describeDriveSync(result), OLD_SCRIPT_WARNING);
    }
    assert.strictEqual(syncLogs().length, 2, 'a failed sync is logged');
    assert.strictEqual(syncLogs()[0].details?.ok, false);

    scriptMode = 'down';
    result = await syncClientDriveAccess(demo);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.warnings.length, 1, 'an unreachable script is a warning, never an exception');
    scriptMode = 'new';
    console.log(' PASS: an older or unreachable script gives a warning and changes nothing.');

    // ================================================================ 5. a real sync sends only the difference
    store.auditLogs.length = 0;
    drive.get(PARENT)!.editors.add('someone.shared.by.hand@gmail.com');
    begin();
    result = await syncClientDriveAccess(demo, { actorEmail: 'admin@motionz.ai', actorRole: 'admin' });
    assert.deepStrictEqual(actions(), ['list_access', 'set_access']);
    assert.deepStrictEqual(calls[0].ids.slice().sort(), ['demo_calculator_0123456789', 'demo_folder_0123456789', 'demo_tracking_0123456789']);
    const sent = calls[1].changes.map((c: any) => `${c.id}:${c.email}:${c.role}`).sort();
    assert.deepStrictEqual(sent, [
      'demo_calculator_0123456789:sarah@abcroofing.com:editor',
      'demo_folder_0123456789:csm@motionz.ai:editor',
      'demo_tracking_0123456789:sarah@abcroofing.com:editor',
      `${PARENT}:admin@motionz.ai:editor`,
    ]);
    assert.ok(calls[1].changes.every((c: any) => Object.keys(c).sort().join() === 'email,id,role'), 'only id, email and role are sent');
    assert.strictEqual(calls[1].changes[0].id, PARENT, 'the parent folder comes first');
    assert.deepStrictEqual(result, { ok: true, added: 3, removed: 0, warnings: [] });
    assert.strictEqual(describeDriveSync(result), 'Added 3');
    assert.ok(drive.get(PARENT)!.editors.has('someone.shared.by.hand@gmail.com'), 'a person shared by hand on the parent folder is left alone');
    assert.strictEqual(syncLogs().length, 1);
    assert.strictEqual(syncLogs()[0].tenant_id, demo);
    assert.strictEqual(syncLogs()[0].actor_email, 'admin@motionz.ai');
    assert.strictEqual(syncLogs()[0].details?.added, 3);

    begin();
    result = await syncClientDriveAccess(demo);
    assert.deepStrictEqual(actions(), ['list_access'], 'nothing differs, so nothing is sent');
    assert.deepStrictEqual(result, { ok: true, added: 0, removed: 0, warnings: [] });
    assert.strictEqual(describeDriveSync(result), 'Access is up to date');
    assert.strictEqual(syncLogs().length, 1, 'an unchanged sync is not logged');

    // Someone shared by hand on a client file is removed; a failing address is reported, the rest still happens.
    drive.get('demo_tracking_0123456789')!.editors.add('stranger@gmail.com');
    drive.get('demo_calculator_0123456789')!.editors.delete('sarah@abcroofing.com');
    failEmail = 'sarah@abcroofing.com';
    result = await syncClientDriveAccess(demo);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.removed, 1);
    assert.strictEqual(result.added, 0);
    assert.deepStrictEqual(result.warnings, ['Could not give sarah@abcroofing.com access to the calculator: Invalid argument: not a Google account']);
    assert.ok(!drive.get('demo_tracking_0123456789')!.editors.has('stranger@gmail.com'));
    failEmail = '';
    result = await syncClientDriveAccess(demo);
    assert.deepStrictEqual(result, { ok: true, added: 1, removed: 0, warnings: [] });
    assert.strictEqual(describeDriveSync({ ok: true, added: 2, removed: 1, warnings: [] }), 'Added 2, removed 1');
    console.log(' PASS: the sync lists access, sends only the difference, logs once, and reports a bad address without stopping.');

    // ================================================================ 6. every trigger point runs the sync
    // 6a. Team member: disabled, enabled, pages changed (by the account owner in the portal).
    begin();
    let res = await teamRoute.PUT(req(`/api/portal/${demo}/team`, 'PUT', { action: 'suspend', memberId: 'user-member-1' }, ownerCookie), portalCtx(demo));
    assert.strictEqual(res.status, 200);
    assert.ok(synced(), 'disabling a team member syncs Drive access');
    assert.ok(!drive.get('demo_tracking_0123456789')!.editors.has('sarah@abcroofing.com'), 'a disabled member loses the sheet');
    assert.ok(!('driveAccessWarning' in (await res.json())), 'Drive details are not shown to the client');

    begin();
    res = await teamRoute.PUT(req(`/api/portal/${demo}/team`, 'PUT', { action: 'unsuspend', memberId: 'user-member-1' }, ownerCookie), portalCtx(demo));
    assert.strictEqual(res.status, 200);
    assert.ok(synced() && drive.get('demo_tracking_0123456789')!.editors.has('sarah@abcroofing.com'), 'an enabled member gets the sheet back');

    begin();
    res = await teamRoute.PUT(
      req(`/api/portal/${demo}/team`, 'PUT', { action: 'update_permissions', memberId: 'user-member-1', allowed_modules: ['leads'] }, ownerCookie),
      portalCtx(demo)
    );
    assert.strictEqual(res.status, 200);
    assert.ok(synced() && !drive.get('demo_tracking_0123456789')!.editors.has('sarah@abcroofing.com'), 'without Results Tracking the sheet is taken away');
    assert.ok(!drive.get('demo_calculator_0123456789')!.editors.has('sarah@abcroofing.com'));

    // 6b. The same three from the admin client page.
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'update_member_permissions', memberId: 'user-member-1', allowed_modules: ['leads', 'tracking'] }), ctx(demo));
    assert.strictEqual(res.status, 200);
    assert.ok(synced() && drive.get('demo_tracking_0123456789')!.editors.has('sarah@abcroofing.com'));
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'suspend_member', memberId: 'user-member-1' }), ctx(demo));
    assert.ok(res.status === 200 && synced() && !drive.get('demo_tracking_0123456789')!.editors.has('sarah@abcroofing.com'));
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'unsuspend_member', memberId: 'user-member-1' }), ctx(demo));
    assert.ok(res.status === 200 && synced() && drive.get('demo_tracking_0123456789')!.editors.has('sarah@abcroofing.com'));

    // 6c. CSM changed: the new CSM gets the folder, the old one loses it. A save without a CSM change does not call Google.
    begin();
    res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { phone: '+1 555 234 5678', csm_user_id: 'user-csm-1' }), ctx(demo));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0, 'the same CSM again: Google is not called');
    res = await clientRoute.PUT(req(`/api/admin/clients/${demo}`, 'PUT', { csm_user_id: 'user-csm-2' }), ctx(demo));
    assert.strictEqual(res.status, 200);
    assert.ok(synced());
    assert.deepStrictEqual(Array.from(drive.get('demo_folder_0123456789')!.editors), ['csm.agent@motionz.ai']);
    assert.ok(!('driveAccessWarning' in (await res.json())));

    // 6d. Client suspended / reactivated / archived / unarchived.
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'suspend_client' }), ctx(demo));
    assert.ok(res.status === 200 && synced());
    assert.strictEqual(drive.get('demo_tracking_0123456789')!.editors.size, 0, 'a suspended client: owner and team lose the sheets');
    assert.deepStrictEqual(Array.from(drive.get('demo_folder_0123456789')!.editors), ['csm.agent@motionz.ai'], 'the CSM keeps the folder');
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'unsuspend_client' }), ctx(demo));
    assert.ok(res.status === 200 && synced());
    assert.deepStrictEqual(Array.from(drive.get('demo_tracking_0123456789')!.editors).sort(), ['john@abcroofing.com', 'sarah@abcroofing.com']);
    begin();
    res = await clientRoute.DELETE(req(`/api/admin/clients/${demo}`, 'DELETE'), ctx(demo));
    assert.ok(res.status === 200 && synced());
    assert.strictEqual(drive.get('demo_tracking_0123456789')!.editors.size, 0, 'an archived client: owner and team lose the sheets');
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'unarchive' }), ctx(demo));
    assert.ok(res.status === 200 && synced());
    assert.strictEqual(drive.get('demo_tracking_0123456789')!.editors.size, 2);

    // 6e. "Set up Google files" and "Re-sync Drive access".
    begin();
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'setup_google_files' }), ctx(demo));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(actions(), ['provision', 'list_access'], 'setting up the files also checks access');
    begin();
    drive.get('demo_folder_0123456789')!.editors.add('stranger@gmail.com');
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'sync_drive_access' }), ctx(demo));
    let body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.message, 'Removed 1');
    assert.strictEqual(body.upToDate, true);
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'sync_drive_access' }), ctx(demo));
    assert.strictEqual((await res.json()).message, 'Access is up to date');
    scriptMode = 'old-unknown-action';
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'sync_drive_access' }), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200, 'a Drive problem is never a failed request');
    assert.strictEqual(body.upToDate, false);
    assert.strictEqual(body.message, OLD_SCRIPT_WARNING);
    // With an old script every trigger still succeeds and only carries a warning.
    res = await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'suspend_member', memberId: 'user-member-1' }), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.driveAccessWarning, OLD_SCRIPT_WARNING);
    assert.strictEqual(user('user-member-1').status, 'suspended', 'the change itself was saved');
    scriptMode = 'new';
    await clientRoute.PATCH(req(`/api/admin/clients/${demo}`, 'PATCH', { action: 'unsuspend_member', memberId: 'user-member-1' }), ctx(demo));

    // 6f. A new client: files are created, then access is synced (the CSM gets the new folder).
    begin();
    res = await clientsRoute.POST(
      req('/api/admin/clients', 'POST', { name: 'Fresh Start Roofing', primary_contact_name: 'Fay Start', primary_email: 'fay@freshstart.example', csm_user_id: 'user-csm-1' })
    );
    body = await res.json();
    assert.strictEqual(res.status, 200, JSON.stringify(body));
    assert.deepStrictEqual(actions(), ['provision', 'list_access', 'set_access']);
    const fresh = body.tenant.id as string;
    const freshFiles = (await integrationConfigRepository.listByTenant(fresh)).find((c) => c.integration_type === 'google_sheets')!.config_data;
    assert.deepStrictEqual(Array.from(drive.get(freshFiles.folder_id)!.editors), ['csm@motionz.ai']);
    assert.deepStrictEqual(Array.from(drive.get(freshFiles.spreadsheet_id)!.editors), ['fay@freshstart.example'], 'the invited owner keeps the sheet before they have signed in');

    // 6g. An invitation is accepted: the new team member gets the sheets.
    const invite = await createInvitation({ tenantId: fresh, email: 'tom@freshstart.example', role: 'client_member', allowed_modules: ['tracking'], createdBy: 'admin@motionz.ai', notify: false } as any);
    begin();
    assert.strictEqual(calls.length, 0, 'inviting someone gives no Drive access yet');
    await invitationService.verifyAndAccept(invite.rawToken);
    assert.ok(synced(), 'accepting an invitation syncs Drive access');
    assert.ok(drive.get(freshFiles.spreadsheet_id)!.editors.has('tom@freshstart.example'));
    assert.ok(drive.get(freshFiles.calculator_id)!.editors.has('tom@freshstart.example'));
    assert.ok(!drive.get(freshFiles.folder_id)!.editors.has('tom@freshstart.example'), 'never the folder');

    // 6h. Staff: added, email changed, role changed, disabled, enabled, deleted.
    begin();
    res = await staffRoute.POST(req('/api/admin/staff', 'POST', { name: 'Ada Admin', email: 'ada@motionz.ai', role: 'admin' }));
    body = await res.json();
    assert.strictEqual(res.status, 200, JSON.stringify(body));
    assert.ok(synced() && drive.get(PARENT)!.editors.has('ada@motionz.ai'), 'a new admin gets the parent folder');
    const adaId = body.staff.id as string;

    begin();
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: adaId, action: 'update', email: 'ada.new@motionz.ai' }));
    assert.strictEqual(res.status, 200);
    assert.ok(synced());
    assert.ok(drive.get(PARENT)!.editors.has('ada.new@motionz.ai') && !drive.get(PARENT)!.editors.has('ada@motionz.ai'), 'the old email loses access, the new one gets it');

    begin();
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: adaId, action: 'disable' }));
    assert.ok(res.status === 200 && synced() && !drive.get(PARENT)!.editors.has('ada.new@motionz.ai'), 'a disabled admin loses the parent folder');
    begin();
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: adaId, action: 'enable' }));
    assert.ok(res.status === 200 && synced() && drive.get(PARENT)!.editors.has('ada.new@motionz.ai'));

    // A CSM who becomes an admin gets the parent folder (which reaches every client folder). Then back.
    begin();
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: 'user-csm-1', action: 'update', role: 'admin' }));
    assert.strictEqual(res.status, 200);
    assert.ok(synced());
    assert.ok(drive.get(PARENT)!.editors.has('csm@motionz.ai'));
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: 'user-csm-1', action: 'update', role: 'csm' }));
    assert.strictEqual(res.status, 200);
    assert.ok(!drive.get(PARENT)!.editors.has('csm@motionz.ai') && drive.get(freshFiles.folder_id)!.editors.has('csm@motionz.ai'));

    // A disabled CSM loses the folders of every client they look after, in one round trip.
    await csmAssignmentRepository.setForTenant(demo, 'user-csm-1');
    await syncClientDriveAccess(demo);
    begin();
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: 'user-csm-1', action: 'disable' }));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(actions(), ['list_access', 'set_access'], 'both clients in one list and one change call');
    assert.ok(!drive.get(freshFiles.folder_id)!.editors.has('csm@motionz.ai') && !drive.get('demo_folder_0123456789')!.editors.has('csm@motionz.ai'));
    res = await staffRoute.PATCH(req('/api/admin/staff', 'PATCH', { id: 'user-csm-1', action: 'enable' }));
    assert.ok(drive.get(freshFiles.folder_id)!.editors.has('csm@motionz.ai') && drive.get('demo_folder_0123456789')!.editors.has('csm@motionz.ai'));

    begin();
    res = await staffRoute.DELETE(req('/api/admin/staff', 'DELETE', { id: adaId }));
    assert.strictEqual(res.status, 200);
    assert.ok(synced() && !drive.get(PARENT)!.editors.has('ada.new@motionz.ai'), 'a deleted admin loses the parent folder');
    assert.ok(drive.get(PARENT)!.editors.has('admin@motionz.ai') && drive.get(PARENT)!.editors.has('someone.shared.by.hand@gmail.com'));
    console.log(' PASS: every trigger point syncs Drive access: team, CSM, client status, new client, invitation, staff, set-up and re-sync.');

    // ================================================================ 7. contract: upload a file or paste a link
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04].concat(Array.from(Buffer.from('....word/document.xml'))));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    assert.deepStrictEqual(validateContractFile({ name: 'Signed Agreement.pdf', type: 'application/pdf', size: pdf.length, bytes: pdf }), {
      name: 'Signed-Agreement.pdf',
      contentType: 'application/pdf',
    });
    assert.strictEqual(validateContractFile({ name: 'a.docx', type: '', size: docx.length, bytes: docx }).contentType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.strictEqual(validateContractFile({ name: 'a.PNG', type: 'image/png', size: png.length, bytes: png }).contentType, 'image/png');
    assert.strictEqual(validateContractFile({ name: 'a.jpeg', type: 'image/jpeg', size: jpg.length, bytes: jpg }).contentType, 'image/jpeg');
    for (const bad of [
      { name: 'virus.exe', type: 'application/octet-stream', size: 5, bytes: pdf }, // type not allowed
      { name: 'page.html', type: 'text/html', size: 5, bytes: pdf },
      { name: 'fake.pdf', type: 'application/pdf', size: png.length, bytes: png }, // content is not a PDF
      { name: 'fake.pdf', type: 'image/png', size: pdf.length, bytes: pdf }, // MIME does not match the extension
      { name: 'plain.docx', type: '', size: 4, bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) }, // a zip, but not a Word file
      { name: 'empty.pdf', type: 'application/pdf', size: 0, bytes: new Uint8Array() },
      { name: 'big.pdf', type: 'application/pdf', size: 4 * 1024 * 1024 + 1, bytes: pdf }, // over 4 MB
    ]) {
      assert.throws(() => validateContractFile(bad), /not an allowed file type|does not look like|is empty|larger than 4 MB/, bad.name);
    }

    const uploadForm = (name: string, type: string, bytes: Uint8Array, title = 'Service Agreement') => {
      const form = new FormData();
      form.append('kind', 'contract');
      form.append('title', title);
      form.append('signed_at', '2026-09-30');
      form.append('file', new File([Buffer.from(bytes)], name, { type }));
      return form;
    };
    const records = (id: string) => `/api/admin/clients/${id}/records`;

    // A wrong file never reaches Google.
    begin();
    res = await recordsRoute.POST(req(records(demo), 'POST', uploadForm('notes.txt', 'text/plain', pdf)), ctx(demo));
    assert.strictEqual(res.status, 400);
    assert.ok((await res.json()).error.includes('PDF, DOCX, PNG or JPG'));
    res = await recordsRoute.POST(req(records(demo), 'POST', uploadForm('fake.pdf', 'application/pdf', png)), ctx(demo));
    assert.strictEqual(res.status, 400);
    const noFile = new FormData();
    noFile.append('kind', 'contract');
    noFile.append('title', 'No file');
    res = await recordsRoute.POST(req(records(demo), 'POST', noFile), ctx(demo));
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'Choose a file to upload.');
    assert.strictEqual(calls.length, 0, 'a refused file is never sent to Google');

    // A client without a Drive folder: a clear instruction, nothing uploaded.
    const noFolder = await createTenant({ name: 'No Folder Roofing', slug: 'no-folder', primary_email: 'owner@nofolder.example' });
    res = await recordsRoute.POST(req(records(noFolder.id), 'POST', uploadForm('a.pdf', 'application/pdf', pdf)), ctx(noFolder.id));
    body = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.error, NO_FOLDER_ERROR);
    assert.ok(body.error.includes('Set up Google files'));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await contractRepository.listByTenant(noFolder.id)).length, 0);

    // The upload: file into the client's folder, link + file id saved, owner given viewer access.
    begin();
    res = await recordsRoute.POST(req(records(demo), 'POST', uploadForm('Signed Agreement.pdf', 'application/pdf', pdf)), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200, JSON.stringify(body));
    assert.deepStrictEqual(actions(), ['upload_file', 'list_access', 'set_access'], 'upload, then the access sync');
    assert.deepStrictEqual(
      { folderId: calls[0].folderId, name: calls[0].name, mimeType: calls[0].mimeType, base64: calls[0].base64 },
      { folderId: 'demo_folder_0123456789', name: 'Signed-Agreement.pdf', mimeType: 'application/pdf', base64: Buffer.from(pdf).toString('base64') }
    );
    assert.ok(!('clientName' in calls[0]), 'no clientName: an old script cannot mistake an upload for a new client');
    const fileId = body.contract.drive_file_id as string;
    assert.ok(fileId.startsWith('contractfile'));
    assert.strictEqual(body.contract.document_url, `https://drive.google.com/file/d/${fileId}/view`);
    assert.strictEqual(body.contract.title, 'Service Agreement');
    assert.ok(!('driveAccessWarning' in body));
    let saved = (await contractRepository.listByTenant(demo)).find((c) => c.id === body.contract.id)!;
    assert.strictEqual(contractDriveFileId(saved), fileId, 'the Drive file id is kept with the contract (no new database column)');
    assert.deepStrictEqual(calls[2].changes, [{ id: fileId, email: 'john@abcroofing.com', role: 'viewer' }], 'the owner, and only the owner, is given viewer access');
    assert.deepStrictEqual(Array.from(drive.get(fileId)!.viewers), ['john@abcroofing.com']);
    assert.strictEqual(drive.get(fileId)!.editors.size, 0, 'nobody is added as editor on the contract; staff reach it through the folder');

    // The admin list and the client's Contract page know it is a Drive file.
    res = await recordsRoute.GET(req(records(demo)), ctx(demo));
    body = await res.json();
    assert.strictEqual(body.contracts.find((c: any) => c.id === saved.id).drive_file_id, fileId);
    assert.ok(!('drive_file_id' in body.contracts.find((c: any) => c.id === 'contract-1')));
    res = await portalContracts.GET(req(`/api/portal/${demo}/contracts`, 'GET', undefined, ownerCookie), portalCtx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ownerEmail, 'john@abcroofing.com');
    assert.strictEqual(body.contracts.find((c: any) => c.id === saved.id).is_drive_file, true);
    assert.strictEqual(body.contracts.find((c: any) => c.id === 'contract-1').is_drive_file, false);

    // Pasting a link works as before and never calls Google.
    begin();
    res = await recordsRoute.POST(req(records(demo), 'POST', { kind: 'contract', title: 'DocuSign copy', document_url: 'https://docusign.example/doc/1' }), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.contract.document_url, 'https://docusign.example/doc/1');
    assert.strictEqual(contractDriveFileId(body.contract), undefined);
    assert.strictEqual(calls.length, 0);
    res = await recordsRoute.DELETE(req(`${records(demo)}?kind=contract&recordId=${body.contract.id}`, 'DELETE'), ctx(demo));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0, 'removing a link contract does not touch Drive');

    // An old script: the upload is refused with a clear message and no contract is saved.
    scriptMode = 'old-unknown-action';
    const before = (await contractRepository.listByTenant(demo)).length;
    res = await recordsRoute.POST(req(records(demo), 'POST', uploadForm('b.pdf', 'application/pdf', pdf)), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 502);
    assert.ok(body.error.includes('needs updating'));
    assert.strictEqual((await contractRepository.listByTenant(demo)).length, before);
    scriptMode = 'new';

    // Removing an uploaded contract moves its file to the bin.
    begin();
    res = await recordsRoute.DELETE(req(`${records(demo)}?kind=contract&recordId=${saved.id}`, 'DELETE'), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(!('driveWarning' in body));
    assert.deepStrictEqual(calls.map((c) => ({ action: c.action, fileId: c.fileId })), [{ action: 'trash_file', fileId }]);
    assert.strictEqual(drive.get(fileId)!.trashed, true);
    assert.ok(!(await contractRepository.listByTenant(demo)).some((c) => c.id === saved.id));

    // If Drive cannot be reached the contract is still removed, with a warning.
    res = await recordsRoute.POST(req(records(demo), 'POST', uploadForm('c.pdf', 'application/pdf', pdf)), ctx(demo));
    saved = (await res.json()).contract;
    scriptMode = 'down';
    res = await recordsRoute.DELETE(req(`${records(demo)}?kind=contract&recordId=${saved.id}`, 'DELETE'), ctx(demo));
    body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(body.driveWarning.includes('still in Google Drive'));
    scriptMode = 'new';
    console.log(' PASS: contract upload: type and size checks, missing-folder message, link + file id saved, owner made viewer, removal bins the file.');

    // ================================================================ 8. nothing is ever made public
    assert.ok(allCalls.length > 40, 'the checks below look at every request of this test run');
    const allowedKeys: Record<string, string[]> = {
      provision: ['action', 'calculatorSheetId', 'clientEmail', 'clientName', 'folderId', 'secret', 'trackingSheetId'],
      rename: ['action', 'calculatorSheetId', 'clientName', 'folderId', 'secret', 'trackingSheetId'],
      list_access: ['action', 'ids', 'secret'],
      set_access: ['action', 'changes', 'secret'],
      upload_file: ['action', 'base64', 'folderId', 'mimeType', 'name', 'secret'],
      trash_file: ['action', 'fileId', 'secret'],
    };
    for (const call of allCalls) {
      assert.ok(allowedKeys[call.action], `unexpected action ${call.action}`);
      assert.deepStrictEqual(Object.keys(call).sort(), allowedKeys[call.action], `${call.action} sends only its own fields`);
      const sentText = JSON.stringify({ ...call, base64: undefined });
      assert.ok(!/anyone|public|link.?sharing|setSharing|domain/i.test(sentText), 'no request asks for link sharing');
      for (const change of call.changes || []) {
        assert.ok(['editor', 'viewer', 'none'].includes(change.role));
        assert.ok(/^[^@\s]+@[^@\s]+$/.test(change.email), 'access always goes to one named email address');
      }
    }
    const scriptSource = readFileSync('scripts/google-apps-script/create-client-sheet.gs', 'utf8');
    assert.ok(!/setSharing\s*\(|DriveApp\.Access\.|ANYONE/.test(scriptSource), 'the Apps Script never turns on link sharing');
    for (const action of ['list_access', 'set_access', 'upload_file', 'trash_file', 'provision', 'rename']) {
      assert.ok(scriptSource.includes(`action === '${action}'`), `the Apps Script handles ${action}`);
    }
    console.log(' PASS: no request and no script code ever sets "anyone with the link" sharing.');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_SHEETS_SCRIPT_URL;
    delete process.env.GOOGLE_SHEETS_SCRIPT_SECRET;
  }

  console.log('Drive Access Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
