import assert from 'assert';
import {
  resetStore,
  getStore,
  getTenantById,
  getClientSetupSteps,
  getLeads,
  getAppointments,
  getContracts,
  getOrders,
  getTeamMembers,
  updateTenantProfile,
  listTeamMemberInvitations,
} from '../../src/lib/db';
import { assertTenantAccess, hasPermission } from '../../src/lib/auth/permissions';
import { createInvitation } from '../../src/lib/auth/invitations';

async function runPortalIntegrationTests() {
  console.log('Running Client Portal Shell and Modules Integration Tests...');
  resetStore();

  const demoTenantId = 'tenant-demo-abc-roofing';

  // Test 1: Retrieve tenant portal data & calculate setup progress
  const tenant = await getTenantById(demoTenantId);
  assert(tenant !== null, 'Tenant must exist');
  assert.strictEqual(tenant?.name, 'ABC Roofing');

  const steps = await getClientSetupSteps(demoTenantId);
  assert.strictEqual(steps.length, 5, 'Must have 5 onboarding steps');

  const completedSteps = steps.filter((s) => s.status === 'done');
  assert.strictEqual(completedSteps.length, 3, 'Must have 3 completed steps initially');

  const percentage = Math.round((completedSteps.length / steps.length) * 100);
  assert.strictEqual(percentage, 60, 'Initial percentage is 60%');
  console.log('PASS: Client setup progress percentage calculated correctly (60%)');

  // Test 2: Cross-tenant isolation boundaries
  const clientUser = {
    role: 'client' as const,
    tenantId: 'tenant-peer-roofing-xyz',
  };

  assert.throws(() => {
    assertTenantAccess(clientUser, demoTenantId);
  }, /Forbidden: Unauthorized cross-tenant access attempt/);
  console.log('PASS: Cross-tenant isolation prevents unauthorized access');

  assert.doesNotThrow(() => {
    assertTenantAccess({ role: 'admin' }, demoTenantId);
  });
  assert.doesNotThrow(() => {
    assertTenantAccess({ role: 'csm' }, demoTenantId);
  });
  console.log('PASS: Internal staff authorized for multi-tenant management');

  // Test 3: Update company profile
  const updated = await updateTenantProfile(demoTenantId, {
    name: 'ABC Roofing & Restoration LLC',
    phone: '(555) 999-0000',
  });
  assert(updated !== null, 'Profile update must succeed');
  assert.strictEqual(updated?.name, 'ABC Roofing & Restoration LLC');
  assert.strictEqual(updated?.phone, '(555) 999-0000');
  console.log('PASS: Company profile successfully updated and persisted');

  // Test 4: Team member management and 72-hour magic-link invitations
  const members = await getTeamMembers(demoTenantId);
  assert(members.length >= 2, 'Must have at least 2 default team members');

  const inviteResult = await createInvitation({
    tenantId: demoTenantId,
    email: 'estimator@abcroofing.com',
    role: 'client_member',
    createdBy: 'john@abcroofing.com',
    expiresInHours: 72,
  });
  assert.strictEqual(inviteResult.invitation.email, 'estimator@abcroofing.com');
  assert.strictEqual(inviteResult.rawToken.length, 64, 'Token must be 64-char hex string (32 bytes)');
  assert(inviteResult.magicLinkUrl.includes('/auth/verify?token='), 'Magic link URL format valid');

  const pendingInvites = await listTeamMemberInvitations(demoTenantId);
  assert(pendingInvites.some((inv) => inv.email === 'estimator@abcroofing.com'), 'New invite listed');
  console.log('PASS: Team invitation and 72-hour magic-link generation verified');

  // Test 5: Leads, appointments, contracts, and orders records
  const leads = await getLeads(demoTenantId);
  assert.strictEqual(leads.length, 3, 'Must have 3 leads in mock store');
  assert.strictEqual(leads[0].status, 'Appointment Booked');

  const appointments = await getAppointments(demoTenantId);
  assert.strictEqual(appointments.length, 1, 'Must have 1 appointment in mock store');
  assert.strictEqual(appointments[0].status, 'confirmed');

  const contracts = await getContracts(demoTenantId);
  assert.strictEqual(contracts.length, 1, 'Must have 1 signed contract');
  assert.strictEqual(contracts[0].ghl_document_id, 'doc_ghl_9874');

  const orders = await getOrders(demoTenantId);
  assert.strictEqual(orders.length, 1, 'Must have 1 fulfillment order');
  assert.strictEqual(orders[0].stage, 'shipped');
  assert.strictEqual(orders[0].carrier, 'FedEx Freight');
  console.log('PASS: Leads, appointments, contracts, and orders data integrity verified');

  // Test 6: Capability permission guards
  assert.strictEqual(hasPermission('client', 'profile:update'), true);
  assert.strictEqual(hasPermission('client', 'team:invite'), true);
  assert.strictEqual(hasPermission('client', 'client:view_leads'), true);
  assert.strictEqual(hasPermission('client', 'client:view_contract'), true);
  assert.strictEqual(hasPermission('client', 'portal:delete'), false);
  assert.strictEqual(hasPermission('client', 'portal:feature_toggle'), false);
  assert.strictEqual(hasPermission('client_member', 'profile:update'), false);
  assert.strictEqual(hasPermission('client_member', 'team:invite'), false);
  console.log('PASS: Client and team member permission guards verified');

  console.log('ALL CLIENT PORTAL INTEGRATION TESTS PASSED CLEANLY.');
}

runPortalIntegrationTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
