import assert from 'assert';
import { paginate, debounce } from '../../src/lib/utils/debounce';

async function runPerformanceOptimizationTests() {
  console.log('Running Performance Optimization Test Suite...');

  // Test 1: High-Volume Table Pagination (1,000+ items)
  const mockHighVolumeLeads = Array.from({ length: 1250 }, (_, i) => ({
    id: `lead-perf-${i}`,
    name: `Lead #${i}`,
    email: `lead${i}@example.com`,
  }));

  const page1 = paginate(mockHighVolumeLeads, 1, 25);
  assert.strictEqual(page1.items.length, 25, 'Page 1 must contain exactly 25 rows');
  assert.strictEqual(page1.totalPages, 50, 'Total pages must be 50 (1250 / 25)');
  assert.strictEqual(page1.hasNextPage, true);
  assert.strictEqual(page1.hasPrevPage, false);

  const page50 = paginate(mockHighVolumeLeads, 50, 25);
  assert.strictEqual(page50.items.length, 25);
  assert.strictEqual(page50.hasNextPage, false);
  assert.strictEqual(page50.hasPrevPage, true);
  console.log('PASS: High-volume row pagination verified (1,250 rows in bounded slices)');

  // Test 2: Input Debouncing Behavior
  let executionCount = 0;
  let lastVal = '';
  const debouncedSearch = debounce((query: string) => {
    executionCount++;
    lastVal = query;
  }, 50);

  debouncedSearch('r');
  debouncedSearch('ro');
  debouncedSearch('roof');
  debouncedSearch('roofing');

  assert.strictEqual(executionCount, 0, 'Debounced function must not execute synchronously');

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.strictEqual(executionCount, 1, 'Debounced function must execute exactly once for trailing input');
  assert.strictEqual(lastVal, 'roofing');
  console.log('PASS: Search input debouncing verified');

  console.log('ALL PERFORMANCE OPTIMIZATION TESTS PASSED CLEANLY.');
}

runPerformanceOptimizationTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
