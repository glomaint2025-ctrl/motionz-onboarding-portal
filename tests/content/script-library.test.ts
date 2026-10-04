import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running Script Library Tests...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, getTenantById } = await import('../../src/lib/db');
  const { scriptRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const {
    AD_SCRIPT_LIBRARY,
    SELF_FILMED_CATEGORIES,
    REQUIRED_SCRIPT_CATEGORIES,
    EDUCATIONAL_SCRIPT_IDS,
    sanitizeSelectedScripts,
  } = await import('../../src/lib/scripts/ad-script-library');
  const { generateScriptsFromTemplates, estimateReadSeconds, TESTIMONIAL_NAME_PLACEHOLDER } = await import(
    '../../src/lib/scripts/template-engine'
  );
  const { GET: getPortalScripts } = await import('../../src/app/api/portal/[clientId]/script-templates/route');
  const { GET: getPref, POST: postPref } = await import('../../src/app/api/portal/[clientId]/video-preference/route');
  const { POST: createScript } = await import('../../src/app/api/admin/templates/scripts/route');
  const { PUT: putScript, DELETE: deleteScript } = await import('../../src/app/api/admin/templates/scripts/[id]/route');

  resetStore();

  const clientId = 'abc-roofing';
  const tenant = await getTenantById(clientId);
  assert.ok(tenant, 'demo tenant must exist');
  const ctx = { params: { clientId } };

  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const ownerCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const memberCookie = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenant!.id);

  function req(path: string, method: string, body?: unknown, cookie?: string) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const prefPath = `/api/portal/${clientId}/video-preference`;

  // --- 1. Library shape: every category is present ---
  const all = await scriptRepository.listTemplates();
  const count = (category: string) => all.filter((t) => t.category === category).length;
  assert.strictEqual(count('ai_video'), 3, 'the 3 educational scripts are kept as ai_video');
  assert.strictEqual(count('pain_point'), 5);
  assert.strictEqual(count('testimonials'), 5);
  assert.strictEqual(count('trustworthy'), 5);
  assert.strictEqual(count('bonus'), 5, 'Bonus #1-#4 plus the second "Bonus #4" imported as Bonus #5');
  assert.strictEqual(AD_SCRIPT_LIBRARY.length, 20);
  assert.ok(all.some((t) => t.title === 'Bonus #5'));
  assert.strictEqual(new Set(all.map((t) => t.id)).size, all.length, 'script ids are unique');
  assert.strictEqual(new Set(all.map((t) => t.sort_order)).size, all.length, 'sort orders are unique');
  for (const script of AD_SCRIPT_LIBRARY) {
    assert.match(script.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'deterministic UUID');
  }
  console.log(' PASS: library has ai_video (3) + Pain Point, Testimonials, Trustworthy, Bonus (5 each).');

  // --- 2. Placeholders: doc placeholders converted to tokens, tokens filled per client ---
  for (const script of AD_SCRIPT_LIBRARY) {
    assert.ok(!/\[(Company Name|Company|Name|TESTIMONIAL)\]|\(company name\)/i.test(script.script_content), `${script.title}: raw doc placeholder left`);
    assert.ok(!script.script_content.includes('**'), `${script.title}: markdown left in script`);
    const tokens = script.script_content.match(/\{\{[^}]*\}\}/g) || [];
    for (const token of tokens) {
      assert.ok(['{{company_name}}', '{{client_name}}', '{{testimonial_name}}'].includes(token), `unknown token ${token}`);
    }
  }
  const byTitle = (title: string) => AD_SCRIPT_LIBRARY.find((s) => s.title === title)!;
  assert.ok(byTitle('Testimonials #1').script_content.startsWith('Hey, this is {{client_name}} from {{company_name}}.'));
  assert.ok(byTitle('Testimonials #3').script_content.endsWith('applying nano technology with {{company_name}}.'));
  assert.ok(byTitle('Pain Point #1').script_content.includes('With {{company_name}}, we don’t replace roofs'));
  assert.ok(byTitle('Trustworthy #5').script_content.includes('\nBONUS: Book this month'), 'BONUS lines are kept');
  assert.ok(byTitle('Bonus #5').script_content.includes('homeowners like {{testimonial_name}} have saved up to $14,000'));

  const rendered = generateScriptsFromTemplates(all, { client_name: 'John Smith', company_name: 'ABC Roofing' });
  for (const script of rendered) {
    assert.ok(!script.content.includes('{{'), `${script.title}: unreplaced token`);
  }
  const renderedByTitle = (title: string) => rendered.find((s) => s.title === title)!;
  assert.ok(renderedByTitle('Testimonials #1').content.startsWith('Hey, this is John Smith from ABC Roofing.'));
  assert.ok(renderedByTitle('Bonus #5').content.includes(`homeowners like ${TESTIMONIAL_NAME_PLACEHOLDER} have saved`));
  assert.strictEqual(renderedByTitle('Pain Point #3').category, 'pain_point');
  assert.strictEqual(estimateReadSeconds('word '.repeat(150)), 60, '150 words is about one minute');
  assert.strictEqual(estimateReadSeconds('   '), 0);
  console.log(' PASS: placeholders are tokens in storage and filled with the client name/company.');

  // --- 3. Migration SQL mirrors the library and is non-destructive ---
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261004000001_ad_script_library.sql'), 'utf8')
    .replace(/\r\n/g, '\n'); // tolerate CRLF checkouts on Windows
  for (const script of AD_SCRIPT_LIBRARY) {
    assert.ok(sql.includes(`'${script.id}'`), `${script.title}: id missing from migration`);
    assert.ok(sql.includes(`$script$${script.script_content}$script$`), `${script.title}: text differs from migration`);
  }
  for (const id of EDUCATIONAL_SCRIPT_IDS) assert.ok(sql.includes(`'${id}'`));
  assert.ok(/ADD COLUMN IF NOT EXISTS category/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS selected_scripts JSONB/.test(sql));
  assert.ok(/SET category = 'ai_video'/.test(sql), 'original scripts are re-categorised');
  assert.ok(!/DELETE\s+FROM/i.test(sql), 'migration must not delete the original scripts');
  assert.ok(/ON CONFLICT \(id\) DO NOTHING/.test(sql));
  console.log(' PASS: migration matches the library, keeps the 3 original scripts and is idempotent.');

  // --- 4. Portal API exposes the category ---
  const portalRes = await getPortalScripts(req(`/api/portal/${clientId}/script-templates`, 'GET', undefined, memberCookie), ctx);
  assert.strictEqual(portalRes.status, 200);
  const portalBody = await portalRes.json();
  assert.strictEqual(portalBody.scripts.length, 23);
  for (const category of ['ai_video', ...SELF_FILMED_CATEGORIES]) {
    assert.ok(portalBody.scripts.some((s: any) => s.category === category), `portal lists ${category}`);
  }
  console.log(' PASS: portal script-templates returns every category (team members can read).');

  // --- 5. Picks: one per category, saved server-side ---
  const pick = (category: string, n = 0) => all.filter((t) => t.category === category)[n].id;
  const firstPicks = { pain_point: pick('pain_point'), testimonials: pick('testimonials') };
  const saveRes = await postPref(req(prefPath, 'POST', { selected_scripts: firstPicks }, ownerCookie), ctx);
  assert.strictEqual(saveRes.status, 200);
  assert.deepStrictEqual((await saveRes.json()).selected_scripts, firstPicks);

  let prefBody = await (await getPref(req(prefPath, 'GET', undefined, ownerCookie), ctx)).json();
  assert.deepStrictEqual(prefBody.selected_scripts, firstPicks, '2 of 3 chosen is persisted');
  assert.strictEqual(prefBody.preference.video_preference, 'ai_video', 'saving picks does not change the production choice');

  // Choosing another script in the same category replaces the pick (never two per category).
  const fullPicks = {
    pain_point: pick('pain_point', 2),
    testimonials: pick('testimonials'),
    trustworthy: pick('trustworthy', 4),
    bonus: pick('bonus', 1),
  };
  assert.strictEqual((await postPref(req(prefPath, 'POST', { selected_scripts: fullPicks }, ownerCookie), ctx)).status, 200);
  prefBody = await (await getPref(req(prefPath, 'GET', undefined, ownerCookie), ctx)).json();
  assert.deepStrictEqual(prefBody.selected_scripts, fullPicks);
  assert.strictEqual(REQUIRED_SCRIPT_CATEGORIES.filter((c) => prefBody.selected_scripts[c]).length, 3);
  assert.ok(getStore().auditLogs.some((l) => l.action === 'client.script_picks_updated'), 'picks are audited');

  // Saving the production choice keeps the picks.
  assert.strictEqual((await postPref(req(prefPath, 'POST', { video_preference: 'self_filmed' }, ownerCookie), ctx)).status, 200);
  prefBody = await (await getPref(req(prefPath, 'GET', undefined, ownerCookie), ctx)).json();
  assert.strictEqual(prefBody.preference.video_preference, 'self_filmed');
  assert.deepStrictEqual(prefBody.selected_scripts, fullPicks);

  // Invalid picks are rejected and change nothing.
  const invalid: Array<[string, unknown]> = [
    ['script from another category', { selected_scripts: { pain_point: pick('testimonials') } }],
    ['unknown script id', { selected_scripts: { pain_point: 'no-such-script' } }],
    ['unknown category', { selected_scripts: { other: pick('bonus') } }],
    ['ai_video is not pickable', { selected_scripts: { ai_video: pick('ai_video') } }],
    ['two scripts in one category', { selected_scripts: { pain_point: [pick('pain_point'), pick('pain_point', 1)] } }],
    ['not an object', { selected_scripts: [pick('pain_point')] }],
    ['empty body', {}],
    ['bad production choice', { video_preference: 'undecided' }],
  ];
  for (const [label, body] of invalid) {
    assert.strictEqual((await postPref(req(prefPath, 'POST', body, ownerCookie), ctx)).status, 400, `${label} must be 400`);
  }
  prefBody = await (await getPref(req(prefPath, 'GET', undefined, ownerCookie), ctx)).json();
  assert.deepStrictEqual(prefBody.selected_scripts, fullPicks, 'rejected writes change nothing');

  // A pick can be cleared with null.
  assert.strictEqual(
    (await postPref(req(prefPath, 'POST', { selected_scripts: { ...fullPicks, bonus: null } }, ownerCookie), ctx)).status,
    200
  );
  const { bonus: _dropped, ...withoutBonus } = fullPicks;
  prefBody = await (await getPref(req(prefPath, 'GET', undefined, ownerCookie), ctx)).json();
  assert.deepStrictEqual(prefBody.selected_scripts, withoutBonus);
  console.log(' PASS: picks are saved one per category, validated, audited and independent of the production choice.');

  // --- 6. Team members and anonymous users cannot save picks ---
  const memberSave = await postPref(req(prefPath, 'POST', { selected_scripts: { pain_point: pick('pain_point') } }, memberCookie), ctx);
  assert.strictEqual(memberSave.status, 403, 'team member cannot save picks');
  assert.strictEqual((await postPref(req(prefPath, 'POST', { selected_scripts: {} }), ctx)).status, 401);
  const memberRead = await getPref(req(prefPath, 'GET', undefined, memberCookie), ctx);
  assert.strictEqual(memberRead.status, 200, 'team member can read picks');
  assert.deepStrictEqual((await memberRead.json()).selected_scripts, withoutBonus, 'denied write changed nothing');
  console.log(' PASS: team members read picks but cannot save them; anonymous writes are rejected.');

  // --- 7. Admin add / edit category / delete ---
  const newScript = { title: 'Pain Point #6', script_content: 'New script for {{company_name}}.', category: 'pain_point' };
  for (const cookie of [undefined, csmCookie, ownerCookie, memberCookie]) {
    const expected = cookie ? 403 : 401;
    assert.strictEqual((await createScript(req('/api/admin/templates/scripts', 'POST', newScript, cookie))).status, expected);
    assert.strictEqual(
      (await deleteScript(req(`/api/admin/templates/scripts/${fullPicks.trustworthy}`, 'DELETE', undefined, cookie), {
        params: { id: fullPicks.trustworthy },
      })).status,
      expected
    );
  }
  assert.strictEqual((await scriptRepository.listTemplates()).length, 23, 'non-admins changed nothing');
  console.log(' PASS: non-admins cannot add or delete scripts.');

  for (const bad of [
    { title: 'No category', script_content: 'x' },
    { title: 'Bad category', script_content: 'x', category: 'sales' },
    { title: '', script_content: 'x', category: 'bonus' },
    { title: 'No content', category: 'bonus' },
  ]) {
    assert.strictEqual((await createScript(req('/api/admin/templates/scripts', 'POST', bad, adminCookie))).status, 400);
  }

  const createRes = await createScript(req('/api/admin/templates/scripts', 'POST', newScript, adminCookie));
  assert.strictEqual(createRes.status, 201);
  const created = (await createRes.json()).script;
  assert.strictEqual(created.category, 'pain_point');
  assert.strictEqual(created.sort_order, 106, 'new script goes after the last one in its category');
  assert.ok(getStore().auditLogs.some((l) => l.action === 'template.script_created' && l.resource_id === created.id));
  assert.strictEqual((await scriptRepository.listTemplates()).filter((t) => t.category === 'pain_point').length, 6);

  const moveRes = await putScript(req(`/api/admin/templates/scripts/${created.id}`, 'PUT', { category: 'bonus' }, adminCookie), {
    params: { id: created.id },
  });
  assert.strictEqual(moveRes.status, 200);
  assert.strictEqual((await moveRes.json()).script.category, 'bonus');
  assert.strictEqual(
    (await putScript(req(`/api/admin/templates/scripts/${created.id}`, 'PUT', { category: 'nope' }, adminCookie), {
      params: { id: created.id },
    })).status,
    400
  );

  const delRes = await deleteScript(req(`/api/admin/templates/scripts/${created.id}`, 'DELETE', undefined, adminCookie), {
    params: { id: created.id },
  });
  assert.strictEqual(delRes.status, 200);
  assert.strictEqual(await scriptRepository.findTemplateById(created.id), null);
  assert.ok(getStore().auditLogs.some((l) => l.action === 'template.script_deleted' && l.resource_id === created.id));
  assert.strictEqual(
    (await deleteScript(req(`/api/admin/templates/scripts/${created.id}`, 'DELETE', undefined, adminCookie), {
      params: { id: created.id },
    })).status,
    404
  );
  console.log(' PASS: admin can add, re-categorise and delete scripts, with audit logs.');

  // --- 8. Deleting a picked script clears that pick for the client ---
  await deleteScript(req(`/api/admin/templates/scripts/${fullPicks.trustworthy}`, 'DELETE', undefined, adminCookie), {
    params: { id: fullPicks.trustworthy },
  });
  prefBody = await (await getPref(req(prefPath, 'GET', undefined, ownerCookie), ctx)).json();
  assert.deepStrictEqual(prefBody.selected_scripts, { pain_point: fullPicks.pain_point, testimonials: fullPicks.testimonials });
  assert.deepStrictEqual(sanitizeSelectedScripts({ pain_point: 'gone', extra: 'x' }, await scriptRepository.listTemplates()), {});
  console.log(' PASS: a deleted script is never shown as a stale pick.');

  // --- 9. Honest empty state: no scripts means an empty list, not invented ones ---
  getStore().scriptTemplates = [];
  const emptyBody = await (await getPortalScripts(req(`/api/portal/${clientId}/script-templates`, 'GET', undefined, ownerCookie), ctx)).json();
  assert.deepStrictEqual(emptyBody.scripts, []);
  console.log(' PASS: an empty library is reported as empty.');

  resetStore();
  console.log('All Script Library tests passed.');
}

run().catch((err) => {
  console.error('Script Library tests FAILED:', err);
  process.exit(1);
});
