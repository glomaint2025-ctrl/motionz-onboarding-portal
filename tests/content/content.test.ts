import assert from 'assert';
import {
  interpolateScript,
  generateAllScripts,
  DEFAULT_SCRIPT_TEMPLATES,
} from '../../src/lib/scripts/template-engine';
import {
  resetStore,
  getClientScriptPreference,
  setClientScriptPreference,
} from '../../src/lib/db';
import { roofMeasurementAdapter } from '../../src/lib/integrations/roof/adapter';

async function runContentAndToolsTests() {
  console.log('Running Content and Tools Integration Tests...');
  resetStore();

  const demoTenantId = 'tenant-demo-abc-roofing';

  // Test 1: Variable interpolation engine
  const sampleTpl = 'Hello, this is {{client_name}} from {{company_name}}. Reach out to {{client_name}} today!';
  const interpolated = interpolateScript(sampleTpl, {
    client_name: 'John Smith',
    company_name: 'ABC Roofing',
  });
  assert.strictEqual(
    interpolated,
    'Hello, this is John Smith from ABC Roofing. Reach out to John Smith today!'
  );
  console.log('PASS: Video script variable interpolation verified');

  // Test 2: Fallback handling when variables are omitted
  const fallbackInterpolated = interpolateScript(sampleTpl, {
    client_name: '',
    company_name: '',
  });
  assert.strictEqual(
    fallbackInterpolated,
    'Hello, this is Owner from Our Roofing Company. Reach out to Owner today!'
  );
  console.log('PASS: Interpolation engine fallback variables verified');

  // Test 3: Generate all 3 baseline video scripts
  const allScripts = generateAllScripts({
    client_name: 'Sarah Connor',
    company_name: 'Apex Restorations',
  });
  assert.strictEqual(allScripts.length, 3, 'Must generate exactly 3 script templates');
  assert(allScripts[0].content.includes('Sarah Connor'));
  assert(allScripts[0].content.includes('Apex Restorations'));
  assert(allScripts[1].content.includes('Sarah Connor'));
  assert(allScripts[2].content.includes('Sarah Connor'));
  console.log('PASS: All 3 baseline video scripts generated without AI dependencies');

  // Test 4: Video preference state management
  const initialPref = await getClientScriptPreference(demoTenantId);
  assert(initialPref !== null, 'Initial preference must exist in mock store');
  assert.strictEqual(initialPref?.video_preference, 'ai_video');

  const updatedPref = await setClientScriptPreference(
    demoTenantId,
    'self_filmed',
    'Sarah Connor',
    'Apex Restorations'
  );
  assert.strictEqual(updatedPref.video_preference, 'self_filmed');
  assert.strictEqual(updatedPref.custom_name, 'Sarah Connor');
  assert.strictEqual(updatedPref.custom_company, 'Apex Restorations');

  const reloaded = await getClientScriptPreference(demoTenantId);
  assert.strictEqual(reloaded?.video_preference, 'self_filmed');
  console.log('PASS: Video preference state workflow persisted');

  // Test 5: Roof measurement pitch calculations
  const est6_12 = await roofMeasurementAdapter.estimateRoofArea('123 Elm St', '6/12');
  const est8_12 = await roofMeasurementAdapter.estimateRoofArea('123 Elm St', '8/12');
  const est12_12 = await roofMeasurementAdapter.estimateRoofArea('123 Elm St', '12/12');

  assert(est8_12.squareFootage > est6_12.squareFootage, 'Steeper pitch 8/12 must yield greater area than 6/12');
  assert(est12_12.squareFootage > est8_12.squareFootage, 'Steeper pitch 12/12 must yield greater area than 8/12');
  assert.strictEqual(est6_12.squares, Number((est6_12.squareFootage / 100).toFixed(1)));
  console.log('PASS: Roof measurement pitch multiplier and squares calculation verified');

  console.log('ALL CONTENT AND TOOLS INTEGRATION TESTS PASSED CLEANLY.');
}

runContentAndToolsTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
