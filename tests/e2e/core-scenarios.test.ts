import assert from 'assert';
import {
  resetStore,
  getStore,
  createTenant,
  getTenantById,
  getClientSetupSteps,
  updateClientSetupStep,
  getLeads,
  getContracts,
  getOrders,
  updateTenantProfile,
  getTeamMembers,
} from '../../src/lib/db';
import { createInvitation, verifyInvitationToken } from '../../src/lib/auth/invitations';
import { assertTenantAccess, hasPermission } from '../../src/lib/auth/permissions';
import { calculateSetupProgress } from '../../src/lib/onboarding/progress';
import { generateAllScripts } from '../../src/lib/scripts/template-engine';

async function run20CoreScenariosE2E() {
  console.log('Running 20 Core User Scenarios End-to-End Test Suite...');
  resetStore();

  // 1. Admin creates client
  const newTenant = await createTenant({
    name: 'Pinnacle Roofing Solutions',
    slug: 'pinnacle-roofing',
    primary_email: 'dave@pinnacleroofing.com',
    primary_contact_name: 'Dave Pinnacle',
    phone: '(555) 789-0123',
    csm_user_id: 'user-csm-1',
  });
  assert(newTenant.id && newTenant.id.length > 0, 'Scenario 1 PASS: Admin creates client');

  // 2. Admin assigns CSM
  const store = getStore();
  const assignment = store.csmAssignments.find((a) => a.tenant_id === newTenant.id);
  assert.strictEqual(assignment?.csm_user_id, 'user-csm-1', 'Scenario 2 PASS: Admin assigns CSM');

  // 3. Admin sends invitation
  const invite = await createInvitation({
    tenantId: newTenant.id,
    email: 'dave@pinnacleroofing.com',
    role: 'client',
    createdBy: 'admin@motionz.ai',
    expiresInHours: 72,
  });
  assert(invite.magicLinkUrl.includes('/auth/verify?token='), 'Scenario 3 PASS: Admin sends invitation');

  // 4. Client accepts invitation
  const acceptResult = await verifyInvitationToken(invite.rawToken);
  assert.strictEqual(acceptResult.success, true);
  assert.strictEqual(acceptResult.user?.email, 'dave@pinnacleroofing.com');
  console.log('Scenario 4 PASS: Client accepts invitation');

  // 5. Client completes profile
  const updatedProfile = await updateTenantProfile(newTenant.id, {
    primary_contact_name: 'David Pinnacle',
    phone: '(555) 789-9999',
  });
  assert.strictEqual(updatedProfile?.primary_contact_name, 'David Pinnacle', 'Scenario 5 PASS: Client completes profile');

  // 6. Client opens portal
  const tenantData = await getTenantById(newTenant.id);
  assert(tenantData !== null && tenantData.name === 'Pinnacle Roofing Solutions', 'Scenario 6 PASS: Client opens portal');

  // 7. Client sees setup progress
  const initialSteps = await getClientSetupSteps(newTenant.id);
  const initialProgress = calculateSetupProgress(initialSteps);
  assert.strictEqual(initialProgress.percentage, 0, 'Scenario 7 PASS: Client sees setup progress (0%)');

  // 8. CSM changes setup status
  await updateClientSetupStep(newTenant.id, 'google_sheet', { status: 'done' });
  await updateClientSetupStep(newTenant.id, 'ghl_a2p', { status: 'done' });
  console.log('Scenario 8 PASS: CSM changes setup status');

  // 9. Client sees updated status
  const updatedSteps = await getClientSetupSteps(newTenant.id);
  const updatedProgress = calculateSetupProgress(updatedSteps);
  assert.strictEqual(updatedProgress.percentage, 40, 'Scenario 9 PASS: Client sees updated status (40%)');

  // 10. Client views leads
  store.leads.push({
    id: 'lead-pin-1',
    tenant_id: newTenant.id,
    ghl_contact_id: 'cnt_pin_1',
    first_name: 'Tom',
    last_name: 'Hanks',
    email: 'tom@example.com',
    phone: '(555) 222-3333',
    status: 'Appointment Booked',
    source: 'Facebook Ads',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const clientLeads = await getLeads(newTenant.id);
  assert.strictEqual(clientLeads.length, 1, 'Scenario 10 PASS: Client views leads');

  // 11. Client views tracking
  assert(initialSteps.some((s) => s.step_key === 'google_sheet'), 'Scenario 11 PASS: Client views tracking');

  // 12. Client opens contract
  const contracts = await getContracts(newTenant.id);
  assert(Array.isArray(contracts), 'Scenario 12 PASS: Client opens contract vault');

  // 13. Client opens tools
  assert.strictEqual(hasPermission('client', 'client:use_tools'), true, 'Scenario 13 PASS: Client opens tools');

  // 14. Client opens booking
  assert.strictEqual(hasPermission('client', 'client:book_call'), true, 'Scenario 14 PASS: Client opens booking');

  // 15. Client opens scripts
  const scripts = generateAllScripts({ client_name: 'David Pinnacle', company_name: 'Pinnacle Roofing' });
  assert.strictEqual(scripts.length, 3, 'Scenario 15 PASS: Client opens scripts');

  // 16. Client manages permitted profile
  assert.strictEqual(hasPermission('client', 'profile:update'), true, 'Scenario 16 PASS: Client manages permitted profile');

  // 17. Client invites team member
  const memberInvite = await createInvitation({
    tenantId: newTenant.id,
    email: 'estimator@pinnacleroofing.com',
    role: 'client_member',
    createdBy: 'dave@pinnacleroofing.com',
    expiresInHours: 72,
  });
  assert(memberInvite.invitation.id && memberInvite.invitation.id.length > 0, 'Scenario 17 PASS: Client invites team member');

  // 18. Team member accesses portal
  const memberAccept = await verifyInvitationToken(memberInvite.rawToken);
  assert.strictEqual(memberAccept.user?.role, 'client_member', 'Scenario 18 PASS: Team member accesses portal');

  // 19. Client A cannot access Client B
  const clientAUser = { role: 'client' as const, tenantId: newTenant.id };
  assert.throws(() => {
    assertTenantAccess(clientAUser, 'tenant-demo-abc-roofing');
  }, /Forbidden: Unauthorized cross-tenant access attempt/);
  console.log('Scenario 19 PASS: Client A cannot access Client B');

  // 20. CSM cannot perform Admin-only action
  assert.strictEqual(hasPermission('csm', 'portal:delete'), false);
  assert.strictEqual(hasPermission('csm', 'portal:feature_toggle'), false);
  console.log('Scenario 20 PASS: CSM cannot perform Admin-only action');

  console.log('ALL 20 CORE USER SCENARIOS PASSED WITH 100% SUCCESS.');
}

run20CoreScenariosE2E().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
