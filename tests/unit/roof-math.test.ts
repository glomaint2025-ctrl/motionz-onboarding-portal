import assert from 'assert';
import { roofMeasurementAdapter } from '../../src/lib/integrations/roof/adapter';

async function runRoofMathUnitTests() {
  console.log('Running Roof Math & Calculation Unit Tests...');

  // Test pitch multiplier formula: sqrt(1 + (rise / 12)^2)
  // For 6/12 pitch: multiplier = sqrt(1 + 0.25) = sqrt(1.25) = 1.11803...
  const est6_12 = await roofMeasurementAdapter.estimateRoofArea('100 Test St', '6/12');
  const expected6_12 = Math.round(2200 * Math.sqrt(1 + Math.pow(6 / 12, 2)));
  assert.strictEqual(est6_12.squareFootage, expected6_12);
  assert.strictEqual(est6_12.squares, Number((expected6_12 / 100).toFixed(1)));

  // For 12/12 pitch: multiplier = sqrt(1 + 1) = sqrt(2) = 1.4142...
  const est12_12 = await roofMeasurementAdapter.estimateRoofArea('100 Test St', '12/12');
  const expected12_12 = Math.round(2200 * Math.sqrt(2));
  assert.strictEqual(est12_12.squareFootage, expected12_12);
  assert.strictEqual(est12_12.squares, Number((expected12_12 / 100).toFixed(1)));

  // Flat/Low pitch 0/12 fallback or 3/12
  const est3_12 = await roofMeasurementAdapter.estimateRoofArea('100 Test St', '3/12');
  assert(est3_12.squareFootage < est6_12.squareFootage);
  assert(est6_12.squareFootage < est12_12.squareFootage);

  console.log('ALL ROOF MATH UNIT TESTS PASSED CLEANLY.');
}

runRoofMathUnitTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
