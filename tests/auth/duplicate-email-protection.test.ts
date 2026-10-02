import assert from 'assert';
import { POST as adminClientsPostHandler } from '../../src/app/api/admin/clients/route';
import { POST as portalTeamPostHandler } from '../../src/app/api/portal/[clientId]/team/route';
import { invitationService } from '../../src/lib/services/invitation.service';
import { tenantService } from '../../src/lib/services/tenant.service';
import { userRepository, tenantRepository, resetStore, getStore } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}
// Tests must never send real email or create real Google Sheets.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY', 'GOOGLE_SHEETS_SCRIPT_URL', 'GHL_WEBHOOK_SECRET']) delete process.env[key];

import { NextRequest } from 'next/server';

const BASE_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function makeAuthRequest(pathOrUrl: string, method: string, body: any, sessionToken?: string): NextRequest {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const headers = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': `test-ip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });
  if (sessionToken) {
    headers.set('cookie', `motionz_session=${sessionToken}`);
  }
  return new NextRequest(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

async function runDuplicateEmailTests() {
  console.log('--- Running Duplicate Email Protection & Message Format Test Matrix ---');
  resetStore();
  const store = getStore();

  const demoTenantId = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';
  const adminToken = createSessionToken('user-admin-1', 'admin@motionz.ai', 'admin');
  const clientToken = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', demoTenantId);

  // 1. userRepository.create duplicate blocking
  console.log('[1/6] Testing userRepository.create duplicate email blocking...');
  let userCreateThrew = false;
  try {
    await userRepository.create({
      email: 'admin@motionz.ai',
      full_name: 'Imposter Admin',
      role: 'admin',
    });
  } catch (err: any) {
    userCreateThrew = true;
    assert.strictEqual(err.message, 'An account with this email already exists.');
    assert.strictEqual(err.statusCode, 400);
  }
  assert.strictEqual(userCreateThrew, true, 'userRepository.create must reject existing email');
  console.log(' PASS: userRepository.create rejected duplicate user with exact message');

  // 2. tenantService.provisionClient duplicate blocking
  console.log('[2/6] Testing tenantService.provisionClient duplicate email blocking...');
  let provisionThrew = false;
  try {
    await tenantService.provisionClient({
      name: 'Duplicate Company',
      primary_email: 'csm@motionz.ai',
    });
  } catch (err: any) {
    provisionThrew = true;
    assert.strictEqual(err.message, 'An account with this email already exists.');
    assert.strictEqual(err.statusCode, 400);
  }
  assert.strictEqual(provisionThrew, true, 'tenantService.provisionClient must reject email of existing CSM');

  let provisionTenantEmailThrew = false;
  try {
    await tenantService.provisionClient({
      name: 'Duplicate Client Company',
      primary_email: 'john@abcroofing.com',
    });
  } catch (err: any) {
    provisionTenantEmailThrew = true;
    assert.strictEqual(err.message, 'An account with this email already exists.');
    assert.strictEqual(err.statusCode, 400);
  }
  assert.strictEqual(provisionTenantEmailThrew, true, 'tenantService.provisionClient must reject email of existing client');
  console.log(' PASS: tenantService.provisionClient rejected duplicate email across CSM and client');

  // 3. POST /api/admin/clients duplicate email blocking
  console.log('[3/6] Testing POST /api/admin/clients duplicate email rejection...');
  const adminReqDuplicate = makeAuthRequest(
    '/api/admin/clients',
    'POST',
    {
      name: 'Second Company',
      primary_email: 'john@abcroofing.com',
    },
    adminToken
  );
  const adminRes = await adminClientsPostHandler(adminReqDuplicate);
  assert.strictEqual(adminRes.status, 400, 'Must return 400 status');
  const adminData = await adminRes.json();
  assert.strictEqual(adminData.error, 'An account with this email already exists.');

  const adminReqDuplicateCSM = makeAuthRequest(
    '/api/admin/clients',
    'POST',
    {
      name: 'Third Company',
      primary_email: 'csm@motionz.ai',
    },
    adminToken
  );
  const adminResCSM = await adminClientsPostHandler(adminReqDuplicateCSM);
  assert.strictEqual(adminResCSM.status, 400);
  const adminDataCSM = await adminResCSM.json();
  // Staff emails are rejected outright for client accounts (client answer P1.1).
  assert.match(adminDataCSM.error, /@motionz.ai addresses are for Motionz staff only/);
  console.log(' PASS: Admin cannot create client with email of existing user or tenant');

  // 4. POST /api/portal/[clientId]/team duplicate email rejection
  console.log('[4/6] Testing POST /api/portal/[clientId]/team duplicate email rejection...');
  const memberDuplicateReq = makeAuthRequest(
    `/api/portal/${demoTenantId}/team`,
    'POST',
    {
      email: 'sarah@abcroofing.com', // existing client_member
      phone: '+1 555 123 4567',
    },
    clientToken
  );
  const memberRes = await portalTeamPostHandler(memberDuplicateReq as any, { params: { clientId: demoTenantId } });
  assert.strictEqual(memberRes.status, 400, 'Must return 400 for existing member email');
  const memberData = await memberRes.json();
  assert.strictEqual(memberData.error, 'An account with this email already exists.');

  // Try inviting admin email as member
  const memberInviteAdminReq = makeAuthRequest(
    `/api/portal/${demoTenantId}/team`,
    'POST',
    {
      email: 'admin@motionz.ai',
      phone: '+1 555 987 6543',
    },
    clientToken
  );
  const memberInviteAdminRes = await portalTeamPostHandler(memberInviteAdminReq as any, { params: { clientId: demoTenantId } });
  assert.strictEqual(memberInviteAdminRes.status, 400);
  const memberInviteAdminData = await memberInviteAdminRes.json();
  assert.strictEqual(memberInviteAdminData.error, 'An account with this email already exists.');
  console.log(' PASS: Team member invite blocked when email belongs to existing member or admin');

  // 5. invitationService.createInvitation duplicate email blocking
  console.log('[5/6] Testing invitationService.createInvitation duplicate email rejection...');
  let inviteThrew = false;
  try {
    await invitationService.createInvitation({
      tenantId: demoTenantId,
      email: 'john@abcroofing.com',
      role: 'client',
      createdBy: 'admin@motionz.ai',
    });
  } catch (err: any) {
    inviteThrew = true;
    assert.strictEqual(err.message, 'An account with this email already exists.');
    assert.strictEqual(err.statusCode, 400);
  }
  assert.strictEqual(inviteThrew, true, 'createInvitation must reject existing client email');
  console.log(' PASS: invitationService.createInvitation blocked duplicate email');

  // 6. Revoked invitation message format verification
  console.log('[6/6] Testing revoked invitation error message format...');
  const { rawToken, invitation } = await invitationService.createInvitation({
    tenantId: demoTenantId,
    email: 'brandnewuser@example.com',
    role: 'client_member',
    createdBy: 'john@abcroofing.com',
  });

  await invitationService.revokeInvitation(invitation.id, 'john@abcroofing.com', 'client');

  const validationResult = await invitationService.validateInvitation(rawToken);
  assert.strictEqual(validationResult.valid, false);
  assert.strictEqual(
    validationResult.error,
    'This invitation has been revoked.',
    'Message must be "This invitation has been revoked." without "by an administrator"'
  );

  let verifyThrew = false;
  try {
    await invitationService.verifyAndAccept(rawToken);
  } catch (err: any) {
    verifyThrew = true;
    assert.strictEqual(
      err.message,
      'This invitation has been revoked.',
      'verifyAndAccept error must be "This invitation has been revoked."'
    );
  }
  assert.strictEqual(verifyThrew, true, 'verifyAndAccept on revoked token must throw AppError');
  console.log(' PASS: Revoked invitation message is cleanly "This invitation has been revoked."');

  console.log('\n================================================================');
  console.log(' ALL DUPLICATE EMAIL & REVOKED MESSAGE TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runDuplicateEmailTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
