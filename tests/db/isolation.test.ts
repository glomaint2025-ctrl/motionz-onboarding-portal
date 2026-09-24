import assert from 'assert';
import {
  getStore,
  resetStore,
  createTenant,
  getClientSetupSteps,
  updateClientSetupStep,
  getLeads,
  getContracts,
  getOrders,
  getFeatureToggles,
  setFeatureToggle,
  logAuditEvent,
  listAuditLogs,
} from '../../src/lib/db';

async function runTenantIsolationTests() {
  console.log('Running Multi-Tenant Isolation Tests...');
  resetStore();

  // Test 1: Verify Initial Demo Tenant Data Exists
  const store = getStore();
  const demoTenant = store.tenants.find((t) => t.slug === 'abc-roofing');
  assert(demoTenant !== undefined, 'Demo tenant ABC Roofing must exist in initial store');
  console.log('PASS: Demo tenant exists');

  // Test 2: Provision a Second Tenant (Client B: Summit Pro)
  const tenantB = await createTenant({
    name: 'Summit Pro Restorations',
    slug: 'summit-pro',
    primary_email: 'mike@summitpro.com',
    primary_contact_name: 'Mike Evans',
  });
  assert(tenantB.id !== demoTenant.id, 'Tenant B must have distinct ID from Tenant A');
  console.log('PASS: Tenant B successfully provisioned with unique ID');

  // Test 3: Verify Tenant B has its own cloned setup steps
  const stepsA = await getClientSetupSteps(demoTenant.id);
  const stepsB = await getClientSetupSteps(tenantB.id);

  assert.strictEqual(stepsA.length, 5, 'Tenant A must have 5 setup steps');
  assert.strictEqual(stepsB.length, 5, 'Tenant B must have 5 setup steps');
  assert.notStrictEqual(stepsA[0].id, stepsB[0].id, 'Step IDs between tenants must be completely distinct');
  console.log('PASS: Setup steps cloned independently per tenant');

  // Test 4: Mutate Tenant A step; verify Tenant B step is UNTOUCHED
  await updateClientSetupStep(demoTenant.id, 'google_sheet', {
    status: 'done',
    right_now: 'Tenant A custom tracking note',
  });

  const updatedStepA = (await getClientSetupSteps(demoTenant.id)).find((s) => s.step_key === 'google_sheet');
  const stepB = (await getClientSetupSteps(tenantB.id)).find((s) => s.step_key === 'google_sheet');

  assert.strictEqual(updatedStepA?.right_now, 'Tenant A custom tracking note');
  assert.notStrictEqual(stepB?.right_now, 'Tenant A custom tracking note', 'Tenant B must NOT reflect Tenant A mutation');
  assert.strictEqual(stepB?.status, 'not_started', 'Tenant B step status must remain unchanged');
  console.log('PASS: Tenant mutation isolation verified (No cross-tenant leakage)');

  // Test 5: Verify Leads Isolation
  const leadsA = await getLeads(demoTenant.id);
  const leadsB = await getLeads(tenantB.id);
  assert(leadsA.length > 0, 'Tenant A has demo leads');
  assert.strictEqual(leadsB.length, 0, 'Tenant B has zero leads initially');
  console.log('PASS: Lead collection tenant isolation verified');

  // Test 6: Verify Feature Toggle Isolation
  await setFeatureToggle(demoTenant.id, 'roof_measurement', false);
  const togglesA = await getFeatureToggles(demoTenant.id);
  const togglesB = await getFeatureToggles(tenantB.id);

  assert.strictEqual(togglesA.roof_measurement, false, 'Tenant A roof_measurement toggled off');
  assert.strictEqual(togglesB.roof_measurement, true, 'Tenant B roof_measurement must remain enabled');
  console.log('PASS: Feature toggle isolation verified');

  // Test 7: Verify Audit Log Scoping
  await logAuditEvent({
    tenantId: demoTenant.id,
    actorEmail: 'admin@motionz.ai',
    actorRole: 'admin',
    action: 'test.tenant_a_event',
  });

  const logsA = await listAuditLogs(demoTenant.id);
  const logsB = await listAuditLogs(tenantB.id);

  assert(logsA.some((l) => l.action === 'test.tenant_a_event'), 'Tenant A logs contain event');
  assert(!logsB.some((l) => l.action === 'test.tenant_a_event'), 'Tenant B logs must NOT contain Tenant A event');
  console.log('PASS: Audit log tenant isolation verified');

  console.log('ALL MULTI-TENANT ISOLATION TESTS PASSED CLEANLY.');
}

runTenantIsolationTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
