import assert from 'assert';
import { getStore, resetStore, getClientSetupSteps, updateClientSetupStep } from '../../src/lib/db';
import { hasPermission } from '../../src/lib/auth/permissions';

async function runCsmWorkspaceTests() {
  console.log('Running CSM Workspace Integration Tests...');
  resetStore();

  const demoTenantId = 'tenant-demo-abc-roofing';

  // Test 1: CSM fetches assigned client setup steps
  const steps = await getClientSetupSteps(demoTenantId);
  assert.strictEqual(steps.length, 4, 'Client must have exactly 4 setup steps');
  console.log('PASS: CSM retrieves assigned client setup steps');

  // Test 2: Calculate initial progress percentage
  const completedInitial = steps.filter((s) => s.status === 'done').length;
  const initialPercent = Math.round((completedInitial / steps.length) * 100);
  assert.strictEqual(initialPercent, 50, 'Initial progress is 50% (2 of 4 done)');
  console.log('PASS: Initial progress percentage verified (50%)');

  // Test 3: CSM updates step status and guidance copy
  const updated = await updateClientSetupStep(demoTenantId, 'ghl_a2p', {
    status: 'done',
    right_now: 'Carrier 10DLC registration verified and approved by TCR.',
    we_need_from_you: 'No further action required.',
  });

  assert(updated !== null, 'Step must update successfully');
  assert.strictEqual(updated?.status, 'done');
  assert.strictEqual(updated?.right_now, 'Carrier 10DLC registration verified and approved by TCR.');

  // Test 4: Verify progress percentage recalculates dynamically
  const updatedSteps = await getClientSetupSteps(demoTenantId);
  const completedNew = updatedSteps.filter((s) => s.status === 'done').length;
  const newPercent = Math.round((completedNew / updatedSteps.length) * 100);
  assert.strictEqual(completedNew, 3, '3 of 4 steps now marked done');
  assert.strictEqual(newPercent, 75, 'Progress percentage dynamically recalculated to 75%');
  console.log('PASS: Step status update and dynamic progress recalculation verified (75%)');

  // Test 5: Verify CSM Permission Guard Boundaries
  assert.strictEqual(hasPermission('csm', 'onboarding:update_status'), true, 'CSM has permission to update status');
  assert.strictEqual(hasPermission('csm', 'onboarding:edit_content'), true, 'CSM has permission to edit guidance text');
  assert.strictEqual(hasPermission('csm', 'portal:delete'), false, 'CSM CANNOT delete portals');
  assert.strictEqual(hasPermission('csm', 'portal:feature_toggle'), false, 'CSM CANNOT toggle Admin feature flags');
  console.log('PASS: CSM role boundaries and restrictions verified');

  console.log('ALL CSM WORKSPACE INTEGRATION TESTS PASSED CLEANLY.');
}

runCsmWorkspaceTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
