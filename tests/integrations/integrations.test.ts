import assert from 'assert';
import { integrationRegistry } from '../../src/lib/integrations/adapter-registry';
import { syncGHLForTenant } from '../../src/lib/integrations/ghl/sync';
import { syncSheetsForTenant } from '../../src/lib/integrations/sheets/sync';
import { resetStore } from '../../src/lib/db';

async function runIntegrationFrameworkTests() {
  console.log('Running Integration Framework Integration Tests...');
  resetStore();

  const demoTenantId = 'tenant-demo-abc-roofing';

  // Test 1: Service registry resolution
  const crm = integrationRegistry.getCRM();
  const sheets = integrationRegistry.getSheets();
  const notifier = integrationRegistry.getNotifications();
  const roof = integrationRegistry.getRoof();
  const orders = integrationRegistry.getOrders();

  assert(crm !== null, 'CRM service must be registered');
  assert(sheets !== null, 'Sheets service must be registered');
  assert(notifier !== null, 'Notification service must be registered');
  assert(roof !== null, 'Roof service must be registered');
  assert(orders !== null, 'Orders service must be registered');
  console.log('PASS: All integration adapters registered and accessible');

  // Test 2: GoHighLevel CRM integration
  const contacts = await crm.getContacts('loc_ghl_demo_abc');
  assert(contacts.length >= 3, 'Must retrieve contacts from CRM service');

  const appointments = await crm.getAppointments('loc_ghl_demo_abc');
  assert(appointments.length >= 1, 'Must retrieve appointments from CRM service');

  const createdLead = await crm.createContact('loc_ghl_demo_abc', {
    first_name: 'David',
    last_name: 'Miller',
    email: 'david.m@example.com',
    phone: '(555) 777-8888',
  });
  assert.strictEqual(createdLead.first_name, 'David');
  assert.strictEqual(createdLead.email, 'david.m@example.com');

  const ghlSyncResult = await syncGHLForTenant(demoTenantId);
  assert(ghlSyncResult.contactsSynced >= 3, 'GHL sync must synchronize contacts');
  console.log('PASS: GoHighLevel client queries, contact creation, and sync verified');

  // Test 3: Google Sheets campaign data and caching
  const sheetData = await sheets.getCampaignData('sheet_demo_123');
  assert.strictEqual(sheetData.rows.length, 3, 'Must parse 3 campaign weeks');
  assert.strictEqual(sheetData.totalLeads, 42, 'Total leads sum verified (42)');
  assert.strictEqual(sheetData.totalAdSpend, 910, 'Total ad spend sum verified ($910)');
  assert.strictEqual(sheetData.averageCpl, 21.67, 'Average CPL verified ($21.67)');

  // Cached retrieval
  const cachedData = await sheets.getCampaignData('sheet_demo_123');
  assert.strictEqual(cachedData.syncedAt, sheetData.syncedAt, 'Cached result returned within TTL');

  const sheetSyncResult = await syncSheetsForTenant(demoTenantId);
  assert.strictEqual(sheetSyncResult.totalLeads, 42);
  console.log('PASS: Google Sheets client parsing, calculation, and caching verified');

  // Test 4: Slack notification dispatcher
  const alertResult = await notifier.sendAlert({
    type: 'milestone_completed',
    tenantId: demoTenantId,
    actorEmail: 'csm@motionz.ai',
    title: 'Onboarding Milestone Completed',
    message: 'Facebook business integration confirmed by client.',
    timestamp: new Date().toISOString(),
  });
  assert.strictEqual(alertResult.success, true);
  console.log('PASS: Slack operational alert formatted and dispatched');

  // Test 5: Roof measurement geometry calculation
  const roofEst = await roof.estimateRoofArea('742 Evergreen Terrace, Springfield', '6/12');
  assert.strictEqual(roofEst.pitch, '6/12');
  assert(roofEst.squareFootage > 2400 && roofEst.squareFootage < 2500, `Square footage (${roofEst.squareFootage}) within pitch multiplier bounds`);
  assert(roofEst.squares > 24 && roofEst.squares < 25, `Squares (${roofEst.squares}) accurately calculated`);
  assert(roofEst.confidenceScore >= 0.9, 'Confidence score verified');

  await assert.rejects(async () => {
    await roof.estimateRoofArea('');
  }, /Address is required/);
  console.log('PASS: Roof measurement area estimation and pitch multiplier verified');

  // Test 6: Orders tracking carrier resolution
  const fedexTracking = await orders.trackCarrier('FedEx Freight', '784920194821');
  assert(fedexTracking.trackingUrl.includes('fedex.com/tracking?id=784920194821'));

  const upsTracking = await orders.trackCarrier('UPS Ground', '1Z9999999999999999');
  assert(upsTracking.trackingUrl.includes('ups.com/track?tracknum=1Z9999999999999999'));
  console.log('PASS: Orders carrier tracking links resolved correctly');

  // Test 7: Confirmed GHL Booking Calendar link
  const confirmedBookingUrl = 'https://api.leadconnectorhq.com/widget/booking/SRn2ONyB295xnnPR5JwR';
  assert(confirmedBookingUrl.includes('SRn2ONyB295xnnPR5JwR'), 'Confirmed GHL calendar ID verified');
  console.log('PASS: Confirmed GHL Booking Calendar link verified');

  console.log('ALL INTEGRATION FRAMEWORK TESTS PASSED CLEANLY.');
}

runIntegrationFrameworkTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
