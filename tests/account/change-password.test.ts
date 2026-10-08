/**
 * "My profile" → Password: a signed-in person changes their own password.
 * The person always comes from the session; the current password is checked first; nothing about
 * either password reaches a log.
 */
import assert from 'node:assert';

// Force the in-memory mock store: these tests must never touch a real database or send real email.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY']) {
  delete process.env[key];
}

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const CURRENT = 'Current-Pass-123';
const NEXT = 'Brand-New-Pass-456';
// The mock sign-in rule (same as /api/auth/login without Supabase): these two count as wrong.
const WRONG = 'WrongPassword123!';

async function run() {
  console.log('--- Change password (My profile) tests ---');

  const { NextRequest } = await import('next/server');
  const { resetStore, getStore, getTenantById } = await import('../../src/lib/db');
  const { userRepository } = await import('../../src/lib/db/repositories');
  const { createSessionToken, SESSION_COOKIE_NAME } = await import('../../src/lib/auth/session');
  const { POST: passwordPost } = await import('../../src/app/api/account/profile/password/route');
  const { GET: profileGet } = await import('../../src/app/api/account/profile/route');
  const { verifyCurrentPassword, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } = await import('../../src/lib/account/profile');
  const { auditActionLabel, securityEventLabel } = await import('../../src/lib/utils/log-labels');

  resetStore();
  const tenant = await getTenantById('abc-roofing');
  assert(tenant, 'demo tenant must exist');
  const tenantId = tenant!.id;

  const sessions = {
    admin: createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin'),
    csm: createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm'),
    client: createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenantId),
    member: createSessionToken('user-member-1', 'sarah@abcroofing.com', 'client_member', tenantId),
  };

  const post = async (session: string | undefined, body?: unknown) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (session) headers.set('cookie', `${SESSION_COOKIE_NAME}=${session}`);
    const res = await passwordPost(
      new NextRequest(`${BASE_URL}/api/account/profile/password`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) })
    );
    return { status: res.status, json: await res.json(), res };
  };
  const audits = () => getStore().auditLogs.filter((l) => l.action === 'account.password_changed');
  const events = (type: string) => getStore().securityEvents.filter((e) => e.event_type === type);

  // 1. Signed out
  const signedOut = await post(undefined, { currentPassword: CURRENT, newPassword: NEXT });
  assert.strictEqual(signedOut.status, 401);
  assert.strictEqual((await post('not-a-real-session', { currentPassword: CURRENT, newPassword: NEXT })).status, 401);
  assert.strictEqual(audits().length, 0);
  console.log(' PASS: signed-out requests get 401.');

  // 2. The rules (none of these count towards the attempt limit, and none change anything)
  assert.strictEqual(PASSWORD_MIN_LENGTH, 8);
  assert.strictEqual(PASSWORD_MAX_LENGTH, 200);
  const missingCurrent = await post(sessions.member, { newPassword: NEXT });
  assert.strictEqual(missingCurrent.status, 400);
  assert.strictEqual(missingCurrent.json.error, 'Please enter your current password.');
  const tooShort = await post(sessions.member, { currentPassword: CURRENT, newPassword: 'short12' });
  assert.strictEqual(tooShort.status, 400);
  assert.strictEqual(tooShort.json.error, 'Your new password must be at least 8 characters long.');
  assert.strictEqual((await post(sessions.member, { currentPassword: CURRENT })).status, 400, 'a missing new password is refused');
  assert.strictEqual((await post(sessions.member, { currentPassword: CURRENT, newPassword: 12345678 })).status, 400, 'a new password that is not text is refused');
  const tooLong = await post(sessions.member, { currentPassword: CURRENT, newPassword: 'x'.repeat(201) });
  assert.strictEqual(tooLong.status, 400);
  assert.strictEqual(tooLong.json.error, 'Your new password must be 200 characters or fewer.');
  const same = await post(sessions.member, { currentPassword: CURRENT, newPassword: CURRENT });
  assert.strictEqual(same.status, 400);
  assert.strictEqual(same.json.error, 'Your new password must be different from your current password.');
  assert.strictEqual((await post(sessions.member)).status, 400, 'an empty body is refused');
  assert.strictEqual((await post(sessions.member, ['a'])).status, 400, 'a body that is not an object is refused');
  for (let i = 0; i < 8; i++) assert.strictEqual((await post(sessions.member, { currentPassword: CURRENT, newPassword: 'short' })).status, 400);
  assert.strictEqual(audits().length, 0, 'refused requests are not audited');
  assert.strictEqual(events('account_password_change_wrong_password').length, 0);
  console.log(' PASS: too short, too long, missing and same-as-current are refused with a clear message.');

  // 3. Wrong current password → 403 + security event, nothing changed
  const wrong = await post(sessions.member, { currentPassword: WRONG, newPassword: NEXT });
  assert.strictEqual(wrong.status, 403);
  assert.strictEqual(wrong.json.error, 'Your current password is not correct.');
  assert.strictEqual(audits().length, 0);
  const wrongEvent = events('account_password_change_wrong_password');
  assert.strictEqual(wrongEvent.length, 1);
  assert.strictEqual(wrongEvent[0].details?.email, 'sarah@abcroofing.com');
  assert.strictEqual(wrongEvent[0].tenant_id, tenantId);
  assert.strictEqual(securityEventLabel('account_password_change_wrong_password'), 'Wrong current password when changing password (My profile)');
  console.log(' PASS: a wrong current password gets 403 and a security event.');

  // 4. Success for a client, and for staff (CSM and CSM Manager). The session keeps working.
  const who: Array<[keyof typeof sessions, string, string]> = [
    ['client', 'user-client-1', 'john@abcroofing.com'],
    ['csm', 'user-csm-1', 'csm@motionz.ai'],
    ['admin', 'user-admin-1', 'admin@motionz.ai'],
  ];
  for (const [key, id, email] of who) {
    const before = audits().length;
    const signInsBefore = getStore().auditLogs.filter((l) => /authenticated/.test(l.action)).length;
    const usersBefore = getStore().users.length;
    const ok = await post(sessions[key], { currentPassword: CURRENT, newPassword: NEXT });
    assert.strictEqual(ok.status, 200, `${key} can change their password`);
    assert.deepStrictEqual(ok.json, { success: true });
    assert.match(ok.res.headers.get('cache-control') || '', /no-store/);
    assert.strictEqual(ok.res.headers.get('set-cookie'), null, 'the session cookie is left alone');
    assert.strictEqual(audits().length, before + 1);
    const entry = audits()[0];
    assert.strictEqual(entry.actor_email, email);
    assert.strictEqual(entry.resource_id, id);
    assert.strictEqual(entry.resource_type, 'user');
    assert.strictEqual(getStore().auditLogs.filter((l) => /authenticated/.test(l.action)).length, signInsBefore, 'checking the password does not log a sign-in');
    assert.strictEqual(getStore().users.length, usersBefore, 'no account is created');
    // Still signed in with the same cookie.
    const stillIn = await profileGet(
      new NextRequest(`${BASE_URL}/api/account/profile`, { headers: new Headers({ cookie: `${SESSION_COOKIE_NAME}=${sessions[key]}` }) })
    );
    assert.strictEqual(stillIn.status, 200, `${key} stays signed in`);
    assert.strictEqual((await stillIn.json()).email, email);
  }
  assert.strictEqual(events('account_password_changed').length, 3);
  assert.strictEqual(auditActionLabel('account.password_changed'), 'Own password changed (My profile)');
  assert.strictEqual(securityEventLabel('account_password_changed'), 'Own password changed (My profile)');
  const everything = JSON.stringify([getStore().auditLogs, getStore().securityEvents]);
  for (const secret of [CURRENT, NEXT, WRONG]) assert.ok(!everything.includes(secret), 'no password reaches the audit log or the security events');
  console.log(' PASS: a client, a CSM and a CSM Manager change their own password, are audited, and stay signed in.');

  // 5. No id or email from the browser is honoured
  const beforeOther = audits().length;
  const spoof = await post(sessions.csm, {
    currentPassword: CURRENT,
    newPassword: 'Another-Pass-789',
    userId: 'user-admin-1',
    id: 'user-admin-1',
    email: 'admin@motionz.ai',
    role: 'admin',
  });
  assert.strictEqual(spoof.status, 200);
  assert.strictEqual(audits().length, beforeOther + 1);
  assert.strictEqual(audits()[0].actor_email, 'csm@motionz.ai', 'the signed-in person is the one changed');
  assert.strictEqual(audits()[0].resource_id, 'user-csm-1');
  console.log(' PASS: an id, email or role in the request is ignored.');

  // 6. Rate limit: 5 attempts per 15 minutes per person (the member has used 1 so far)
  for (let i = 0; i < 4; i++) {
    assert.strictEqual((await post(sessions.member, { currentPassword: WRONG, newPassword: NEXT })).status, 403, `attempt ${i + 2} is checked`);
  }
  const limited = await post(sessions.member, { currentPassword: CURRENT, newPassword: NEXT });
  assert.strictEqual(limited.status, 429, 'the 6th attempt is refused, even with the right password');
  assert.match(limited.json.error, /Too many attempts/);
  assert.ok(Number(limited.res.headers.get('retry-after')) > 0);
  assert.strictEqual(events('account_password_change_wrong_password').length, 5);
  assert.ok(events('rate_limit_exceeded').some((e) => e.details?.endpoint === '/api/account/profile/password'));
  // The limit is per person: someone else is not affected.
  assert.strictEqual((await post(sessions.client, { currentPassword: NEXT, newPassword: 'Third-Pass-000' })).status, 200);
  console.log(' PASS: more than 5 attempts in 15 minutes are refused, per person.');

  // 7. A suspended person is refused like on every other account route
  await userRepository.update('user-client-1', { status: 'suspended' } as any);
  const beforeSuspended = audits().length;
  const suspended = await post(sessions.client, { currentPassword: CURRENT, newPassword: NEXT });
  assert.ok([401, 403].includes(suspended.status), `a suspended person is refused (got ${suspended.status})`);
  assert.strictEqual(audits().length, beforeSuspended);
  await userRepository.update('user-client-1', { status: 'active' } as any);
  // A session for someone who no longer exists.
  const ghost = createSessionToken('user-does-not-exist', 'ghost@motionz.ai', 'csm');
  assert.ok([401, 403].includes((await post(ghost, { currentPassword: CURRENT, newPassword: NEXT })).status));
  console.log(' PASS: suspended and unknown people are refused.');

  // 8. The checker itself: mock rule outside production, never "ok" in production without Supabase
  assert.strictEqual(await verifyCurrentPassword('john@abcroofing.com', ''), 'wrong');
  assert.strictEqual(await verifyCurrentPassword('john@abcroofing.com', 'wrong'), 'wrong');
  assert.strictEqual(await verifyCurrentPassword('john@abcroofing.com', CURRENT), 'ok');
  const env = process.env as Record<string, string | undefined>;
  const previousEnv = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    assert.strictEqual(await verifyCurrentPassword('john@abcroofing.com', CURRENT), 'unavailable');
  } finally {
    env.NODE_ENV = previousEnv;
  }
  console.log(' PASS: without a sign-in service in production the password is never accepted.');

  console.log('--- Change password tests: ALL PASSED ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
