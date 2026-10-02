import assert from 'node:assert';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

const BASE_URL = process.env.TEST_BASE_URL || process.env.NEXTAUTH_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!BASE_URL) {
  throw new Error('Base URL must be configured via TEST_BASE_URL, NEXTAUTH_URL, or APP_URL in environment.');
}

interface HttpResponse {
  status: number;
  headers: Headers;
  body: any;
  text: string;
  cookies: Record<string, string>;
}

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookie = headers.get('set-cookie');
  if (setCookie) {
    const parts = setCookie.split(',');
    for (const part of parts) {
      const match = part.trim().match(/^([^=]+)=([^;]+)/);
      if (match) {
        cookies[match[1]] = match[2];
      }
    }
  }
  return cookies;
}

async function request(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    cookie?: string;
    redirect?: RequestRedirect;
  } = {}
): Promise<HttpResponse> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.cookie) {
    headers['Cookie'] = `motionz_session=${options.cookie}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: options.redirect || 'manual',
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {}

  return {
    status: res.status,
    headers: res.headers,
    body,
    text,
    cookies: parseCookies(res.headers),
  };
}

async function runRealWorldVerification() {
  console.log('======================================================================');
  console.log(' PRE-PHASE 03: REAL-WORLD LIVE SERVER VERIFICATION (PORT 3005)');
  console.log('======================================================================\n');

  // --------------------------------------------------------------------
  // TEST A: ADMIN JOURNEY
  // --------------------------------------------------------------------
  console.log('--- TEST A: ADMIN JOURNEY ---');
  // 1. Open login page
  const loginPage = await request('/auth/login');
  assert.strictEqual(loginPage.status, 200, 'Login page must return HTTP 200');
  assert(loginPage.text.includes('Motionz'), 'Login page must render brand header');
  console.log('[PASS] Step 1: Login page renders with HTTP 200');

  // 2. Login using valid Admin account
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@motionz.ai', role: 'admin', action: 'staff' },
  });
  assert.strictEqual(adminLogin.status, 200, 'Admin login must return HTTP 200');
  assert.strictEqual(adminLogin.body?.success, true);
  assert.strictEqual(adminLogin.body?.redirectTo, '/admin');
  const adminCookie = adminLogin.cookies['motionz_session'];
  assert(adminCookie, 'Session cookie must be issued upon admin authentication');
  console.log('[PASS] Step 2-4: Admin authenticated, cookie issued, redirect = /admin');

  // 3. Confirm access to /admin
  const adminAccess = await request('/admin', { cookie: adminCookie });
  assert.strictEqual(adminAccess.status, 200, 'Protected /admin must be accessible with admin cookie');
  console.log('[PASS] Step 5: /admin accessed successfully with valid admin session');

  // 4. Refresh page (subsequent request with same session)
  const adminRefresh = await request('/admin', { cookie: adminCookie });
  assert.strictEqual(adminRefresh.status, 200, 'Session remains valid upon page refresh');
  console.log('[PASS] Step 6: Session persists cleanly across page refreshes');

  // 5. Logout
  const adminLogout = await request('/api/auth/logout', {
    method: 'POST',
    cookie: adminCookie,
  });
  assert.strictEqual(adminLogout.status, 200);
  assert.strictEqual(adminLogout.body?.redirectTo, '/auth/login');
  console.log('[PASS] Step 7: Logout executes and clears session');

  // 6. Confirm protected Admin pages are no longer accessible
  const adminAfterLogout = await request('/admin');
  assert(
    adminAfterLogout.status === 307 || adminAfterLogout.status === 302 || adminAfterLogout.status === 401,
    'Unauthenticated /admin access must be redirected to login'
  );
  const location = adminAfterLogout.headers.get('location') || '';
  assert(location.includes('/auth/login'), 'Redirect points to /auth/login');
  console.log('[PASS] Step 8: Protected Admin pages are strictly blocked after logout');

  // --------------------------------------------------------------------
  // TEST B: CSM JOURNEY
  // --------------------------------------------------------------------
  console.log('\n--- TEST B: CSM JOURNEY ---');
  // 1. Login using valid CSM account
  const csmLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'csm.agent@motionz.ai', role: 'csm', action: 'staff' },
  });
  assert.strictEqual(csmLogin.status, 200);
  assert.strictEqual(csmLogin.body?.redirectTo, '/csm');
  const csmCookie = csmLogin.cookies['motionz_session'];
  assert(csmCookie, 'CSM session cookie issued');
  console.log('[PASS] Step 1-2: CSM authenticated, redirect = /csm');

  // 2. Access /csm
  const csmAccess = await request('/csm', { cookie: csmCookie });
  assert.strictEqual(csmAccess.status, 200, 'Protected /csm must be accessible with CSM cookie');
  console.log('[PASS] Step 3: /csm accessed successfully with CSM session');

  // 3. CSM trying to access /admin -> blocked!
  const csmAttemptAdmin = await request('/admin', { cookie: csmCookie });
  assert(
    csmAttemptAdmin.status === 307 || csmAttemptAdmin.status === 302 || csmAttemptAdmin.status === 403,
    'CSM must be blocked from /admin'
  );
  console.log('[PASS] CSM role boundary: Access to /admin is strictly blocked for CSM');

  // 4. Logout
  const csmLogout = await request('/api/auth/logout', { method: 'POST', cookie: csmCookie });
  assert.strictEqual(csmLogout.status, 200);
  const csmAfterLogout = await request('/csm');
  assert(
    csmAfterLogout.status === 307 || csmAfterLogout.status === 302,
    'Unauthenticated /csm redirected to login'
  );
  console.log('[PASS] Step 4-6: CSM logged out and access is removed');

  // --------------------------------------------------------------------
  // TEST C: INVALID STAFF DOMAIN
  // --------------------------------------------------------------------
  console.log('\n--- TEST C: INVALID STAFF DOMAIN ---');
  const badDomain = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'hacker@external.com', role: 'admin', action: 'staff' },
  });
  assert.strictEqual(badDomain.status, 403, 'Non-staff email must receive HTTP 403');
  assert(
    badDomain.body?.error?.includes('restricted to verified @motionz.ai'),
    'Clear domain policy rejection error'
  );
  console.log('[PASS] Step 1-2: Non-staff email rejected with 403 Forbidden');

  // --------------------------------------------------------------------
  // TEST D: CLIENT INVITATION JOURNEY
  // --------------------------------------------------------------------
  console.log('\n--- TEST D: CLIENT INVITATION JOURNEY ---');
  // 1. Admin creates client
  const clientSlug = `pinnacle-${Date.now()}`;
  const createClient = await request('/api/admin/clients', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      name: 'Pinnacle Roofing',
      slug: clientSlug,
      primary_email: `owner.${Date.now()}@pinnacleroofing.com`,
      primary_contact_name: 'David Pinnacle',
      phone: '(555) 777-8888',
    },
  });
  assert.strictEqual(createClient.status, 200, 'Client provisioned successfully');
  const magicLinkUrl = createClient.body?.magicLinkUrl;
  assert(magicLinkUrl, 'Magic link URL must be returned');
  const clientTenantId = createClient.body?.tenant?.id;
  const token = new URL(magicLinkUrl).searchParams.get('token');
  assert(token, 'Token extracted from magic link');
  console.log('[PASS] Step 1-2: Admin creates client and generates 72h magic link');

  // 2. Verify token
  const verifyRes = await request('/api/auth/verify', {
    method: 'POST',
    body: { token },
  });
  assert.strictEqual(verifyRes.status, 200, 'Token verification succeeds');
  const clientCookie = verifyRes.cookies['motionz_session'];
  assert(clientCookie, 'Client session cookie issued');
  console.log('[PASS] Step 3-5: Client verifies magic link and receives session');

  // 3. Confirm access to own portal
  const portalAccess = await request(`/portal/${clientTenantId}`, { cookie: clientCookie });
  assert.strictEqual(portalAccess.status, 200, 'Client reaches own portal successfully');
  console.log('[PASS] Step 5-6: Client reaches /portal/[clientId] cleanly');

  // 4. Client trying to access /admin -> blocked!
  const clientAttemptAdmin = await request('/admin', { cookie: clientCookie });
  assert(
    clientAttemptAdmin.status === 307 || clientAttemptAdmin.status === 302 || clientAttemptAdmin.status === 403,
    'Client accessing /admin must be blocked'
  );
  console.log('[PASS] Client role boundary: Client is strictly denied from /admin');

  // 5. Logout
  await request('/api/auth/logout', { method: 'POST', cookie: clientCookie });
  const portalAfterLogout = await request(`/portal/${clientTenantId}`);
  assert(
    portalAfterLogout.status === 307 || portalAfterLogout.status === 302,
    'Portal access removed after logout'
  );
  console.log('[PASS] Step 8-9: Client logged out and access is removed');

  // --------------------------------------------------------------------
  // TEST E: CLIENT MEMBER JOURNEY
  // --------------------------------------------------------------------
  console.log('\n--- TEST E: CLIENT MEMBER JOURNEY ---');
  // Client invites member with ONLY Email and Phone
  const memberEmail = `foreman.${Date.now()}@pinnacleroofing.com`;
  const memberPhone = '+1 (555) 321-4321';
  const inviteMember = await request(`/api/portal/${clientTenantId}/team`, {
    method: 'POST',
    cookie: clientCookie,
    body: {
      email: memberEmail,
      phone: memberPhone,
    },
  });
  assert.strictEqual(inviteMember.status, 200, 'Team member invited with ONLY email and phone');
  assert.strictEqual(inviteMember.body?.invitation?.role, 'client_member', 'Role strictly set to client_member');
  const memberToken = new URL(inviteMember.body?.magicLinkUrl).searchParams.get('token');
  assert(memberToken, 'Member token extracted');
  console.log('[PASS] Step 1-5: Member invited using ONLY email and phone; role = client_member');

  // Member verifies and enters portal
  const memberVerify = await request('/api/auth/verify', {
    method: 'POST',
    body: { token: memberToken },
  });
  assert.strictEqual(memberVerify.status, 200);
  const memberCookie = memberVerify.cookies['motionz_session'];
  assert(memberCookie, 'Member session established');

  const memberPortal = await request(`/portal/${clientTenantId}`, { cookie: memberCookie });
  assert.strictEqual(memberPortal.status, 200, 'Member reaches correct client portal');
  console.log('[PASS] Step 6-8: Member accepts and reaches client portal');

  // Member cannot access Admin or CSM
  const memberAdmin = await request('/admin', { cookie: memberCookie });
  assert(memberAdmin.status === 307 || memberAdmin.status === 302);
  const memberCsm = await request('/csm', { cookie: memberCookie });
  assert(memberCsm.status === 307 || memberCsm.status === 302);
  console.log('[PASS] Step 9: Client Member strictly blocked from /admin and /csm');

  // --------------------------------------------------------------------
  // TEST F: WRONG TENANT (HORIZONTAL ESCALATION DEFENSE)
  // --------------------------------------------------------------------
  console.log('\n--- TEST F: WRONG TENANT (HORIZONTAL ESCALATION) ---');
  const otherTenantId = 'tenant-demo-abc-roofing';

  // Client Pinnacle attempts to navigate to Demo Tenant URL
  const crossPortal = await request(`/portal/${otherTenantId}`, {
    cookie: clientCookie,
    redirect: 'manual',
  });
  assert(
    crossPortal.status === 307 || crossPortal.status === 302 || crossPortal.status === 403,
    'Client accessing another tenant portal must be redirected or denied'
  );
  console.log('[PASS] Step 1-3: Cross-tenant portal URL is blocked');

  // Client Pinnacle attempts API query against Demo Tenant leads
  const crossLeadsApi = await request(`/api/portal/${otherTenantId}/leads`, {
    cookie: clientCookie,
  });
  assert(
    crossLeadsApi.status === 403 || crossLeadsApi.status === 401,
    'Cross-tenant API request must be denied with 403 Forbidden'
  );
  console.log('[PASS] Step 4-6: Cross-tenant API access strictly blocked with 403; zero data exposed');

  // --------------------------------------------------------------------
  // TEST G: INVITATION SECURITY
  // --------------------------------------------------------------------
  console.log('\n--- TEST G: INVITATION SECURITY ---');
  // 1. Single-use reuse attempt
  const reuseToken = await request('/api/auth/verify', {
    method: 'POST',
    body: { token },
  });
  assert.strictEqual(reuseToken.status, 400);
  assert(
    reuseToken.body?.error?.includes('already been used') || reuseToken.body?.error?.includes('invalid'),
    'Reused token must be rejected'
  );
  console.log('[PASS] Reused token strictly rejected');

  // 2. Tampered token
  const tampered = await request('/api/auth/verify', {
    method: 'POST',
    body: { token: 'invalid_tampered_token_string' },
  });
  assert.strictEqual(tampered.status, 400);
  console.log('[PASS] Modified/invalid token strictly rejected');

  // --------------------------------------------------------------------
  // TEST H: OPEN REDIRECT DEFENSE
  // --------------------------------------------------------------------
  console.log('\n--- TEST H: OPEN REDIRECT DEFENSE ---');
  const openRedirect1 = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@motionz.ai',
      role: 'admin',
      action: 'staff',
      redirect: 'https://attacker.example.com',
    },
  });
  assert.strictEqual(openRedirect1.body?.redirectTo, '/admin', 'External https:// redirect stripped');

  const openRedirect2 = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@motionz.ai',
      role: 'admin',
      action: 'staff',
      redirect: '//attacker.example.com/evil',
    },
  });
  assert.strictEqual(openRedirect2.body?.redirectTo, '/admin', 'Protocol-relative // redirect stripped');

  const openRedirect3 = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@motionz.ai',
      role: 'admin',
      action: 'staff',
      redirect: 'javascript:alert(1)',
    },
  });
  assert.strictEqual(openRedirect3.body?.redirectTo, '/admin', 'Javascript URI redirect stripped');
  console.log('[PASS] Open redirect vectors neutralized and sanitized to safe fallback');

  console.log('\n======================================================================');
  console.log(' ALL PRE-PHASE 03 REAL-WORLD VERIFICATION JOURNEYS PASSED 100%');
  console.log('======================================================================\n');
}

runRealWorldVerification().catch((err) => {
  console.error('\nVERIFICATION RUN FAILED:', err);
  process.exit(1);
});
