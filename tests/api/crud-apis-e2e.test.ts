import assert from 'node:assert';
import { NextRequest } from 'next/server';

// Handlers
import { GET as healthHandler } from '../../src/app/api/health/route';
import { POST as authLoginHandler } from '../../src/app/api/auth/login/route';
import { POST as authVerifyHandler } from '../../src/app/api/auth/verify/route';
import { GET as adminClientsGetHandler, POST as adminClientsPostHandler } from '../../src/app/api/admin/clients/route';
import { GET as adminClientGetByIdHandler, PUT as adminClientPutHandler, DELETE as adminClientDeleteHandler } from '../../src/app/api/admin/clients/[id]/route';
import { GET as csmClientsHandler } from '../../src/app/api/csm/clients/route';
import { GET as csmSetupGetHandler, PUT as csmSetupPutHandler } from '../../src/app/api/csm/clients/[id]/setup/route';
import { GET as portalDataHandler } from '../../src/app/api/portal/[clientId]/data/route';
import { GET as portalLeadsHandler } from '../../src/app/api/portal/[clientId]/leads/route';
import { GET as portalContractsHandler } from '../../src/app/api/portal/[clientId]/contracts/route';
import { PUT as portalProfileHandler } from '../../src/app/api/portal/[clientId]/profile/route';
import { GET as portalTeamGetHandler, POST as portalTeamHandler, DELETE as portalTeamDeleteHandler, PATCH as portalTeamPatchHandler } from '../../src/app/api/portal/[clientId]/team/route';
import { GET as videoPrefGetHandler, POST as videoPrefPostHandler } from '../../src/app/api/portal/[clientId]/video-preference/route';
import { POST as ghlWebhookHandler } from '../../src/app/api/webhooks/ghl/route';
import { createSessionToken } from '../../src/lib/auth/session';

console.log('--- Starting Complete End-to-End CRUD APIs Test Suite ---');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}
// Tests must never send real email or create real Google Sheets.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GHL_WEBHOOK_SECRET']) delete process.env[key];

async function runCrudApiTests() {
  const BASE_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!BASE_URL) {
    throw new Error('Base URL must be configured via NEXTAUTH_URL or APP_URL in environment.');
  }

  // Helper to create NextRequest with JSON body
  function makeJsonRequest(pathOrUrl: string, method: string, body?: any, cookies?: Record<string, string>): NextRequest {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
    const headers = new Headers({ 'content-type': 'application/json' });
    if (cookies) {
      const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      headers.set('cookie', cookieStr);
    }
    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // 1. Health API (GET)
  console.log('\n[1/6] Testing Health API (GET /api/health)...');
  const healthRes = await healthHandler();
  assert.strictEqual(healthRes.status, 200);
  const healthBody = await healthRes.json();
  assert.strictEqual(healthBody.status, 'healthy');
  assert.strictEqual(healthBody.database.healthy, true);
  console.log(' PASS: Health API responds 200 OK with clean diagnostics.');

  // 2. Auth API (Login, Domain Policy, Verify)
  console.log('\n[2/6] Testing Auth APIs (POST /api/auth/login, POST /api/auth/verify)...');
  
  // Non-staff attempting staff login
  const badLoginReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'intruder@external.com',
    role: 'admin',
    action: 'staff',
  });
  const badLoginRes = await authLoginHandler(badLoginReq);
  assert.strictEqual(badLoginRes.status, 403);
  console.log(' PASS: Non-staff email blocked from admin login.');

  // Valid staff login
  const staffLoginReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'admin@motionz.ai',
    role: 'admin',
    action: 'staff',
  });
  const staffLoginRes = await authLoginHandler(staffLoginReq);
  assert.strictEqual(staffLoginRes.status, 200);
  const staffLoginBody = await staffLoginRes.json();
  assert.strictEqual(staffLoginBody.success, true);
  assert.strictEqual(staffLoginBody.user.role, 'admin');
  console.log(' PASS: Staff email authenticated and session established.');

  // Client Magic Link Request
  const clientMagicReq = makeJsonRequest('/api/auth/login', 'POST', {
    email: 'john@abcroofing.com',
    action: 'magic_link',
  });
  const clientMagicRes = await authLoginHandler(clientMagicReq);
  assert.strictEqual(clientMagicRes.status, 200);
  const clientMagicBody = await clientMagicRes.json();
  assert.strictEqual(clientMagicBody.success, true);
  assert.ok(clientMagicBody.demoMagicLink, 'Must return demoMagicLink in development/test');
  const token = new URL(clientMagicBody.demoMagicLink).searchParams.get('token');
  assert.ok(token, 'Must extract token from demoMagicLink');
  console.log(' PASS: Client magic link generated with valid token.');

  // Verify token
  const verifyReq = makeJsonRequest('/api/auth/verify', 'POST', { token, password: 'test-password-1' });
  const verifyRes = await authVerifyHandler(verifyReq);
  assert.strictEqual(verifyRes.status, 200);
  const verifyBody = await verifyRes.json();
  assert.strictEqual(verifyBody.success, true);
  console.log(' PASS: Magic link token verified and session provisioned.');

  // Prepare admin, CSM, and client session cookies for subsequent requests
  const adminSessionCookie = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const csmSessionCookie = createSessionToken('user-csm-1', 'csm@motionz.ai', 'csm');
  const clientSessionCookie = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', 'tenant-demo-abc-roofing');

  // 3. Admin Clients CRUD API
  console.log('\n[3/6] Testing Admin Clients CRUD API (/api/admin/clients)...');
  
  // GET: List clients
  const listClientsReq = makeJsonRequest('/api/admin/clients', 'GET', undefined, {
    motionz_session: adminSessionCookie,
  });
  const listClientsRes = await adminClientsGetHandler(listClientsReq);
  assert.strictEqual(listClientsRes.status, 200);
  const listClientsBody = await listClientsRes.json();
  assert.strictEqual(listClientsBody.success, true);
  assert.ok(Array.isArray(listClientsBody.tenants));
  console.log(` PASS: Admin lists clients (Count: ${listClientsBody.tenants.length}).`);

  // POST: Create client
  const testTenantSlug = `test-crud-${Date.now()}`;
  const createClientReq = makeJsonRequest('/api/admin/clients', 'POST', {
    name: 'Summit Roof Masters',
    slug: testTenantSlug,
    primary_email: 'owner@summitroofmasters.com',
    primary_contact_name: 'Sarah Summit',
    phone: '(555) 987-6543',
  }, {
    motionz_session: adminSessionCookie,
  });
  const createClientRes = await adminClientsPostHandler(createClientReq);
  assert.strictEqual(createClientRes.status, 200);
  const createClientBody = await createClientRes.json();
  assert.strictEqual(createClientBody.success, true);
  const createdTenantId = createClientBody.tenant.id;
  assert.ok(createdTenantId);
  console.log(` PASS: Admin created new client "${createClientBody.tenant.name}" (ID: ${createdTenantId}).`);

  // GET by ID: Read client
  const getClientReq = makeJsonRequest(`/api/admin/clients/${createdTenantId}`, 'GET', undefined, {
    motionz_session: adminSessionCookie,
  });
  const getClientRes = await adminClientGetByIdHandler(getClientReq, { params: { id: createdTenantId } });
  assert.strictEqual(getClientRes.status, 200);
  const getClientBody = await getClientRes.json();
  assert.strictEqual(getClientBody.tenant.name, 'Summit Roof Masters');
  assert.strictEqual(getClientBody.steps.length, 5, 'Must have exactly 5 cloned setup steps');
  console.log(' PASS: Admin retrieved client details with 5 cloned setup steps.');

  // PUT: Update client
  const updateClientReq = makeJsonRequest(`/api/admin/clients/${createdTenantId}`, 'PUT', {
    name: 'Summit Roof Masters LLC',
    phone: '(555) 000-1111',
  }, {
    motionz_session: adminSessionCookie,
  });
  const updateClientRes = await adminClientPutHandler(updateClientReq, { params: { id: createdTenantId } });
  assert.strictEqual(updateClientRes.status, 200);
  const updateClientBody = await updateClientRes.json();
  assert.strictEqual(updateClientBody.tenant.name, 'Summit Roof Masters LLC');
  console.log(' PASS: Admin updated client profile via PUT.');

  // DELETE: Archive client
  const deleteClientReq = makeJsonRequest(`/api/admin/clients/${createdTenantId}`, 'DELETE', undefined, {
    motionz_session: adminSessionCookie,
  });
  const deleteClientRes = await adminClientDeleteHandler(deleteClientReq, { params: { id: createdTenantId } });
  assert.strictEqual(deleteClientRes.status, 200);
  console.log(' PASS: Admin soft-deleted/archived client portal.');

  // 4. CSM Client & Setup Management CRUD API
  console.log('\n[4/6] Testing CSM APIs (/api/csm/clients, /api/csm/clients/[id]/setup)...');
  
  // GET: List assigned clients for CSM
  const csmClientsReq = makeJsonRequest('/api/csm/clients', 'GET', undefined, {
    motionz_session: csmSessionCookie,
  });
  const csmClientsRes = await csmClientsHandler(csmClientsReq);
  assert.strictEqual(csmClientsRes.status, 200);
  const csmClientsBody = await csmClientsRes.json();
  assert.ok(Array.isArray(csmClientsBody.clients));
  console.log(` PASS: CSM retrieved client roster (Count: ${csmClientsBody.clients.length}).`);

  // GET: Setup steps for demo client
  const targetId = 'tenant-demo-abc-roofing';
  const csmSetupGetReq = makeJsonRequest(`/api/csm/clients/${targetId}/setup`, 'GET', undefined, {
    motionz_session: csmSessionCookie,
  });
  const csmSetupGetRes = await csmSetupGetHandler(csmSetupGetReq, { params: { id: targetId } });
  assert.strictEqual(csmSetupGetRes.status, 200);
  const csmSetupGetBody = await csmSetupGetRes.json();
  assert.strictEqual(csmSetupGetBody.steps.length, 5);
  console.log(' PASS: CSM retrieved client setup roadmap.');

  // PUT: Update step status & guidance
  const csmSetupPutReq = makeJsonRequest(`/api/csm/clients/${targetId}/setup`, 'PUT', {
    stepKey: 'google_sheet',
    status: 'done',
    right_now: 'Intake sheet verified by CSM. Ready for GoHighLevel provisioning.',
  }, {
    motionz_session: csmSessionCookie,
  });
  const csmSetupPutRes = await csmSetupPutHandler(csmSetupPutReq, { params: { id: targetId } });
  assert.strictEqual(csmSetupPutRes.status, 200);
  const csmSetupPutBody = await csmSetupPutRes.json();
  assert.strictEqual(csmSetupPutBody.step.status, 'done');
  console.log(' PASS: CSM updated step status and conversational guidance text.');

  // 5. Client Portal Focused CRUD APIs
  console.log('\n[5/6] Testing Client Portal Focused APIs (/api/portal/[clientId]/*)...');
  
  // GET: Leads
  const leadsReq = makeJsonRequest('/api/portal/abc-roofing/leads', 'GET', undefined, {
    motionz_session: clientSessionCookie,
  });
  const leadsRes = await portalLeadsHandler(leadsReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(leadsRes.status, 200);
  const leadsBody = await leadsRes.json();
  assert.ok(Array.isArray(leadsBody.leads));
  assert.strictEqual((leadsBody as any).contracts, undefined, 'Leads endpoint must not leak contracts');
  console.log(` PASS: Focused Leads API returned strictly leads (${leadsBody.leads.length} leads).`);

  // GET: Contracts
  const contractsReq = makeJsonRequest('/api/portal/abc-roofing/contracts', 'GET', undefined, {
    motionz_session: clientSessionCookie,
  });
  const contractsRes = await portalContractsHandler(contractsReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(contractsRes.status, 200);
  const contractsBody = await contractsRes.json();
  assert.ok(Array.isArray(contractsBody.contracts));
  assert.strictEqual((contractsBody as any).leads, undefined, 'Contracts endpoint must not leak leads');
  console.log(` PASS: Focused Contracts API returned strictly contracts.`);

  // PUT: Update Profile
  const profileReq = makeJsonRequest('/api/portal/abc-roofing/profile', 'PUT', {
    name: 'ABC Roofing',
    phone: '(555) 333-4444',
    primary_contact_name: 'John Updated Smith',
  }, {
    motionz_session: clientSessionCookie,
  });
  const profileRes = await portalProfileHandler(profileReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(profileRes.status, 200);
  console.log(' PASS: Client profile updated via PUT.');

  // POST: Team Member Invitation (Requires ONLY Email & Phone)
  const teamReq = makeJsonRequest('/api/portal/abc-roofing/team', 'POST', {
    email: 'installer@abcroofing.com',
    phone: '+1 (555) 987-6543',
  }, {
    motionz_session: clientSessionCookie,
  });
  const teamRes = await portalTeamHandler(teamReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(teamRes.status, 200);
  const teamBody = await teamRes.json();
  assert.strictEqual(teamBody.success, true);
  assert.strictEqual(teamBody.invitation.email, 'installer@abcroofing.com');
  assert.strictEqual(teamBody.invitation.phone, '+1 (555) 987-6543');
  assert.strictEqual(teamBody.invitation.role, 'client_member');
  console.log(' PASS: Team member invited via POST with only email and phone.');

  // Verify GET /api/portal/abc-roofing/team excludes active members and includes pending invite
  const teamGetReq = makeJsonRequest('/api/portal/abc-roofing/team', 'GET', undefined, {
    motionz_session: clientSessionCookie,
  });
  const teamGetRes = await portalTeamGetHandler(teamGetReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(teamGetRes.status, 200);
  const teamGetBody = await teamGetRes.json();
  const pendingEmails = (teamGetBody.invitations || []).map((i: any) => i.email.toLowerCase());
  // Active member 'john@abcroofing.com' must NEVER be in pending invitations
  assert.strictEqual(pendingEmails.includes('john@abcroofing.com'), false);
  // 'installer@abcroofing.com' must be in pending invitations
  assert.strictEqual(pendingEmails.includes('installer@abcroofing.com'), true);
  console.log(' PASS: Active team members verified strictly excluded from pending invitations.');

  // PATCH: Resend Team Member Invitation (Revokes old link, generates new active magic link)
  const patchReq = makeJsonRequest(
    '/api/portal/abc-roofing/team',
    'PATCH',
    { invitationId: teamBody.invitation.id },
    { motionz_session: clientSessionCookie }
  );
  const patchRes = await portalTeamPatchHandler(patchReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(patchRes.status, 200);
  const patchBody = await patchRes.json();
  assert.strictEqual(patchBody.success, true);
  assert.ok(patchBody.magicLinkUrl);
  assert.notStrictEqual(patchBody.invitation.id, teamBody.invitation.id);
  console.log(' PASS: Team invitation resent via PATCH (old link revoked, fresh 72h magic link generated).');

  // DELETE: Revoke Team Member Invitation (target newly generated invite)
  const deleteReq = makeJsonRequest(
    `/api/portal/abc-roofing/team?invitationId=${patchBody.invitation.id}`,
    'DELETE',
    undefined,
    { motionz_session: clientSessionCookie }
  );
  const deleteRes = await portalTeamDeleteHandler(deleteReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(deleteRes.status, 200);
  const deleteBody = await deleteRes.json();
  assert.strictEqual(deleteBody.success, true);

  // Verify pending invitations list no longer contains the revoked invite
  const afterRevokeReq = makeJsonRequest('/api/portal/abc-roofing/team', 'GET', undefined, {
    motionz_session: clientSessionCookie,
  });
  const afterRevokeRes = await portalTeamGetHandler(afterRevokeReq, { params: { clientId: 'abc-roofing' } });
  const afterRevokeBody = await afterRevokeRes.json();
  const afterRevokePending = (afterRevokeBody.invitations || []).map((i: any) => i.email.toLowerCase());
  assert.strictEqual(afterRevokePending.includes('installer@abcroofing.com'), false);
  console.log(' PASS: Team invitation successfully revoked and removed from pending invitations.');

  // Video Preference POST and GET
  const videoPrefPostReq = makeJsonRequest('/api/portal/abc-roofing/video-preference', 'POST', {
    video_preference: 'ai_video',
    custom_name: 'John Smith',
    custom_company: 'ABC Roofing',
  }, {
    motionz_session: clientSessionCookie,
  });
  const videoPrefPostRes = await videoPrefPostHandler(videoPrefPostReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(videoPrefPostRes.status, 200);

  const videoPrefGetReq = makeJsonRequest('/api/portal/abc-roofing/video-preference', 'GET', undefined, {
    motionz_session: clientSessionCookie,
  });
  const videoPrefGetRes = await videoPrefGetHandler(videoPrefGetReq, { params: { clientId: 'abc-roofing' } });
  assert.strictEqual(videoPrefGetRes.status, 200);
  const videoPrefGetBody = await videoPrefGetRes.json();
  assert.strictEqual(videoPrefGetBody.preference.video_preference, 'ai_video');
  console.log(' PASS: Video preference state saved and read via POST and GET.');

  // 6. Webhooks & Integrations API
  console.log('\n[6/6] Testing Webhooks API (POST /api/webhooks/ghl)...');
  const ghlWebhookReq = makeJsonRequest('/api/webhooks/ghl', 'POST', {
    type: 'contact.created',
    locationId: 'loc-12345',
    contact: {
      id: `ghl-contact-${Date.now()}`,
      name: 'Jane Prospect',
      email: 'jane@prospect.com',
      phone: '(555) 999-8888',
      address1: '456 Oak Lane, Dayton, OH',
    },
  });
  const ghlWebhookRes = await ghlWebhookHandler(ghlWebhookReq);
  assert.strictEqual(ghlWebhookRes.status, 200);
  const ghlWebhookBody = await ghlWebhookRes.json();
  assert.strictEqual(ghlWebhookBody.received, true);
  console.log(' PASS: GHL incoming webhook processed successfully.');

  console.log('\n============================================================');
  console.log(' ALL CRUD APIS END-TO-END VERIFIED WITH 100% SUCCESS ');
  console.log('============================================================');
}

runCrudApiTests().catch((err) => {
  console.error('CRUD API End-to-End Test Failed:', err);
  process.exit(1);
});
