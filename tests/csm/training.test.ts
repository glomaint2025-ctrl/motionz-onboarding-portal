import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running CSM Training Tests (lessons, unlock order, progress, access gate, video links)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore } = await import('../../src/lib/db');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { toVideoEmbed } = await import('../../src/lib/training/embed');
  const { auditActionLabel, AUDIT_ACTION_LABELS } = await import('../../src/lib/utils/log-labels');
  const { getNavGroups } = await import('../../src/components/layout/nav-config');
  const adminTraining = await import('../../src/app/api/admin/training/route');
  const csmTraining = await import('../../src/app/api/csm/training/route');
  const { GET: getCsmClients } = await import('../../src/app/api/csm/clients/route');
  const { GET: getCsmSetup } = await import('../../src/app/api/csm/clients/[id]/setup/route');
  const { GET: getPortalData } = await import('../../src/app/api/portal/[clientId]/data/route');
  const { GET: getPortalLeads } = await import('../../src/app/api/portal/[clientId]/leads/route');

  resetStore();
  let store = getStore();

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const csm2Cookie = createSessionToken('user-csm-2', 'csm.agent@motionz.ai', 'csm');
  const clientA = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;
  const clientCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', clientA);

  function req(path: string, method = 'GET', body?: unknown, cookie?: string | null) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const admin = {
    get: (cookie: string | null = adminCookie) => adminTraining.GET(req('/api/admin/training', 'GET', undefined, cookie)),
    post: (body: unknown, cookie: string | null = adminCookie) => adminTraining.POST(req('/api/admin/training', 'POST', body, cookie)),
    patch: (body: unknown, cookie: string | null = adminCookie) => adminTraining.PATCH(req('/api/admin/training', 'PATCH', body, cookie)),
    del: (body: unknown, cookie: string | null = adminCookie) => adminTraining.DELETE(req('/api/admin/training', 'DELETE', body, cookie)),
  };
  const adminPage = async () => (await admin.get()).json();
  const myTraining = async (cookie: string = csmCookie) => (await csmTraining.GET(req('/api/csm/training', 'GET', undefined, cookie))).json();
  const finish = (lessonId: unknown, cookie: string | null = csmCookie) =>
    csmTraining.POST(req('/api/csm/training', 'POST', { lessonId }, cookie));
  const clientList = (cookie: string) => getCsmClients(req('/api/csm/clients', 'GET', undefined, cookie));
  const clientSetup = (cookie: string) =>
    getCsmSetup(req(`/api/csm/clients/${clientA}/setup`, 'GET', undefined, cookie), { params: { id: clientA } } as any);
  const portalData = (cookie: string) =>
    getPortalData(req(`/api/portal/${clientA}/data`, 'GET', undefined, cookie), { params: { clientId: clientA } });
  const portalLeads = (cookie: string) =>
    getPortalLeads(req(`/api/portal/${clientA}/leads`, 'GET', undefined, cookie), { params: { clientId: clientA } } as any);
  const audits = (action: string) => store.auditLogs.filter((l) => l.action === action);
  const progressOf = async (userId: string) => (await adminPage()).progress.find((p: any) => p.id === userId);

  /** Every way a CSM reaches a client must answer the same way. */
  async function assertClientsBlocked(cookie: string, label: string) {
    for (const [name, call] of [
      ['client list', clientList],
      ['client setup', clientSetup],
      ['staff view of portal data', portalData],
      ['staff view of portal leads', portalLeads],
    ] as const) {
      const res = await call(cookie);
      assert.strictEqual(res.status, 403, `${label}: ${name} is refused`);
      const body = await res.json();
      assert.strictEqual(body.code, 'TRAINING_REQUIRED', `${label}: ${name} says why`);
      assert.match(body.error, /Finish your training/);
    }
  }
  async function assertClientsOpen(cookie: string, label: string) {
    for (const [name, call] of [
      ['client list', clientList],
      ['client setup', clientSetup],
      ['staff view of portal data', portalData],
      ['staff view of portal leads', portalLeads],
    ] as const) {
      assert.strictEqual((await call(cookie)).status, 200, `${label}: ${name} opens`);
    }
  }

  // ---------------------------------------------------------------- navigation
  const csmNav = getNavGroups('csm', '').flatMap((g) => g.items);
  assert.deepStrictEqual(csmNav.map((i) => i.label).slice(0, 2), ['My Clients', 'Training'], 'Training sits right under My Clients');
  assert.strictEqual(csmNav[1].href, '/csm/training');
  const adminConfig = getNavGroups('admin', '').find((g) => g.label === 'Configuration')!;
  assert.ok(adminConfig.items.some((i) => i.label === 'CSM Training' && i.href === '/admin/training'));
  assert.ok(!getNavGroups('client', 'x').flatMap((g) => g.items).some((i) => /training/i.test(i.label)), 'clients never see Training');
  console.log(' PASS: Training is in the CSM menu under My Clients; CSM Training is in the admin Configuration menu.');

  // ---------------------------------------------------------------- empty start
  let page = await adminPage();
  assert.strictEqual(page.available, true);
  assert.deepStrictEqual(page.lessons, []);
  assert.strictEqual(page.settings.required_for_csms, false, 'the requirement is off by default');
  assert.strictEqual(page.progress.length, 2, 'both CSMs are listed');
  assert.ok(page.progress.every((p: any) => p.status === 'not_started' && p.finished === 0 && p.total === 0 && p.lastActivity === null));
  let mine = await myTraining();
  assert.strictEqual(mine.available, true);
  assert.strictEqual(mine.total, 0);
  assert.strictEqual(mine.complete, false, 'no lessons is not "complete"');
  assert.strictEqual(mine.blocked, false);
  console.log(' PASS: starts empty, requirement off, nobody blocked.');

  // ---------------------------------------------------------------- access (admin only)
  const lessonBody = { title: 'Welcome', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', description: 'Start here.' };
  assert.strictEqual((await admin.get(null)).status, 401);
  assert.strictEqual((await admin.post(lessonBody, null)).status, 401);
  for (const cookie of [csmCookie, clientCookie]) {
    assert.strictEqual((await admin.get(cookie)).status, 403);
    assert.strictEqual((await admin.post(lessonBody, cookie)).status, 403);
    assert.strictEqual((await admin.patch({ action: 'update_settings', required_for_csms: true }, cookie)).status, 403);
    assert.strictEqual((await admin.patch({ action: 'set_exempt', userId: 'user-csm-1', exempt: true }, cookie)).status, 403);
    assert.strictEqual((await admin.patch({ action: 'reset_progress', userId: 'user-csm-2' }, cookie)).status, 403);
    assert.strictEqual((await admin.del({ id: 'anything' }, cookie)).status, 403);
  }
  assert.strictEqual(store.trainingLessons.length, 0, 'refused requests create nothing');
  assert.strictEqual(store.appSettings.length, 0, 'refused requests change no setting');
  assert.strictEqual((await csmTraining.GET(req('/api/csm/training'))).status, 401);
  assert.strictEqual((await csmTraining.GET(req('/api/csm/training', 'GET', undefined, clientCookie))).status, 403, 'clients have no training');
  assert.strictEqual((await finish('x', clientCookie)).status, 403);
  console.log(' PASS: only a CSM Manager can manage training; clients cannot open it.');

  // ---------------------------------------------------------------- validation
  const bad: [string, Record<string, unknown>][] = [
    ['no title', { ...lessonBody, title: '   ' }],
    ['title too long', { ...lessonBody, title: 'x'.repeat(201) }],
    ['title not text', { ...lessonBody, title: 42 }],
    ['no link', { ...lessonBody, video_url: '' }],
    ['http link', { ...lessonBody, video_url: 'http://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    ['javascript link', { ...lessonBody, video_url: 'javascript:alert(1)' }],
    ['not a link', { ...lessonBody, video_url: 'see the Notion page' }],
    ['link too long', { ...lessonBody, video_url: `https://example.com/${'a'.repeat(500)}` }],
    ['description too long', { ...lessonBody, description: 'd'.repeat(2001) }],
    ['description not text', { ...lessonBody, description: { a: 1 } }],
  ];
  for (const [label, body] of bad) {
    const res = await admin.post(body);
    assert.strictEqual(res.status, 400, `${label} is rejected`);
    assert.ok((await res.json()).error, `${label} explains itself`);
  }
  assert.strictEqual(store.trainingLessons.length, 0, 'invalid lessons are never stored');
  console.log(' PASS: lesson validation (title, https link, lengths).');

  // ---------------------------------------------------------------- create
  let res = await admin.post({ ...lessonBody, title: '  Welcome  ' });
  assert.strictEqual(res.status, 201);
  page = await res.json();
  assert.strictEqual(page.lesson.title, 'Welcome', 'the title is trimmed');
  assert.strictEqual(page.lesson.is_active, true);
  const l1 = page.lesson.id as string;
  assert.strictEqual(audits('training.lesson_created').length, 1);
  assert.strictEqual(audits('training.lesson_created')[0].actor_email, 'admin@motionz.ai');

  const l2 = (await (await admin.post({ title: 'Running a kickoff call', video_url: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef' })).json()).lesson.id as string;
  const l3 = (await (await admin.post({ title: 'Handling lead questions', video_url: 'https://vimeo.com/123456789', description: '' })).json()).lesson.id as string;
  page = await adminPage();
  assert.deepStrictEqual(page.lessons.map((l: any) => l.id), [l1, l2, l3], 'new lessons go to the end');
  assert.strictEqual(page.lessons[1].description, '', 'the description is optional');
  assert.strictEqual(page.activeLessons, 3);
  assert.strictEqual(store.trainingLessons.find((l) => l.id === l1)!.created_by, 'user-admin-1');

  // ---------------------------------------------------------------- edit
  res = await admin.patch({ action: 'update_lesson', id: l1, title: 'Welcome to Motionz', description: 'Watch this first.' });
  assert.strictEqual(res.status, 200);
  page = await res.json();
  assert.deepStrictEqual(page.changed.sort(), ['description', 'title']);
  assert.strictEqual(page.lessons[0].title, 'Welcome to Motionz');
  assert.strictEqual(page.lessons[0].video_url, lessonBody.video_url, 'fields that were not sent are kept');
  assert.strictEqual(audits('training.lesson_updated').length, 1);
  // Saving the same values again changes nothing and is not logged.
  page = await (await admin.patch({ action: 'update_lesson', id: l1, title: 'Welcome to Motionz' })).json();
  assert.deepStrictEqual(page.changed, []);
  assert.strictEqual(audits('training.lesson_updated').length, 1);
  assert.strictEqual((await admin.patch({ action: 'update_lesson', id: l1, title: '' })).status, 400);
  assert.strictEqual((await admin.patch({ action: 'update_lesson', id: l1, video_url: 'ftp://x.example/v' })).status, 400);
  assert.strictEqual((await admin.patch({ action: 'update_lesson', id: l1, is_active: 'no' })).status, 400);
  assert.strictEqual((await admin.patch({ action: 'update_lesson', id: 'missing', title: 'x' })).status, 404);
  assert.strictEqual((await admin.patch({ action: 'something_else' })).status, 400);
  assert.strictEqual(store.trainingLessons.find((l) => l.id === l1)!.title, 'Welcome to Motionz', 'rejected edits change nothing');
  console.log(' PASS: lessons can be added and edited; changes are audit-logged.');

  // ---------------------------------------------------------------- what a CSM sees, unlock order
  mine = await myTraining();
  assert.strictEqual(mine.total, 3);
  assert.strictEqual(mine.finished, 0);
  assert.deepStrictEqual(mine.lessons.map((l: any) => l.number), [1, 2, 3]);
  assert.deepStrictEqual(mine.lessons.map((l: any) => l.locked), [false, true, true], 'only lesson 1 is open at the start');
  assert.strictEqual(mine.lessons[0].video_url, lessonBody.video_url);
  assert.strictEqual(mine.lessons[1].video_url, null, 'a locked lesson does not give away its video link');
  assert.strictEqual(mine.preview, false);

  res = await finish(l2);
  assert.strictEqual(res.status, 409, 'lesson 2 cannot be finished before lesson 1');
  let body = await res.json();
  assert.strictEqual(body.code, 'LESSON_LOCKED');
  assert.strictEqual(body.error, 'Finish the previous lesson first.');
  assert.strictEqual((await finish(l3)).status, 409);
  assert.strictEqual((await finish('')).status, 400);
  assert.strictEqual((await finish(12345)).status, 400);
  assert.strictEqual((await finish('no-such-lesson')).status, 404);
  assert.strictEqual(store.trainingProgress.length, 0, 'nothing was recorded');

  res = await finish(l1);
  assert.strictEqual(res.status, 200);
  body = await res.json();
  assert.strictEqual(body.alreadyFinished, false);
  assert.strictEqual(body.finished, 1);
  assert.deepStrictEqual(body.lessons.map((l: any) => l.locked), [false, false, true], 'finishing lesson 1 unlocks lesson 2');
  assert.ok(body.lessons[0].finished_at, 'the finish date is shown');
  assert.strictEqual(body.lessons[1].video_url, 'https://www.loom.com/share/0123456789abcdef0123456789abcdef');
  const firstFinishedAt = body.finishedAt;
  assert.strictEqual(audits('training.lesson_finished').length, 1);
  assert.strictEqual(audits('training.lesson_finished')[0].actor_email, 'csm@motionz.ai');

  // Finishing twice is harmless: same date, one row, no second log entry.
  res = await finish(l1);
  assert.strictEqual(res.status, 200);
  body = await res.json();
  assert.strictEqual(body.alreadyFinished, true);
  assert.strictEqual(body.finishedAt, firstFinishedAt);
  assert.strictEqual(body.finished, 1);
  assert.strictEqual(store.trainingProgress.length, 1);
  assert.strictEqual(audits('training.lesson_finished').length, 1);

  // One CSM's progress is theirs alone.
  const other = await myTraining(csm2Cookie);
  assert.strictEqual(other.finished, 0);
  assert.deepStrictEqual(other.lessons.map((l: any) => l.locked), [false, true, true]);
  assert.ok(store.trainingProgress.every((p) => p.user_id === 'user-csm-1'), 'progress is always recorded for the signed-in person');
  console.log(' PASS: lessons unlock in order; finishing twice changes nothing.');

  // ---------------------------------------------------------------- progress numbers
  let row = await progressOf('user-csm-1');
  assert.deepStrictEqual([row.finished, row.total, row.status], [1, 3, 'in_progress']);
  assert.strictEqual(row.lastActivity, firstFinishedAt);
  assert.strictEqual(row.email, 'csm@motionz.ai');
  row = await progressOf('user-csm-2');
  assert.deepStrictEqual([row.finished, row.total, row.status, row.lastActivity], [0, 3, 'not_started', null]);
  console.log(' PASS: the progress table shows finished / total, last activity and status.');

  // ---------------------------------------------------------------- gate: OFF blocks nobody
  await assertClientsOpen(csmCookie, 'requirement off, training unfinished');
  assert.strictEqual((await clientList(csm2Cookie)).status, 200, 'a CSM who has not started is not blocked while it is off');

  // ---------------------------------------------------------------- gate: ON
  res = await admin.patch({ action: 'update_settings', required_for_csms: 'yes' });
  assert.strictEqual(res.status, 400);
  res = await admin.patch({ action: 'update_settings', required_for_csms: true });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).settings.required_for_csms, true);
  assert.strictEqual(audits('training.settings_updated').length, 1);
  await admin.patch({ action: 'update_settings', required_for_csms: true });
  assert.strictEqual(audits('training.settings_updated').length, 1, 'saving the same setting again is not logged');

  await assertClientsBlocked(csmCookie, 'requirement on, 1 of 3 finished');
  assert.strictEqual((await clientList(csm2Cookie)).status, 403, 'a CSM who has not started is blocked too');
  mine = await myTraining();
  assert.strictEqual(mine.blocked, true);
  assert.strictEqual(mine.required, true);
  assert.deepStrictEqual([mine.finished, mine.total], [1, 3], 'the Training page itself stays usable while clients are locked');

  // CSM Managers are never blocked, and neither are clients in their own portal.
  assert.strictEqual((await clientList(adminCookie)).status, 200);
  assert.strictEqual((await clientSetup(adminCookie)).status, 200);
  assert.strictEqual((await portalData(adminCookie)).status, 200);
  assert.strictEqual((await portalData(clientCookie)).status, 200);
  console.log(' PASS: with the requirement on, an unfinished CSM gets TRAINING_REQUIRED everywhere; admins and clients do not.');

  // Finishing the rest opens the clients again.
  assert.strictEqual((await finish(l3)).status, 409, 'still in order');
  assert.strictEqual((await finish(l2)).status, 200);
  await assertClientsBlocked(csmCookie, 'requirement on, 2 of 3 finished');
  body = await (await finish(l3)).json();
  assert.strictEqual(body.complete, true);
  assert.strictEqual(body.blocked, false);
  assert.deepStrictEqual([body.finished, body.total], [3, 3]);
  await assertClientsOpen(csmCookie, 'requirement on, training complete');
  row = await progressOf('user-csm-1');
  assert.deepStrictEqual([row.finished, row.total, row.status], [3, 3, 'complete']);
  console.log(' PASS: clients open again once every lesson is finished.');

  // ---------------------------------------------------------------- exemption
  assert.strictEqual((await clientList(csm2Cookie)).status, 403);
  assert.strictEqual((await admin.patch({ action: 'set_exempt', userId: 'user-csm-2' })).status, 400);
  assert.strictEqual((await admin.patch({ action: 'set_exempt', userId: 'user-admin-1', exempt: true })).status, 404, 'only CSMs can be exempt');
  assert.strictEqual((await admin.patch({ action: 'set_exempt', userId: 'nobody', exempt: true })).status, 404);
  res = await admin.patch({ action: 'set_exempt', userId: 'user-csm-2', exempt: true });
  assert.strictEqual(res.status, 200);
  page = await res.json();
  row = page.progress.find((p: any) => p.id === 'user-csm-2');
  assert.deepStrictEqual([row.exempt, row.status], [true, 'exempt']);
  assert.strictEqual(audits('training.exemption_changed').length, 1);
  assert.strictEqual((await clientList(csm2Cookie)).status, 200, 'an exempt CSM is let through');
  const exemptView = await myTraining(csm2Cookie);
  assert.deepStrictEqual([exemptView.exempt, exemptView.blocked], [true, false]);
  await admin.patch({ action: 'set_exempt', userId: 'user-csm-2', exempt: true });
  assert.strictEqual(audits('training.exemption_changed').length, 1, 'no change, no log entry');
  assert.strictEqual(store.appSettings.find((s) => s.key === 'training')!.value.exempt_user_ids.length, 1);

  res = await admin.patch({ action: 'set_exempt', userId: 'user-csm-2', exempt: false });
  assert.strictEqual((await res.json()).progress.find((p: any) => p.id === 'user-csm-2').status, 'not_started');
  assert.strictEqual((await clientList(csm2Cookie)).status, 403, 'removing the exemption locks them again');
  assert.strictEqual(audits('training.exemption_changed').length, 2);
  console.log(' PASS: a CSM Manager can let one CSM skip training, and take that back.');

  // ---------------------------------------------------------------- hidden lessons are not counted
  const l4 = (await (await admin.post({ title: 'Advanced: reporting', video_url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing' })).json()).lesson.id as string;
  await assertClientsBlocked(csmCookie, 'a new lesson was added');
  row = await progressOf('user-csm-1');
  assert.deepStrictEqual([row.finished, row.total, row.status], [3, 4, 'in_progress']);

  res = await admin.patch({ action: 'update_lesson', id: l4, is_active: false });
  page = await res.json();
  assert.deepStrictEqual(page.changed, ['is_active']);
  assert.strictEqual(page.activeLessons, 3);
  assert.strictEqual(page.lessons.length, 4, 'the CSM Manager still sees the hidden lesson');
  row = page.progress.find((p: any) => p.id === 'user-csm-1');
  assert.deepStrictEqual([row.finished, row.total, row.status], [3, 3, 'complete'], 'a hidden lesson is not counted');
  mine = await myTraining();
  assert.strictEqual(mine.total, 3);
  assert.ok(!mine.lessons.some((l: any) => l.id === l4), 'a CSM does not see a hidden lesson');
  assert.strictEqual((await finish(l4)).status, 404, 'a hidden lesson cannot be finished');
  await assertClientsOpen(csmCookie, 'the unfinished lesson is hidden');

  // Hiding a lesson someone finished takes it out of their numbers without losing it.
  await admin.patch({ action: 'update_lesson', id: l2, is_active: false });
  row = await progressOf('user-csm-1');
  assert.deepStrictEqual([row.finished, row.total], [2, 2]);
  await admin.patch({ action: 'update_lesson', id: l2, is_active: true });
  row = await progressOf('user-csm-1');
  assert.deepStrictEqual([row.finished, row.total, row.status], [3, 3, 'complete'], 'showing it again brings the progress back');
  console.log(' PASS: hidden lessons are not shown to CSMs and not counted.');

  // ---------------------------------------------------------------- reorder
  for (const ids of [[l1, l2], [l1, l2, l3, l3], [l1, l2, l3, 'nope'], 'l1', undefined]) {
    assert.strictEqual((await admin.patch({ action: 'reorder', ids })).status, 400, `order ${JSON.stringify(ids)} is rejected`);
  }
  res = await admin.patch({ action: 'reorder', ids: [l3, l1, l2, l4] });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual((await res.json()).lessons.map((l: any) => l.id), [l3, l1, l2, l4]);
  assert.strictEqual(audits('training.lesson_reordered').length, 1);
  await admin.patch({ action: 'reorder', ids: [l3, l1, l2, l4] });
  assert.strictEqual(audits('training.lesson_reordered').length, 1, 'the same order again is not logged');
  // The new order is what a CSM who has not started must follow.
  const reordered = await myTraining(csm2Cookie);
  assert.deepStrictEqual(reordered.lessons.map((l: any) => l.id), [l3, l1, l2]);
  assert.strictEqual((await finish(l1, csm2Cookie)).status, 409, 'the old first lesson is now second');
  assert.strictEqual((await finish(l3, csm2Cookie)).status, 200);
  console.log(' PASS: lessons can be reordered, and the new order is the unlock order.');

  // ---------------------------------------------------------------- manager preview
  const preview = await myTraining(adminCookie);
  assert.strictEqual(preview.preview, true);
  assert.ok(preview.lessons.every((l: any) => !l.locked && l.video_url), 'nothing is locked for a CSM Manager');
  assert.strictEqual(preview.blocked, false);
  assert.strictEqual((await finish(l2, adminCookie)).status, 200, 'a CSM Manager can click Finish while previewing');
  assert.ok(!(await adminPage()).progress.some((p: any) => p.id === 'user-admin-1'), 'CSM Managers are not in the CSM progress table');
  console.log(' PASS: a CSM Manager can preview the training with nothing locked.');

  // ---------------------------------------------------------------- reset progress
  assert.strictEqual((await admin.patch({ action: 'reset_progress' })).status, 400);
  assert.strictEqual((await admin.patch({ action: 'reset_progress', userId: 'user-admin-1' })).status, 404);
  res = await admin.patch({ action: 'reset_progress', userId: 'user-csm-1' });
  assert.strictEqual(res.status, 200);
  page = await res.json();
  assert.strictEqual(page.cleared, 3);
  row = page.progress.find((p: any) => p.id === 'user-csm-1');
  assert.deepStrictEqual([row.finished, row.total, row.status, row.lastActivity], [0, 3, 'not_started', null]);
  assert.strictEqual((await progressOf('user-csm-2')).finished, 1, "another CSM's progress is untouched");
  assert.strictEqual(audits('training.progress_reset').length, 1);
  assert.strictEqual(audits('training.progress_reset')[0].details?.lessonsCleared, 3);
  await assertClientsBlocked(csmCookie, 'progress was reset');
  mine = await myTraining();
  assert.deepStrictEqual(mine.lessons.map((l: any) => l.locked), [false, true, true], 'they start again from lesson 1');
  console.log(' PASS: resetting a CSM clears their progress and locks their clients again.');

  // ---------------------------------------------------------------- delete
  assert.strictEqual((await admin.del({})).status, 404);
  assert.strictEqual((await admin.del({ id: 'missing' })).status, 404);
  assert.ok(store.trainingProgress.some((p) => p.lesson_id === l3 && p.user_id === 'user-csm-2'));
  res = await admin.del({ id: l3 });
  assert.strictEqual(res.status, 200);
  page = await res.json();
  assert.deepStrictEqual(page.lessons.map((l: any) => l.id), [l1, l2, l4]);
  store = getStore();
  assert.ok(!store.trainingProgress.some((p) => p.lesson_id === l3), "deleting a lesson removes everyone's progress for it");
  assert.strictEqual(audits('training.lesson_deleted').length, 1);
  assert.strictEqual(audits('training.lesson_deleted')[0].details?.lesson, 'Handling lead questions');
  assert.strictEqual((await progressOf('user-csm-2')).finished, 0);

  // ---------------------------------------------------------------- zero active lessons blocks nobody
  await admin.patch({ action: 'update_lesson', id: l1, is_active: false });
  await admin.patch({ action: 'update_lesson', id: l2, is_active: false });
  page = await adminPage();
  assert.strictEqual(page.activeLessons, 0);
  assert.strictEqual(page.settings.required_for_csms, true);
  await assertClientsOpen(csmCookie, 'requirement on but no visible lessons');
  mine = await myTraining();
  assert.deepStrictEqual([mine.total, mine.blocked, mine.complete], [0, false, false]);
  await admin.del({ id: l1 });
  await admin.del({ id: l2 });
  await admin.del({ id: l4 });
  assert.strictEqual((await adminPage()).lessons.length, 0);
  await assertClientsOpen(csmCookie, 'requirement on but no lessons at all');
  console.log(' PASS: deleting works; with no visible lessons nobody is blocked.');

  // ---------------------------------------------------------------- missing tables fail soft
  await admin.post(lessonBody);
  await assertClientsBlocked(csmCookie, 'requirement on, one new lesson');
  store = getStore();
  const savedLessons = store.trainingLessons;
  const savedProgress = store.trainingProgress;
  delete (store as any).trainingLessons;
  delete (store as any).trainingProgress;

  mine = await myTraining();
  assert.strictEqual(mine.success, true);
  assert.strictEqual(mine.available, false);
  assert.strictEqual(mine.message, 'Training is not set up yet.');
  assert.strictEqual(mine.blocked, false);
  await assertClientsOpen(csmCookie, 'training tables missing (requirement on)');
  res = await finish('anything');
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).error, 'Training is not set up yet.');

  res = await admin.get();
  assert.strictEqual(res.status, 200, 'the admin page still loads');
  page = await res.json();
  assert.strictEqual(page.available, false);
  assert.match(page.message, /database step/);
  assert.deepStrictEqual(page.lessons, []);
  res = await admin.post(lessonBody);
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).code, 'TRAINING_UNAVAILABLE');
  assert.strictEqual((await admin.patch({ action: 'reset_progress', userId: 'user-csm-1' })).status, 503);
  assert.strictEqual((await admin.del({ id: 'x' })).status, 503);

  store.trainingLessons = savedLessons;
  store.trainingProgress = savedProgress;
  await assertClientsBlocked(csmCookie, 'tables are back');
  console.log(' PASS: before the database step is run, training says "not set up yet" and nobody is locked out.');

  // A stored setting that is not a clear "on" reads as off.
  store.appSettings.find((s) => s.key === 'training')!.value = { required_for_csms: 'true', exempt_user_ids: 'user-csm-1' };
  await assertClientsOpen(csmCookie, 'malformed stored setting');
  assert.strictEqual((await adminPage()).settings.required_for_csms, false);

  // ---------------------------------------------------------------- video links
  const embed = (link: string) => toVideoEmbed(link);
  const src = (link: string) => {
    const video = embed(link);
    return video && video.kind === 'embed' ? video.src : null;
  };
  const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  assert.strictEqual(src('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), YT);
  assert.strictEqual(src('https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2'), YT);
  assert.strictEqual(src('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), YT);
  assert.strictEqual(src('https://youtu.be/dQw4w9WgXcQ'), YT);
  assert.strictEqual(src('https://youtu.be/dQw4w9WgXcQ?si=abcDEF123'), YT);
  assert.strictEqual(src('https://www.youtube.com/shorts/dQw4w9WgXcQ'), YT);
  assert.strictEqual(src('https://www.youtube.com/embed/dQw4w9WgXcQ'), YT);
  assert.strictEqual(src('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'), YT);
  assert.strictEqual(src('https://youtu.be/dQw4w9WgXcQ?t=90'), `${YT}?start=90`);
  assert.strictEqual(src('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s'), `${YT}?start=90`);
  assert.strictEqual(src('  https://youtu.be/dQw4w9WgXcQ  '), YT, 'spaces around a pasted link are ignored');

  const LOOM = 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef';
  assert.strictEqual(src('https://www.loom.com/share/0123456789abcdef0123456789abcdef'), LOOM);
  assert.strictEqual(src('https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=1234-abcd'), LOOM);
  assert.strictEqual(src('https://loom.com/embed/0123456789abcdef0123456789abcdef'), LOOM);

  assert.strictEqual(src('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.strictEqual(src('https://vimeo.com/123456789/abcdef1234'), 'https://player.vimeo.com/video/123456789?h=abcdef1234');
  assert.strictEqual(src('https://player.vimeo.com/video/123456789?h=abcdef1234'), 'https://player.vimeo.com/video/123456789?h=abcdef1234');
  assert.strictEqual(src('https://vimeo.com/channels/staffpicks/123456789'), 'https://player.vimeo.com/video/123456789');

  const DRIVE = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/preview';
  assert.strictEqual(src('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing'), DRIVE);
  assert.strictEqual(src('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/preview'), DRIVE);
  assert.strictEqual(src('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345'), DRIVE);

  // Anything else that is https opens in a new tab; anything that is not https is not a video link.
  assert.deepStrictEqual(embed('https://www.notion.so/motionz/Training-123'), { kind: 'link', href: 'https://www.notion.so/motionz/Training-123' });
  assert.strictEqual(embed('https://www.youtube.com/@motionz')?.kind, 'link', 'a YouTube page that is not a video is a plain link');
  assert.strictEqual(embed('https://evil.example/watch?v=dQw4w9WgXcQ')?.kind, 'link', 'a look-alike address is never embedded');
  assert.strictEqual(embed('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')?.kind, 'link');
  for (const notALink of ['http://youtu.be/dQw4w9WgXcQ', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'youtu.be/dQw4w9WgXcQ', '', null, undefined, 42]) {
    assert.strictEqual(toVideoEmbed(notALink), null, `${JSON.stringify(notALink)} is not a video link`);
  }
  // Every address the page may embed is allowed by the site's content security policy.
  const nextConfig = (await import('../../next.config.js')).default as any;
  const csp = (await nextConfig.headers())[0].headers.find((h: any) => h.key === 'Content-Security-Policy').value as string;
  const frameSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('frame-src'))!;
  for (const link of [YT, LOOM, 'https://player.vimeo.com/video/123456789', DRIVE]) {
    assert.ok(frameSrc.includes(new URL(link).origin), `frame-src allows ${new URL(link).origin}`);
  }
  console.log(' PASS: YouTube, Loom, Vimeo and Drive links become embeds; other https links open in a new tab.');

  // ---------------------------------------------------------------- friendly log labels
  for (const action of [
    'training.lesson_finished',
    'training.lesson_created',
    'training.lesson_updated',
    'training.lesson_deleted',
    'training.lesson_reordered',
    'training.settings_updated',
    'training.progress_reset',
    'training.exemption_changed',
  ]) {
    assert.ok(audits(action).length >= 1, `${action} was written to the audit log`);
    assert.ok(AUDIT_ACTION_LABELS[action], `${action} has a friendly label`);
    assert.strictEqual(auditActionLabel(action), AUDIT_ACTION_LABELS[action]);
  }
  console.log(' PASS: every training action is audit-logged with a friendly label.');

  console.log('CSM Training Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
