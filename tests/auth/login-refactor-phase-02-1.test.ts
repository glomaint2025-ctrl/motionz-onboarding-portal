import assert from 'assert';
import { POST as authLoginHandler } from '../../src/app/api/auth/login/route';
import { POST as authVerifyHandler } from '../../src/app/api/auth/verify/route';
import { authenticateStaff } from '../../src/lib/auth/staff';
import { resetStore, getStore } from '../../src/lib/db';
import { userRepository, tenantRepository } from '../../src/lib/db/repositories';
import { verifySession } from '../../src/lib/auth/session';
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}
// Tests must never send real email or create real Google Sheets.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GHL_WEBHOOK_SECRET']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
if (!BASE_URL) {
  throw new Error('Base URL must be configured via NEXTAUTH_URL or APP_URL in environment.');
}
function makeJsonRequest(pathOrUrl: string, method: string, body: any): Request {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `test-ip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    },
    body: JSON.stringify(body),
  });
}

async function runPhase021Tests() {
  console.log('--- Running Phase 02.1 Refactored Authentication & Server-Side RBAC Test Matrix ---');
  resetStore();

  const store = getStore();

  // Seed test tenant & users
  const testTenant = await tenantRepository.create({
    name: 'Apex Roofing Systems',
    slug: 'apex-roofing',
    primary_email: 'owner@apexroofing.com',
    status: 'active',
    template_id: 'a0000000-0000-0000-0000-000000000001',
  });

  const clientUser = await userRepository.create({
    email: 'owner@apexroofing.com',
    full_name: 'Apex Owner',
    role: 'client',
    tenant_id: testTenant.id,
  });

  const memberUser = await userRepository.create({
    email: 'estimator@apexroofing.com',
    full_name: 'Apex Estimator',
    role: 'client_member',
    tenant_id: testTenant.id,
  });

  // =========================================================================
  // 1. STAFF: ROLE RESOLVED SERVER-SIDE (NO BROWSER ROLE SELECTION)
  // =========================================================================
  console.log('\n[1/4] Testing Staff Server-Side Role Resolution & Tampering Defense...');

  // 1.1: Admin login without specifying any role in payload -> server resolves admin
  const adminReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'admin@motionz.ai',
    action: 'staff',
  });
  const adminRes = await authLoginHandler(adminReq);
  assert.strictEqual(adminRes.status, 200, 'Admin login without role field must succeed');
  const adminBody = await adminRes.json();
  assert.strictEqual(adminBody.success, true);
  assert.strictEqual(adminBody.user.role, 'admin', 'Server must authoritatively resolve admin role');
  assert.strictEqual(adminBody.redirectTo, '/admin', 'Admin must be redirected to /admin');
  console.log(' PASS: Admin role resolved server-side without client role selection; redirected to /admin');

  // 1.2: CSM login without specifying any role in payload -> server resolves csm
  const csmReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'csm.agent@motionz.ai',
    action: 'staff',
  });
  const csmRes = await authLoginHandler(csmReq);
  assert.strictEqual(csmRes.status, 200, 'CSM login without role field must succeed');
  const csmBody = await csmRes.json();
  assert.strictEqual(csmBody.success, true);
  assert.strictEqual(csmBody.user.role, 'csm', 'Server must authoritatively resolve csm role');
  assert.strictEqual(csmBody.redirectTo, '/csm', 'CSM must be redirected to /csm');
  console.log(' PASS: CSM role resolved server-side without client role selection; redirected to /csm');

  // 1.3: Role tampering attempt: Non-designated user passes role='admin' -> rejected with 403
  const tamperingReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'tamperer@motionz.ai',
    action: 'staff',
    role: 'admin', // Malicious client attempt to elevate
  });
  const tamperingRes = await authLoginHandler(tamperingReq);
  assert.strictEqual(tamperingRes.status, 403, 'Role tampering elevation must be rejected with 403');
  const tamperingBody = await tamperingRes.json();
  assert(tamperingBody.error.includes('Administrator privileges require designated staff approval'));
  assert(
    store.securityEvents.some((e) => e.event_type === 'staff_privilege_escalation_attempt'),
    'Tampering attempt must record a staff_privilege_escalation_attempt security event'
  );
  console.log(' PASS: Role tampering attempt detected and rejected with 403');

  // 1.4: Non-staff email attempting staff access -> 403 Forbidden
  const badDomainReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'intruder@external.com',
    action: 'staff',
  });
  const badDomainRes = await authLoginHandler(badDomainReq);
  assert.strictEqual(badDomainRes.status, 403, 'External domain attempting staff login must be rejected');
  console.log(' PASS: External domain rejected from staff authentication');

  // =========================================================================
  // 2. CLIENT: PORTAL AUTHENTICATION & SERVER-RESOLVED TENANT
  // =========================================================================
  console.log('\n[2/4] Testing Client Portal Authentication & Server-Side Tenant Resolution...');

  // 2.1: Client Owner requests magic link
  const clientReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'owner@apexroofing.com',
    action: 'magic_link',
  });
  const clientRes = await authLoginHandler(clientReq);
  assert.strictEqual(clientRes.status, 200);
  const clientBody = await clientRes.json();
  assert.strictEqual(clientBody.success, true);
  assert.ok(clientBody.demoMagicLink, 'Demo magic link returned in development');

  // Extract token and verify
  const clientToken = new URL(clientBody.demoMagicLink).searchParams.get('token');
  assert.ok(clientToken, 'Token extracted from magic link');

  const clientVerifyReq = makeJsonRequest('/api/auth/verify', 'POST', {
    token: clientToken,
  });
  const clientVerifyRes = await authVerifyHandler(clientVerifyReq);
  assert.strictEqual(clientVerifyRes.status, 200);
  const clientVerifyBody = await clientVerifyRes.json();
  assert.strictEqual(clientVerifyBody.user.role, 'client', 'Role resolved as client');
  assert.strictEqual(clientVerifyBody.user.tenant_id, testTenant.id, 'Tenant resolved correctly');
  assert.strictEqual(clientVerifyBody.redirectTo, `/portal/${testTenant.id}`, 'Redirects to organization portal');
  console.log(' PASS: Client owner authenticated; role and tenant resolved server-side');

  // 2.3: Client direct login with Email + Password
  const clientPasswordReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'owner@apexroofing.com',
    password: 'ClientPassword123!',
  });
  const clientPasswordRes = await authLoginHandler(clientPasswordReq);
  assert.strictEqual(clientPasswordRes.status, 200, 'Client email + password login must succeed');
  const clientPasswordBody = await clientPasswordRes.json();
  assert.strictEqual(clientPasswordBody.success, true);
  assert.strictEqual(clientPasswordBody.user.role, 'client');
  assert.strictEqual(clientPasswordBody.redirectTo, `/portal/${testTenant.id}`);
  console.log(' PASS: Client owner authenticated via Email + Password; auto-redirected to /portal/[tenantId]');

  // =========================================================================
  // 3. CLIENT MEMBER: IDENTICAL PORTAL FLOW (NO ROLE SELECTION)
  // =========================================================================
  console.log('\n[3/4] Testing Client Member Authentication (Identical Portal Flow)...');

  // 3.1: Client Member requests magic link using the exact same Client Portal endpoint
  const memberReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'estimator@apexroofing.com',
    action: 'magic_link',
  });
  const memberRes = await authLoginHandler(memberReq);
  assert.strictEqual(memberRes.status, 200);
  const memberBody = await memberRes.json();
  assert.strictEqual(memberBody.success, true);

  const memberToken = new URL(memberBody.demoMagicLink).searchParams.get('token');
  assert.ok(memberToken, 'Token extracted from member magic link');

  const memberVerifyReq = makeJsonRequest('/api/auth/verify', 'POST', {
    token: memberToken,
  });
  const memberVerifyRes = await authVerifyHandler(memberVerifyReq);
  assert.strictEqual(memberVerifyRes.status, 200);
  const memberVerifyBody = await memberVerifyRes.json();
  assert.strictEqual(memberVerifyBody.user.role, 'client_member', 'Role strictly resolved as client_member');
  assert.strictEqual(memberVerifyBody.user.tenant_id, testTenant.id, 'Tenant strictly resolved as inviting tenant');
  assert.strictEqual(memberVerifyBody.redirectTo, `/portal/${testTenant.id}`, 'Redirects to correct portal');
  console.log(' PASS: Client member authenticated via same flow; role and tenant resolved server-side');

  // =========================================================================
  // 4. SECURITY: PRODUCTION ISOLATION & OPEN REDIRECT DEFENSE
  // =========================================================================
  console.log('\n[4/4] Testing Production Security Isolation & Open Redirect Defenses...');

  // 4.1: Production environment blocks passwordless email staff bypass
  const prevEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.ALLOW_DEV_STAFF_LOGIN;

    const prodStaffAuth = await authenticateStaff('admin@motionz.ai');
    assert.strictEqual(prodStaffAuth.success, false, 'Production environment must reject passwordless staff login');
    assert(
      prodStaffAuth.error?.includes('Single Sign-On'),
      'Clear error explaining SSO requirement in production'
    );
    console.log(' PASS: Production environment strictly isolates development-only passwordless bypass');
  } finally {
    (process.env as any).NODE_ENV = prevEnv;
  }

  // 4.2: Open redirect attempt on staff login sanitized
  const openRedirectReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'admin@motionz.ai',
    action: 'staff',
    redirect: 'https://malicious-attacker.com/steal-session',
  });
  const openRedirectRes = await authLoginHandler(openRedirectReq);
  const openRedirectBody = await openRedirectRes.json();
  assert.strictEqual(
    openRedirectBody.redirectTo,
    '/admin',
    'Open redirect URL must be sanitized back to server default /admin'
  );
  console.log(' PASS: Open redirect attempts sanitized to server-side default route');

  console.log('\n================================================================');
  console.log(' ALL PHASE 02.1 REFACTORED AUTHENTICATION TESTS PASSED CLEANLY ');
  console.log('================================================================\n');
}

runPhase021Tests().catch((err) => {
  console.error('Phase 02.1 Test Failure:', err);
  process.exit(1);
});
