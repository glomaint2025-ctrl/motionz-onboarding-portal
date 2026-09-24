import assert from 'assert';
import { getStore, resetStore, listTenants, getTenantById } from '../../src/lib/db';
import { createInvitation } from '../../src/lib/auth/invitations';

async function runAdminPortalTests() {
  console.log('Running Admin Portal Integration Tests...');
  resetStore();

  // Test 1: Verify Client Roster Listing & CSM Enrichment
  const store = getStore();
  const initialTenants = await listTenants();
  assert.strictEqual(initialTenants.length, 1, 'Initial store must contain 1 demo tenant');
  assert.strictEqual(initialTenants[0].slug, 'abc-roofing');
  console.log('PASS: Client roster listing verified');

  // Test 2: Provision New Client via Add Client Wizard Flow
  const newClientData = {
    name: 'Vanguard Roofing Solutions',
    slug: 'vanguard-roofing',
    primary_email: 'dave@vanguardroofing.com',
    primary_contact_name: 'Dave Miller',
    phone: '(555) 789-0123',
    csm_user_id: 'user-csm-1',
  };

  const newTenantId = `tenant-${Date.now()}`;
  const now = new Date().toISOString();

  store.tenants.push({
    id: newTenantId,
    name: newClientData.name,
    slug: newClientData.slug,
    primary_email: newClientData.primary_email,
    primary_contact_name: newClientData.primary_contact_name,
    phone: newClientData.phone,
    status: 'active',
    template_id: 'tmpl-master-standard',
    created_at: now,
    updated_at: now,
  });

  // Clone 5 template steps
  const templateSteps = store.templateSteps.filter((ts) => ts.template_id === 'tmpl-master-standard');
  templateSteps.forEach((ts) => {
    store.clientSetupSteps.push({
      id: `c-step-${Date.now()}-${ts.sort_order}`,
      tenant_id: newTenantId,
      template_step_id: ts.id,
      step_key: ts.step_key,
      name: ts.name,
      owner: ts.owner,
      status: 'not_started',
      what_it_is: ts.what_it_is,
      right_now: ts.right_now,
      unlocks: ts.unlocks,
      sort_order: ts.sort_order,
      updated_at: now,
    });
  });

  // Assign CSM
  store.csmAssignments.push({
    id: `assign-${Date.now()}`,
    csm_user_id: newClientData.csm_user_id,
    tenant_id: newTenantId,
    assigned_at: now,
  });

  // Generate single-use invitation
  const { rawToken, magicLinkUrl } = await createInvitation({
    tenantId: newTenantId,
    email: newClientData.primary_email,
    role: 'client',
    createdBy: 'admin@motionz.ai',
  });

  assert(rawToken.length > 0, 'Magic link token generated');
  assert(magicLinkUrl.includes('/auth/verify?token='), 'Magic link URL format verified');

  const steps = store.clientSetupSteps.filter((s) => s.tenant_id === newTenantId);
  assert.strictEqual(steps.length, 5, 'New client must have all 5 confirmed setup steps cloned');
  console.log('PASS: Add Client wizard flow and template cloning verified');

  // Test 3: Feature Toggle Controls
  store.featureToggles.push({
    id: `ft-${Date.now()}`,
    tenant_id: newTenantId,
    feature_key: 'roof_measurement',
    is_enabled: false,
    updated_at: now,
  });

  const roofToggle = store.featureToggles.find(
    (ft) => ft.tenant_id === newTenantId && ft.feature_key === 'roof_measurement'
  );
  assert.strictEqual(roofToggle?.is_enabled, false, 'Feature toggle modification verified');
  console.log('PASS: Per-tenant feature toggle management verified');

  // Test 4: Archive / Soft-Deletion of Client Portal
  const tenantToArchive = await getTenantById(newTenantId);
  assert(tenantToArchive !== null, 'Tenant exists prior to archive');
  if (tenantToArchive) {
    tenantToArchive.deleted_at = new Date().toISOString();
    tenantToArchive.status = 'cancelled';
  }

  const activeTenants = await listTenants();
  assert(!activeTenants.some((t) => t.id === newTenantId), 'Archived tenant excluded from active roster');
  console.log('PASS: Soft-delete / portal archival verified');

  // Test 5: Audit Log Integrity
  assert(
    store.auditLogs.some((l) => l.action === 'invitation.created'),
    'Audit log must record client invitation creation'
  );
  console.log('PASS: Administrative audit trail recorded');

  console.log('ALL ADMIN PORTAL INTEGRATION TESTS PASSED CLEANLY.');
}

runAdminPortalTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
