import assert from 'assert';
import { POST as loginHandler } from '../../src/app/api/auth/login/route';
import { POST as verifyCodeHandler } from '../../src/app/api/auth/login/verify-code/route';
import { POST as resendCodeHandler } from '../../src/app/api/auth/login/resend-code/route';
import { GET as securityGet, PUT as securityPut } from '../../src/app/api/admin/settings/security/route';
import { resetStore, getStore } from '../../src/lib/db';
import { appSettingsRepository, userRepository } from '../../src/lib/db/repositories';
import { createSessionToken, verifySession, SESSION_COOKIE_NAME } from '../../src/lib/auth/session';
import {
  LOGIN_CHALLENGE_COOKIE,
  hashLoginCode,
  signLoginChallenge,
  verifyLoginChallenge,
} from '../../src/lib/auth/login-challenge';
import { staffLoginCodeEmail } from '../../src/lib/email';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}
// Tests must never send real email or reach a real database.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GHL_WEBHOOK_SECRET']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!BASE_URL) {
  throw new Error('Base URL must be configured via NEXTAUTH_URL or APP_URL in environment.');
}

function makeRequest(path: string, method: string, body?: any, cookies: Record<string, string> = {}): Request {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new Request(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `test-ip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Value of a Set-Cookie on the response: undefined when not set, '' when cleared. */
function cookieFrom(res: Response, name: string): string | undefined {
  return (res as any).cookies.get(name)?.value;
}

/**
 * The code only ever leaves the server by email. Without a provider key the email module
 * prints the message to the server console, so the tests read it from there.
 */
const sentEmails: string[] = [];
const originalInfo = console.info;
console.info = (...args: any[]) => {
  const line = args.map(String).join(' ');
  if (line.startsWith('[email:dev]')) sentEmails.push(line);
  else originalInfo(...args);
};

function lastCodeFor(email: string): string {
  const message = [...sentEmails].reverse().find((m) => m.includes(`To: ${email}`) && m.includes('Your Motionz sign-in code'));
  assert.ok(message, `A sign-in code email should have been sent to ${email}`);
  const match = message!.match(/^(\d{6})$/m);
  assert.ok(match, 'The email should contain a 6-digit code on its own line');
  return match![1];
}

const wrongCodeFor = (code: string) => (code === '000000' ? '111111' : '000000');

async function startCsmLogin(email = 'csm@motionz.ai', redirect?: string) {
  const res = await loginHandler(makeRequest('/api/auth/login', 'POST', { email, password: 'password', action: 'staff', redirect }));
  const body = await res.json();
  return { res, body, cookie: cookieFrom(res, LOGIN_CHALLENGE_COOKIE) };
}

const verify = (code: unknown, cookie?: string) =>
  verifyCodeHandler(makeRequest('/api/auth/login/verify-code', 'POST', { code }, cookie ? { [LOGIN_CHALLENGE_COOKIE]: cookie } : {}));

async function run() {
  console.log('--- Running Staff Emailed Sign-In Code Tests ---');
  resetStore();
  const adminSession = { [SESSION_COOKIE_NAME]: createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin') };
  const csmSession = { [SESSION_COOKIE_NAME]: createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm') };

  // ---------------------------------------------------------------------------------------
  console.log('\n[1/8] Setting off (default): staff sign in with the password only');
  assert.deepStrictEqual(await appSettingsRepository.get('security'), { staff_login_code: 'off' });
  {
    const { res, body, cookie } = await startCsmLogin();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.codeRequired, undefined);
    assert.strictEqual(body.redirectTo, '/csm');
    assert.ok(verifySession(cookieFrom(res, SESSION_COOKIE_NAME)!), 'Session cookie is issued when the setting is off');
    assert.strictEqual(cookie, undefined, 'No challenge cookie when the setting is off');
    assert.strictEqual(sentEmails.length, 0, 'No code is emailed when the setting is off');
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log('\n[2/8] Settings route: admin-only, validated, all_staff needs email delivery');
  {
    assert.strictEqual((await securityGet(makeRequest('/api/admin/settings/security', 'GET'))).status, 401);
    assert.strictEqual((await securityGet(makeRequest('/api/admin/settings/security', 'GET', undefined, csmSession))).status, 403);
    assert.strictEqual(
      (await securityPut(makeRequest('/api/admin/settings/security', 'PUT', { staff_login_code: 'csm' }, csmSession))).status,
      403,
      'A CSM cannot change the setting'
    );
    assert.strictEqual((await securityPut(makeRequest('/api/admin/settings/security', 'PUT', { staff_login_code: 'csm' }))).status, 401);
    assert.strictEqual((await appSettingsRepository.get('security')).staff_login_code, 'off', 'Rejected requests change nothing');

    const getRes = await securityGet(makeRequest('/api/admin/settings/security', 'GET', undefined, adminSession));
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual((await getRes.json()).security.staff_login_code, 'off');

    for (const bad of ['everyone', '', null, 1, ['csm'], undefined]) {
      const res = await securityPut(makeRequest('/api/admin/settings/security', 'PUT', { staff_login_code: bad }, adminSession));
      assert.strictEqual(res.status, 400, `Value ${JSON.stringify(bad)} must be rejected`);
    }

    const blocked = await securityPut(makeRequest('/api/admin/settings/security', 'PUT', { staff_login_code: 'all_staff' }, adminSession));
    assert.strictEqual(blocked.status, 400, 'all_staff is refused while email delivery is not configured');
    assert.strictEqual((await appSettingsRepository.get('security')).staff_login_code, 'off');

    const ok = await securityPut(makeRequest('/api/admin/settings/security', 'PUT', { staff_login_code: 'csm' }, adminSession));
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await appSettingsRepository.get('security')).staff_login_code, 'csm');
    assert.ok(getStore().auditLogs.some((l: any) => l.action === 'settings.security_updated'), 'Change is audited');
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log("\n[3/8] 'csm': CSM gets a code step and no session; admin signs in normally");
  let challengeCookie: string;
  let firstCode: string;
  {
    const { res, body, cookie } = await startCsmLogin('csm@motionz.ai', '/csm/clients');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(body, { success: true, codeRequired: true, emailHint: 'c***@motionz.ai' });
    assert.strictEqual(cookieFrom(res, SESSION_COOKIE_NAME), undefined, 'No session cookie before the code is verified');
    assert.ok(cookie, 'Challenge cookie is set');
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(/HttpOnly/i.test(setCookie) && /SameSite=lax/i.test(setCookie), 'Challenge cookie is httpOnly and sameSite=lax');
    challengeCookie = cookie!;
    firstCode = lastCodeFor('csm@motionz.ai');

    assert.ok(!JSON.stringify(body).includes(firstCode), 'The code is never returned in the response');
    assert.ok(!Buffer.from(challengeCookie.split('.')[0], 'base64url').toString().includes(firstCode), 'The code is not in the cookie');
    assert.strictEqual(verifySession(challengeCookie), null, 'A challenge cookie is not accepted as a session');

    const adminRes = await loginHandler(makeRequest('/api/auth/login', 'POST', { email: 'admin@motionz.ai', password: 'password', action: 'staff' }));
    const adminBody = await adminRes.json();
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminBody.codeRequired, undefined);
    assert.strictEqual(adminBody.redirectTo, '/admin');
    assert.ok(verifySession(cookieFrom(adminRes, SESSION_COOKIE_NAME)!), 'Admin gets a session straight away');
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log('\n[4/8] Wrong code -> 401; missing, tampered or expired challenge -> 401');
  {
    const wrong = await verify(wrongCodeFor(firstCode), challengeCookie);
    assert.strictEqual(wrong.status, 401);
    assert.strictEqual(cookieFrom(wrong, SESSION_COOKIE_NAME), undefined);
    assert.strictEqual((await wrong.json()).attemptsRemaining, 4);
    assert.ok(getStore().securityEvents.some((e: any) => e.event_type === 'staff_login_code_failed'));

    assert.strictEqual((await verify('12ab', challengeCookie)).status, 400, 'Malformed code is rejected');
    assert.strictEqual((await verify(firstCode)).status, 401, 'No challenge cookie');

    // Tampering: change the payload (point it at the admin) but keep the signature.
    const [data, signature] = challengeCookie.split('.');
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, userId: 'user-admin-1', email: 'admin@motionz.ai', role: 'admin' })).toString('base64url');
    const tampered = await verify(firstCode, `${forged}.${signature}`);
    assert.strictEqual(tampered.status, 401, 'Tampered payload is rejected');
    assert.strictEqual(cookieFrom(tampered, SESSION_COOKIE_NAME), undefined);
    assert.strictEqual((await verify(firstCode, `${data}.${signature.slice(0, -2)}xx`)).status, 401, 'Tampered signature is rejected');
    // A valid session token must not be accepted as a challenge either.
    assert.strictEqual((await verify(firstCode, csmSession[SESSION_COOKIE_NAME])).status, 401);

    // Expired: correctly signed, right code, but past its expiry.
    const expired = signLoginChallenge({
      challengeId: 'expired-challenge',
      userId: 'user-csm-1',
      email: 'csm@motionz.ai',
      role: 'csm',
      redirect: '/csm',
      codeHash: hashLoginCode('123456', 'expired-challenge'),
      exp: Date.now() - 1000,
    });
    const expiredRes = await verify('123456', expired);
    assert.strictEqual(expiredRes.status, 401, 'Expired challenge is rejected even with the right code');
    assert.strictEqual(cookieFrom(expiredRes, SESSION_COOKIE_NAME), undefined);
    assert.strictEqual(cookieFrom(expiredRes, LOGIN_CHALLENGE_COOKIE), '', 'Expired challenge cookie is cleared');
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log('\n[5/8] Correct code -> session cookie + redirect; the challenge cannot be reused');
  {
    const res = await verify(firstCode, challengeCookie);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.redirectTo, '/csm/clients', 'Redirect requested at the password step is kept');
    const session = verifySession(cookieFrom(res, SESSION_COOKIE_NAME)!);
    assert.ok(session, 'Session cookie is issued');
    assert.strictEqual(session!.userId, 'user-csm-1');
    assert.strictEqual(session!.role, 'csm');
    assert.strictEqual(cookieFrom(res, LOGIN_CHALLENGE_COOKIE), '', 'Challenge cookie is cleared');
    assert.ok(getStore().securityEvents.some((e: any) => e.event_type === 'staff_login_code_verified'));
    assert.ok(getStore().auditLogs.some((l: any) => l.action === 'staff.login_code_verified'));

    const replay = await verify(firstCode, challengeCookie);
    assert.strictEqual(replay.status, 401, 'The same challenge + code cannot sign in twice');
    assert.strictEqual(cookieFrom(replay, SESSION_COOKIE_NAME), undefined);
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log('\n[6/8] Attempt counting: 5 wrong codes, then 429 even for the right code');
  {
    const { cookie } = await startCsmLogin('csm.agent@motionz.ai');
    const code = lastCodeFor('csm.agent@motionz.ai');
    for (let i = 1; i <= 5; i++) {
      const res = await verify(wrongCodeFor(code), cookie);
      assert.strictEqual(res.status, 401, `Wrong attempt ${i} is a 401`);
    }
    const locked = await verify(code, cookie);
    assert.strictEqual(locked.status, 429, 'Sixth attempt is rate limited, even with the correct code');
    assert.strictEqual(cookieFrom(locked, SESSION_COOKIE_NAME), undefined);
    assert.strictEqual(cookieFrom(locked, LOGIN_CHALLENGE_COOKIE), '', 'Challenge cookie is cleared on lockout');
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log('\n[7/8] Resend: new code, old code stops working, capped at 3');
  {
    const { cookie } = await startCsmLogin();
    const oldCode = lastCodeFor('csm@motionz.ai');
    const before = verifyLoginChallenge(cookie)!;

    assert.strictEqual((await resendCodeHandler(makeRequest('/api/auth/login/resend-code', 'POST'))).status, 401, 'Resend needs a challenge');

    // Force distinct codes so the "old code is rejected" assertion can never pass by coincidence.
    let resendRes: Response;
    let newCookie: string;
    let newCode: string;
    let resends = 0;
    do {
      resendRes = await resendCodeHandler(makeRequest('/api/auth/login/resend-code', 'POST', undefined, { [LOGIN_CHALLENGE_COOKIE]: newCookie! || cookie! }));
      resends++;
      assert.strictEqual(resendRes.status, 200);
      newCookie = cookieFrom(resendRes, LOGIN_CHALLENGE_COOKIE)!;
      newCode = lastCodeFor('csm@motionz.ai');
    } while (newCode === oldCode && resends < 3);
    assert.notStrictEqual(newCode, oldCode, 'Resend issues a different code');
    assert.deepStrictEqual(await resendRes.json(), { success: true, emailHint: 'c***@motionz.ai' });

    const after = verifyLoginChallenge(newCookie)!;
    assert.strictEqual(after.challengeId, before.challengeId, 'Same challenge');
    assert.strictEqual(after.exp, before.exp, 'Resend does not extend the expiry');
    assert.notStrictEqual(after.codeHash, before.codeHash);

    const oldRes = await verify(oldCode, newCookie);
    assert.strictEqual(oldRes.status, 401, 'The previous code no longer works');

    while (resends < 3) {
      const r = await resendCodeHandler(makeRequest('/api/auth/login/resend-code', 'POST', undefined, { [LOGIN_CHALLENGE_COOKIE]: newCookie }));
      assert.strictEqual(r.status, 200);
      newCookie = cookieFrom(r, LOGIN_CHALLENGE_COOKIE)!;
      newCode = lastCodeFor('csm@motionz.ai');
      resends++;
    }
    const tooMany = await resendCodeHandler(makeRequest('/api/auth/login/resend-code', 'POST', undefined, { [LOGIN_CHALLENGE_COOKIE]: newCookie }));
    assert.strictEqual(tooMany.status, 429, 'Fourth resend is rate limited');

    const okRes = await verify(newCode, newCookie);
    assert.strictEqual(okRes.status, 200, 'The latest code signs in');
    assert.ok(verifySession(cookieFrom(okRes, SESSION_COOKIE_NAME)!));
  }
  console.log(' PASS');

  // ---------------------------------------------------------------------------------------
  console.log('\n[8/8] Suspended mid-flow, undeliverable email, all_staff, clients unaffected');
  {
    // Suspended between the password step and the code step.
    const { cookie } = await startCsmLogin('csm.agent@motionz.ai');
    const code = lastCodeFor('csm.agent@motionz.ai');
    await userRepository.suspendUser('user-csm-2', 'Left the company', 'admin@motionz.ai', 'admin');
    const suspended = await verify(code, cookie);
    assert.strictEqual(suspended.status, 403, 'A suspended account cannot finish signing in');
    assert.strictEqual(cookieFrom(suspended, SESSION_COOKIE_NAME), undefined);

    // Email provider configured but failing: 503, no challenge cookie, no session.
    resetStore();
    await appSettingsRepository.set('security', { staff_login_code: 'csm' }, 'admin@motionz.ai');
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    process.env.RESEND_API_KEY = 'test-key-not-real';
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    console.error = () => {};
    try {
      const { res, body, cookie: failedCookie } = await startCsmLogin('csm.agent@motionz.ai');
      assert.strictEqual(res.status, 503, 'Undeliverable code is a clear 503');
      assert.ok(body.error);
      assert.strictEqual(failedCookie, undefined, 'No challenge cookie when the email was not delivered');
      assert.strictEqual(cookieFrom(res, SESSION_COOKIE_NAME), undefined, 'And no session either');

      // With a provider configured an admin may require the code for all staff.
      const enable = await securityPut(makeRequest('/api/admin/settings/security', 'PUT', { staff_login_code: 'all_staff' }, adminSession));
      assert.strictEqual(enable.status, 200);
    } finally {
      delete process.env.RESEND_API_KEY;
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }

    const adminRes = await loginHandler(makeRequest('/api/auth/login', 'POST', { email: 'admin@motionz.ai', password: 'password', action: 'staff' }));
    const adminBody = await adminRes.json();
    assert.strictEqual(adminBody.codeRequired, true, "'all_staff' also asks admins for a code");
    assert.strictEqual(adminBody.emailHint, 'a***@motionz.ai');
    assert.strictEqual(cookieFrom(adminRes, SESSION_COOKIE_NAME), undefined);
    const adminVerify = await verify(lastCodeFor('admin@motionz.ai'), cookieFrom(adminRes, LOGIN_CHALLENGE_COOKIE));
    assert.strictEqual(adminVerify.status, 200);
    assert.strictEqual((await adminVerify.json()).redirectTo, '/admin');

    // Client logins never get a code step.
    const clientRes = await loginHandler(makeRequest('/api/auth/login', 'POST', { email: 'john@abcroofing.com', password: 'password' }));
    const clientBody = await clientRes.json();
    assert.strictEqual(clientRes.status, 200);
    assert.strictEqual(clientBody.codeRequired, undefined);
    assert.ok(verifySession(cookieFrom(clientRes, SESSION_COOKIE_NAME)!), 'Client gets a session straight away');

    // Template wording.
    const email = staffLoginCodeEmail({ to: 'csm@motionz.ai', code: '654321', expiresInMinutes: 10 });
    assert.strictEqual(email.subject, 'Your Motionz sign-in code');
    assert.ok(email.text.includes('654321') && email.html.includes('654321'));
    assert.ok(/font-size:32px[^>]*>654321</.test(email.html), 'Code is shown large in the HTML part');
    assert.ok(email.text.includes('expires in 10 minutes'));
    assert.ok(/wasn't you/.test(email.text) && /[Cc]hange your password/.test(email.text));
  }
  console.log(' PASS');

  console.info = originalInfo;
  console.log('\nAll staff sign-in code tests passed.');
}

run().catch((err) => {
  console.info = originalInfo;
  console.error('Staff sign-in code tests FAILED:', err);
  process.exit(1);
});
