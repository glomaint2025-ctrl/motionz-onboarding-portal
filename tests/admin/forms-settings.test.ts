import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  delete process.env[key];
}

async function run() {
  console.log('Running GoHighLevel Form Settings Tests (parser, admin API, portal data and forms APIs)...');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, createTenant } = await import('../../src/lib/db');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { PORTAL_LINKS, ghlFormUrl } = await import('../../src/lib/portal-links');
  const { parseGhlFormId, resolveFormSettings } = await import('../../src/lib/db/repositories/app-settings.repository');
  const { GET: getForms, PUT: putForms } = await import('../../src/app/api/admin/settings/forms/route');
  const { GET: getPortalData } = await import('../../src/app/api/portal/[clientId]/data/route');
  const { GET: getPortalForms } = await import('../../src/app/api/portal/[clientId]/forms/route');

  resetStore();
  const store = getStore();

  const ONBOARDING_DEFAULT = PORTAL_LINKS.onboardingFormId;
  const A2P_DEFAULT = PORTAL_LINKS.a2pFormId;
  const DEFAULTS = {
    onboarding_form_id: ONBOARDING_DEFAULT,
    a2p_form_id: A2P_DEFAULT,
    lead_replacement_form_id: '',
    unresponsive_lead_form_id: '',
  };
  const NEW_ONBOARDING = 'NewOnboard1ngFormAbc';
  const NEW_A2P = 'NewTexting_Form-12345';
  const REPLACEMENT = 'LeadReplace9FormXyZ01';
  const UNRESPONSIVE = 'Unresponsive7LeadForm';

  // ---------------------------------------------------------------- parser
  const ID = 'wyM27h1ZCiwGoyXE03oC';
  const accepted: [string, string][] = [
    [ID, 'a bare id'],
    [`  ${ID}\n`, 'a bare id with spaces around it'],
    [`https://api.leadconnectorhq.com/widget/form/${ID}`, 'the standard link'],
    [`https://api.leadconnectorhq.com/widget/form/${ID}/`, 'a link with a trailing slash'],
    [`https://api.leadconnectorhq.com/widget/form/${ID}?notrack=true&email=a%40b.com`, 'a link with a query string'],
    [`https://api.leadconnectorhq.com/widget/form/${ID}#top`, 'a link with a fragment'],
    [`https://link.motionz.ai/widget/form/${ID}`, 'a link on a custom domain'],
    [`http://link.example-agency.com/widget/form/${ID}?x=1`, 'a custom-domain link with a query string'],
    [`api.leadconnectorhq.com/widget/form/${ID}`, 'a link without https://'],
    [`HTTPS://API.LEADCONNECTORHQ.COM/WIDGET/FORM/${ID}`, 'an upper-case link'],
    [
      `<iframe src="https://api.leadconnectorhq.com/widget/form/${ID}" style="width:100%;height:100%;border:none;border-radius:3px" id="inline-${ID}" data-layout="{'id':'INLINE'}" data-form-name="Lead Replacement" data-height="812" data-form-id="${ID}" title="Lead Replacement"></iframe><script src="https://link.msgsndr.com/js/form_embed.js"></script>`,
      'the full embed snippet',
    ],
    [`<iframe src='https://link.motionz.ai/widget/form/${ID}?notrack=true' title='Form'></iframe>`, 'an embed snippet with single quotes and a query string'],
    [`<div data-form-id="${ID}"></div>`, 'a snippet that only carries data-form-id'],
    [`Here is the link: https://api.leadconnectorhq.com/widget/form/${ID} thanks`, 'a link inside a sentence'],
    ['abc-DEF_123', 'the shortest allowed id (10 characters) with - and _'],
    ['a'.repeat(40), 'the longest allowed id (40 characters)'],
  ];
  for (const [input, what] of accepted) {
    const expected = input.includes(ID) || input.toLowerCase().includes(ID.toLowerCase()) ? ID : input.trim();
    assert.strictEqual(parseGhlFormId(input), expected, `${what} gives the form id`);
  }

  const rejected: [unknown, string][] = [
    ['', 'empty text'],
    ['   ', 'only spaces'],
    [undefined, 'undefined'],
    [null, 'null'],
    [12345678901, 'a number'],
    [{ id: ID }, 'an object'],
    ['short', 'an id that is too short'],
    ['a'.repeat(9), 'nine characters'],
    ['a'.repeat(41), 'forty-one characters'],
    ['has spaces in the id', 'text with spaces'],
    ['bad/id<script>alert(1)', 'text with markup'],
    ['https://api.leadconnectorhq.com/widget/form/', 'a link with no id'],
    ['https://api.leadconnectorhq.com/widget/form/abc', 'a link whose id is too short'],
    [`https://api.leadconnectorhq.com/widget/form/${'a'.repeat(41)}`, 'a link whose id is too long'],
    [`https://api.leadconnectorhq.com/widget/booking/${ID}`, 'a booking calendar link'],
    [`https://api.leadconnectorhq.com/widget/survey/${ID}`, 'a survey link'],
    ['https://motionz.ai/contact-us', 'some other web address'],
    [`javascript:alert('${ID}')`, 'a script address'],
    [`${ID} ${ID}`, 'two ids'],
    ['x'.repeat(5000), 'very long text'],
  ];
  for (const [input, what] of rejected) {
    assert.strictEqual(parseGhlFormId(input), null, `${what} is not a form id`);
  }
  console.log(' PASS: parseGhlFormId reads ids from links and embed snippets, and rejects everything else.');

  // ---------------------------------------------------------------- helpers
  const adminCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const clientA = store.tenants.find((t) => t.slug === 'abc-roofing')!.id;
  const clientCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', clientA);
  const memberCookie = createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', clientA);
  const clientB = (await createTenant({ name: 'Beta Roofing', slug: 'beta-roofing', primary_email: 'owner@betaroofing.com' })).id;

  function req(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookie) headers.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
    return new NextRequest(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const adminGet = (cookie: string | null = adminCookie) =>
    getForms(req('/api/admin/settings/forms', 'GET', undefined, cookie ?? undefined));
  const adminPut = (body: unknown, cookie: string | null = adminCookie) =>
    putForms(req('/api/admin/settings/forms', 'PUT', body, cookie ?? undefined));
  const portalData = (tenantId: string, cookie?: string) =>
    getPortalData(req(`/api/portal/${tenantId}/data`, 'GET', undefined, cookie), { params: { clientId: tenantId } });
  const portalForms = (tenantId: string, cookie?: string) =>
    getPortalForms(req(`/api/portal/${tenantId}/forms`, 'GET', undefined, cookie), { params: { clientId: tenantId } });
  const savedSetting = () => store.appSettings.find((s) => s.key === 'forms');
  const formAudits = () => store.auditLogs.filter((l) => l.action === 'settings.forms_updated');

  // ---------------------------------------------------------------- GET defaults
  let res = await adminGet();
  assert.strictEqual(res.status, 200);
  let data = await res.json();
  assert.strictEqual(data.success, true);
  assert.deepStrictEqual(data.forms, DEFAULTS, 'the two existing forms are the defaults; the two new ones start empty');
  assert.deepStrictEqual(await resolveFormSettings(), DEFAULTS);
  console.log(' PASS: GET returns the built-in forms by default.');

  // ---------------------------------------------------------------- access
  assert.strictEqual((await adminGet(null)).status, 401);
  assert.strictEqual((await adminGet(csmCookie)).status, 403);
  assert.strictEqual((await adminGet(clientCookie)).status, 403);
  assert.strictEqual((await adminPut({ lead_replacement_form_id: REPLACEMENT }, null)).status, 401);
  assert.strictEqual((await adminPut({ lead_replacement_form_id: REPLACEMENT }, csmCookie)).status, 403);
  assert.strictEqual((await adminPut({ lead_replacement_form_id: REPLACEMENT }, clientCookie)).status, 403);
  assert.strictEqual((await adminPut({ lead_replacement_form_id: REPLACEMENT }, memberCookie)).status, 403);
  assert.strictEqual(savedSetting(), undefined, 'refused requests save nothing');
  assert.strictEqual(formAudits().length, 0);
  console.log(' PASS: only admins can read or change the form links.');

  // ---------------------------------------------------------------- invalid input
  const badInputs: [string, unknown, string][] = [
    ['lead_replacement_form_id', 'not a form', 'Lead replacement form'],
    ['unresponsive_lead_form_id', 'https://motionz.ai/contact-us', 'Unresponsive lead form'],
    ['onboarding_form_id', 'https://api.leadconnectorhq.com/widget/booking/SRn2ONyB295xnnPR5JwR', 'Onboarding form'],
    ['a2p_form_id', 12345, 'Texting registration form'],
    ['lead_replacement_form_id', { id: REPLACEMENT }, 'Lead replacement form'],
  ];
  for (const [field, value, label] of badInputs) {
    res = await adminPut({ [field]: value });
    assert.strictEqual(res.status, 400, `${field}=${JSON.stringify(value)} is rejected`);
    data = await res.json();
    assert.ok(data.error.includes(label), `the message names "${label}"`);
    assert.deepStrictEqual(Object.keys(data.fields), [field], 'only the bad field is reported');
  }

  // One bad field stops the whole save, and every bad field is reported.
  res = await adminPut({ lead_replacement_form_id: REPLACEMENT, unresponsive_lead_form_id: 'nope', a2p_form_id: 'x y' });
  assert.strictEqual(res.status, 400);
  data = await res.json();
  assert.deepStrictEqual(Object.keys(data.fields).sort(), ['a2p_form_id', 'unresponsive_lead_form_id']);
  assert.ok(data.error.includes('Unresponsive lead form') && data.error.includes('Texting registration form'));
  assert.strictEqual(savedSetting(), undefined, 'nothing is saved when any field is invalid');
  console.log(' PASS: invalid links are refused with 400 and the form is named.');

  // ---------------------------------------------------------------- required forms cannot be emptied
  for (const [field, label] of [['onboarding_form_id', 'Onboarding form'], ['a2p_form_id', 'Texting registration form']]) {
    for (const empty of ['', '   ', null]) {
      res = await adminPut({ [field]: empty });
      assert.strictEqual(res.status, 400, `${field} cannot be set to ${JSON.stringify(empty)}`);
      data = await res.json();
      assert.ok(data.error.includes(label) && /cannot be left empty/.test(data.error));
      assert.ok(data.fields[field]);
    }
  }
  assert.deepStrictEqual((await (await adminGet()).json()).forms, DEFAULTS);
  assert.strictEqual(formAudits().length, 0, 'refused saves are not audit-logged');
  console.log(' PASS: the onboarding and texting forms cannot be emptied.');

  // ---------------------------------------------------------------- saving
  res = await adminPut({
    onboarding_form_id: ONBOARDING_DEFAULT,
    a2p_form_id: `https://api.leadconnectorhq.com/widget/form/${A2P_DEFAULT}`,
    lead_replacement_form_id: `  https://link.motionz.ai/widget/form/${REPLACEMENT}?notrack=true  `,
    unresponsive_lead_form_id: `<iframe src="https://api.leadconnectorhq.com/widget/form/${UNRESPONSIVE}" id="inline-${UNRESPONSIVE}" data-form-id="${UNRESPONSIVE}" title="Unresponsive Lead"></iframe>`,
  });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.strictEqual(data.success, true);
  assert.deepStrictEqual(data.forms, { ...DEFAULTS, lead_replacement_form_id: REPLACEMENT, unresponsive_lead_form_id: UNRESPONSIVE });
  assert.deepStrictEqual(data.changed, ['lead_replacement_form_id', 'unresponsive_lead_form_id']);
  assert.deepStrictEqual(savedSetting()!.value, data.forms, 'only ids are stored, never the pasted text');
  assert.strictEqual(savedSetting()!.updated_by, 'admin@motionz.ai');
  assert.deepStrictEqual((await (await adminGet()).json()).forms, data.forms);

  assert.strictEqual(formAudits().length, 1);
  let audit = formAudits()[0];
  assert.strictEqual(audit.actor_email, 'admin@motionz.ai');
  assert.strictEqual(audit.resource_id, 'forms');
  assert.deepStrictEqual(audit.details?.changed, ['lead_replacement_form_id', 'unresponsive_lead_form_id']);
  assert.deepStrictEqual(audit.details?.forms, ['Lead replacement form', 'Unresponsive lead form']);
  assert.deepStrictEqual(audit.details?.previous, { lead_replacement_form_id: '', unresponsive_lead_form_id: '' });
  assert.deepStrictEqual(audit.details?.current, { lead_replacement_form_id: REPLACEMENT, unresponsive_lead_form_id: UNRESPONSIVE });

  // Saving the same values again changes nothing and writes no second audit entry.
  data = await (await adminPut({ lead_replacement_form_id: REPLACEMENT })).json();
  assert.deepStrictEqual(data.changed, []);
  assert.strictEqual(formAudits().length, 1);

  // A field that is left out keeps its value; the existing forms can be pointed at new ones.
  res = await adminPut({ onboarding_form_id: `https://api.leadconnectorhq.com/widget/form/${NEW_ONBOARDING}`, a2p_form_id: NEW_A2P });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.deepStrictEqual(data.forms, {
    onboarding_form_id: NEW_ONBOARDING,
    a2p_form_id: NEW_A2P,
    lead_replacement_form_id: REPLACEMENT,
    unresponsive_lead_form_id: UNRESPONSIVE,
  });
  assert.strictEqual(formAudits().length, 2);
  audit = formAudits().find((l) => l.details?.changed?.includes('onboarding_form_id'))!;
  assert.deepStrictEqual(audit.details?.previous, { onboarding_form_id: ONBOARDING_DEFAULT, a2p_form_id: A2P_DEFAULT });
  console.log(' PASS: PUT saves the ids from pasted links and embed snippets, and is audit-logged.');

  // ---------------------------------------------------------------- portal: data API
  const ALL_SAVED = data.forms;
  for (const [who, cookie] of [['admin', adminCookie], ['CSM', csmCookie], ['client owner', clientCookie]] as const) {
    res = await portalData(clientA, cookie);
    assert.strictEqual(res.status, 200, `portal data loads for the ${who}`);
    assert.deepStrictEqual((await res.json()).forms, ALL_SAVED, `the ${who} gets the saved form ids`);
  }
  assert.deepStrictEqual((await (await portalData(clientB, adminCookie)).json()).forms, ALL_SAVED, 'the ids are the same for every client');

  res = await portalData(clientA);
  assert.strictEqual(res.status, 401, 'a signed-out caller is refused');
  assert.strictEqual((await res.json()).forms, undefined);
  res = await portalData(clientB, clientCookie);
  assert.strictEqual(res.status, 403, "a client cannot read another client's portal data");
  assert.strictEqual((await res.json()).forms, undefined);
  console.log(' PASS: the portal data API carries the saved form ids, to signed-in people only.');

  // ---------------------------------------------------------------- portal: forms API
  res = await portalForms(clientA, clientCookie);
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.deepStrictEqual(data.forms, ALL_SAVED);
  assert.strictEqual(data.prefillEmail, 'john@abcroofing.com', 'a client fills the form in as themselves');

  data = await (await portalForms(clientA, adminCookie)).json();
  assert.deepStrictEqual(data.forms, ALL_SAVED, 'staff viewing the portal get the forms too');
  assert.strictEqual(data.prefillEmail, store.tenants.find((t) => t.id === clientA)!.primary_email, "staff use the client's email");
  assert.deepStrictEqual((await (await portalForms(clientA, csmCookie)).json()).forms, ALL_SAVED);

  assert.strictEqual((await portalForms(clientA)).status, 401, 'a signed-out caller is refused');
  assert.strictEqual((await portalForms(clientB, clientCookie)).status, 403, "a client cannot read another client's forms");
  assert.strictEqual((await portalForms('00000000-0000-4000-8000-00000000dead', adminCookie)).status, 404);

  // The two Leads forms follow the Leads section; the Setup Progress forms do not.
  const HIDDEN_LEAD_FORMS = { ...ALL_SAVED, lead_replacement_form_id: '', unresponsive_lead_form_id: '' };
  const memberUser = store.users.find((u) => u.id === 'user-member-1')!;
  const originalModules = memberUser.allowed_modules;
  memberUser.allowed_modules = ['onboarding'];
  assert.deepStrictEqual((await (await portalForms(clientA, memberCookie)).json()).forms, HIDDEN_LEAD_FORMS, 'a team member without Leads gets no lead forms');
  assert.deepStrictEqual((await (await portalData(clientA, memberCookie)).json()).forms, HIDDEN_LEAD_FORMS);
  memberUser.allowed_modules = ['onboarding', 'leads'];
  data = await (await portalForms(clientA, memberCookie)).json();
  assert.deepStrictEqual(data.forms, ALL_SAVED, 'a team member with Leads gets them');
  assert.strictEqual(data.prefillEmail, 'sarah@abcroofing.com');
  assert.deepStrictEqual((await (await portalData(clientA, memberCookie)).json()).forms, ALL_SAVED);
  memberUser.allowed_modules = originalModules;
  console.log(' PASS: the portal forms API respects sign-in, tenant isolation and the Leads section.');

  // ---------------------------------------------------------------- clearing and bad stored values
  res = await adminPut({ lead_replacement_form_id: '', unresponsive_lead_form_id: null });
  assert.strictEqual(res.status, 200);
  data = await res.json();
  assert.deepStrictEqual(data.changed, ['lead_replacement_form_id', 'unresponsive_lead_form_id']);
  assert.strictEqual(data.forms.lead_replacement_form_id, '');
  assert.strictEqual(data.forms.unresponsive_lead_form_id, '');
  data = await (await portalForms(clientA, clientCookie)).json();
  assert.strictEqual(data.forms.lead_replacement_form_id, '', 'a cleared form is hidden from clients');
  assert.strictEqual(data.forms.onboarding_form_id, NEW_ONBOARDING);

  // A malformed stored value is never served: the built-in form is used instead.
  savedSetting()!.value = {
    onboarding_form_id: 'javascript:alert(1)',
    a2p_form_id: '',
    lead_replacement_form_id: '"><script>',
    unresponsive_lead_form_id: UNRESPONSIVE,
  };
  data = await (await portalData(clientA, clientCookie)).json();
  assert.deepStrictEqual(data.forms, { ...DEFAULTS, unresponsive_lead_form_id: UNRESPONSIVE });
  assert.deepStrictEqual((await (await adminGet()).json()).forms, data.forms);

  // The form address only ever carries the id and the email to pre-fill.
  const url = new URL(ghlFormUrl(UNRESPONSIVE, 'john@abcroofing.com'));
  assert.strictEqual(url.origin + url.pathname, `https://api.leadconnectorhq.com/widget/form/${UNRESPONSIVE}`);
  assert.strictEqual(url.searchParams.get('email'), 'john@abcroofing.com');
  console.log(' PASS: clearing a Leads form hides it; bad stored values fall back to the built-in forms.');

  console.log('GoHighLevel Form Settings Tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
