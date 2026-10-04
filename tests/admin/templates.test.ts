import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Admin Master Templates Tests...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore } = await import('../../src/lib/db');
  const { portalTemplateRepository, scriptRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { validateTemplateStepUpdate, validateScriptTemplateUpdate } = await import('../../src/lib/validation/templates');
  const { GET: getTemplates } = await import('../../src/app/api/admin/templates/route');
  const { PUT: putStep } = await import('../../src/app/api/admin/templates/steps/[stepKey]/route');
  const { PUT: putScript } = await import('../../src/app/api/admin/templates/scripts/[id]/route');
  const { GET: getPortalScripts } = await import('../../src/app/api/portal/[clientId]/script-templates/route');

  resetStore();

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const clientCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', 'tenant-demo-abc-roofing');

  function req(path: string, method: string, body?: unknown, cookie?: string) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  // --- Repository: updateStep ---
  const before = await portalTemplateRepository.getDefaultTemplate();
  assert.ok(before.steps.length >= 1, 'default template should have steps');
  const firstKey = before.steps[0].step_key;

  const updatedStep = await portalTemplateRepository.updateStep(firstKey, {
    name: 'Tracking Sheet',
    right_now: 'Sheet is being prepared.',
  });
  assert.ok(updatedStep);
  assert.strictEqual(updatedStep!.name, 'Tracking Sheet');
  assert.strictEqual(updatedStep!.right_now, 'Sheet is being prepared.');
  assert.strictEqual(updatedStep!.step_key, firstKey, 'step_key is not editable');
  const after = await portalTemplateRepository.getDefaultTemplate();
  assert.strictEqual(after.steps[0].name, 'Tracking Sheet', 'update persisted in store');
  assert.strictEqual(await portalTemplateRepository.updateStep('does_not_exist', { name: 'x' }), null);
  // Non-editable keys are ignored
  await portalTemplateRepository.updateStep(firstKey, { sort_order: 99, step_key: 'hacked' } as any);
  assert.strictEqual(getStore().templateSteps.find((s) => s.id === updatedStep!.id)!.sort_order, before.steps[0].sort_order);
  assert.strictEqual(getStore().templateSteps.find((s) => s.id === updatedStep!.id)!.step_key, firstKey);
  console.log(' PASS: portalTemplateRepository.updateStep updates copy fields only.');

  // --- Repository: updateTemplate ---
  const scripts = await scriptRepository.listTemplates();
  assert.ok(scripts.length >= 1);
  const scriptId = scripts[0].id;
  const updatedScript = await scriptRepository.updateTemplate(scriptId, {
    title: 'Intro Script',
    script_content: 'Hi, {{client_name}} from {{company_name}}.',
  });
  assert.ok(updatedScript);
  assert.strictEqual(updatedScript!.title, 'Intro Script');
  assert.strictEqual((await scriptRepository.findTemplateById(scriptId))!.script_content, 'Hi, {{client_name}} from {{company_name}}.');
  assert.strictEqual(await scriptRepository.updateTemplate('missing-id', { title: 'x' }), null);
  assert.strictEqual(updatedScript!.category, 'ai_video', 'editing title/content keeps the category');
  const libraryCategories = new Set(scripts.map((s) => s.category));
  for (const category of ['ai_video', 'pain_point', 'testimonials', 'trustworthy', 'bonus']) {
    assert.ok(libraryCategories.has(category as any), `seeded library includes ${category}`);
  }
  const recategorised = await scriptRepository.updateTemplate(scripts[scripts.length - 1].id, { category: 'pain_point' });
  assert.strictEqual(recategorised!.category, 'pain_point');
  console.log(' PASS: scriptRepository.updateTemplate persists title, content and category.');

  // --- Validation ---
  assert.strictEqual(validateTemplateStepUpdate({ name: '   ' }).ok, false);
  assert.strictEqual(validateTemplateStepUpdate({ name: 'a'.repeat(256) }).ok, false);
  assert.strictEqual(validateTemplateStepUpdate({ owner: 'someone' }).ok, false);
  assert.strictEqual(validateTemplateStepUpdate({}).ok, false);
  assert.strictEqual(validateTemplateStepUpdate({ owner: 'client_action' }).ok, true);
  assert.strictEqual(validateScriptTemplateUpdate({ title: '' }).ok, false);
  assert.strictEqual(validateScriptTemplateUpdate({ script_content: 'x'.repeat(5001) }).ok, false);
  const alias = validateScriptTemplateUpdate({ content: ' Body ' });
  assert.ok(alias.ok && alias.value.script_content === 'Body');
  assert.strictEqual(validateScriptTemplateUpdate({ category: 'not_a_category' }).ok, false);
  const categoryOnly = validateScriptTemplateUpdate({ category: 'trustworthy' });
  assert.ok(categoryOnly.ok && categoryOnly.value.category === 'trustworthy');
  console.log(' PASS: input validation rejects empty, oversized and invalid values.');

  // --- API guards ---
  assert.strictEqual((await getTemplates(req('/api/admin/templates', 'GET'))).status, 401);
  assert.strictEqual((await getTemplates(req('/api/admin/templates', 'GET', undefined, csmCookie))).status, 403);
  assert.strictEqual((await getTemplates(req('/api/admin/templates', 'GET', undefined, clientCookie))).status, 403);
  assert.strictEqual(
    (await putStep(req(`/api/admin/templates/steps/${firstKey}`, 'PUT', { name: 'X' }), { params: { stepKey: firstKey } })).status,
    401
  );
  assert.strictEqual(
    (await putStep(req(`/api/admin/templates/steps/${firstKey}`, 'PUT', { name: 'X' }, csmCookie), { params: { stepKey: firstKey } })).status,
    403
  );
  assert.strictEqual(
    (await putScript(req(`/api/admin/templates/scripts/${scriptId}`, 'PUT', { title: 'X' }, clientCookie), { params: { id: scriptId } })).status,
    403
  );
  assert.strictEqual(getStore().templateSteps.find((s) => s.step_key === firstKey)!.name, 'Tracking Sheet', 'denied write must not change data');
  console.log(' PASS: non-admins are rejected (401/403) and cannot write.');

  // --- API: admin GET ---
  const getRes = await getTemplates(req('/api/admin/templates', 'GET', undefined, adminCookie));
  assert.strictEqual(getRes.status, 200);
  const getBody = await getRes.json();
  assert.ok(getBody.template && getBody.template.is_default);
  assert.strictEqual(getBody.steps.length, after.steps.length);
  assert.strictEqual(getBody.scripts.length, scripts.length);
  console.log(' PASS: GET /api/admin/templates returns template, steps and scripts.');

  // --- API: admin PUT step ---
  const auditCountBefore = getStore().auditLogs.length;
  const stepRes = await putStep(
    req(`/api/admin/templates/steps/${firstKey}`, 'PUT', { unlocks: 'Live tracking.', owner: 'client_action' }, adminCookie),
    { params: { stepKey: firstKey } }
  );
  assert.strictEqual(stepRes.status, 200);
  const stepBody = await stepRes.json();
  assert.strictEqual(stepBody.step.unlocks, 'Live tracking.');
  assert.strictEqual(stepBody.step.owner, 'client_action');
  assert.ok(
    getStore().auditLogs.length > auditCountBefore &&
      getStore().auditLogs.some((l) => l.action === 'template.step_updated' && l.resource_id === stepBody.step.id),
    'audit log written for step update'
  );
  assert.strictEqual(
    (await putStep(req(`/api/admin/templates/steps/${firstKey}`, 'PUT', { name: '' }, adminCookie), { params: { stepKey: firstKey } })).status,
    400
  );
  assert.strictEqual(
    (await putStep(req('/api/admin/templates/steps/nope', 'PUT', { name: 'Y' }, adminCookie), { params: { stepKey: 'nope' } })).status,
    404
  );
  assert.strictEqual(
    (await putStep(req('/api/admin/templates/steps/BAD-KEY', 'PUT', { name: 'Y' }, adminCookie), { params: { stepKey: 'BAD KEY!' } })).status,
    400
  );
  assert.strictEqual(
    (await putStep(req(`/api/admin/templates/steps/${firstKey}`, 'PUT', '{not json', adminCookie), { params: { stepKey: firstKey } })).status,
    400
  );
  console.log(' PASS: PUT /api/admin/templates/steps/[stepKey] validates, saves and audits.');

  // --- API: admin PUT script ---
  const scriptRes = await putScript(
    req(`/api/admin/templates/scripts/${scriptId}`, 'PUT', { title: 'Brand Story', content: 'I am {{client_name}}.' }, adminCookie),
    { params: { id: scriptId } }
  );
  assert.strictEqual(scriptRes.status, 200);
  const scriptBody = await scriptRes.json();
  assert.strictEqual(scriptBody.script.title, 'Brand Story');
  assert.strictEqual(scriptBody.script.script_content, 'I am {{client_name}}.');
  assert.ok(getStore().auditLogs.some((l) => l.action === 'template.script_updated' && l.resource_id === scriptId));
  assert.strictEqual(
    (await putScript(req(`/api/admin/templates/scripts/${scriptId}`, 'PUT', { title: 'x'.repeat(300) }, adminCookie), { params: { id: scriptId } })).status,
    400
  );
  assert.strictEqual(
    (await putScript(req('/api/admin/templates/scripts/missing', 'PUT', { title: 'Y' }, adminCookie), { params: { id: 'missing' } })).status,
    404
  );
  console.log(' PASS: PUT /api/admin/templates/scripts/[id] validates, saves and audits.');

  // --- Portal: scripts come from the DB ---
  const anonPortal = await getPortalScripts(req('/api/portal/demo/script-templates', 'GET'), { params: { clientId: 'demo' } });
  if (process.env.NODE_ENV !== 'production') {
    assert.strictEqual(anonPortal.status, 200, 'anonymous demo read allowed outside production');
  }
  const portalRes = await getPortalScripts(
    req('/api/portal/demo/script-templates', 'GET', undefined, adminCookie),
    { params: { clientId: 'demo' } }
  );
  assert.strictEqual(portalRes.status, 200);
  const portalBody = await portalRes.json();
  assert.ok(portalBody.scripts.some((s: any) => s.id === scriptId && s.title === 'Brand Story'), 'portal reflects admin edit');
  const unknownTenant = await getPortalScripts(
    req('/api/portal/no-such-tenant/script-templates', 'GET', undefined, clientCookie),
    { params: { clientId: 'no-such-tenant' } }
  );
  assert.strictEqual(unknownTenant.status, 404);
  console.log(' PASS: GET /api/portal/[clientId]/script-templates serves DB templates.');

  resetStore();
  console.log('All Admin Master Templates tests passed.');
}

run().catch((err) => {
  console.error('Admin Master Templates tests FAILED:', err);
  process.exit(1);
});
