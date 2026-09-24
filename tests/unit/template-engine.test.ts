import assert from 'assert';
import {
  interpolateScript,
  generateAllScripts,
} from '../../src/lib/scripts/template-engine';

async function runTemplateEngineUnitTests() {
  console.log('Running Template Engine Unit Tests...');

  const template = 'Owner {{client_name}} represents {{company_name}} at {{company_name}} headquarters.';
  const res = interpolateScript(template, {
    client_name: 'Bob Vance',
    company_name: 'Vance Refrigeration & Roofing',
  });

  assert.strictEqual(
    res,
    'Owner Bob Vance represents Vance Refrigeration & Roofing at Vance Refrigeration & Roofing headquarters.'
  );

  // Whitespace variations inside double braces
  const templateWithSpaces = 'Welcome to {{   company_name   }} led by {{ client_name }}.';
  const resSpaces = interpolateScript(templateWithSpaces, {
    client_name: 'Alice',
    company_name: 'Apex Builders',
  });
  assert.strictEqual(resSpaces, 'Welcome to Apex Builders led by Alice.');

  // Baseline script generation
  const all = generateAllScripts({ client_name: 'Michael', company_name: 'Dunder Roofing' });
  assert.strictEqual(all.length, 3);
  all.forEach((s) => {
    assert(!s.content.includes('{{client_name}}'));
    assert(!s.content.includes('{{company_name}}'));
    assert(s.content.includes('Michael'));
    assert(s.content.includes('Dunder Roofing'));
  });

  console.log('ALL TEMPLATE ENGINE UNIT TESTS PASSED CLEANLY.');
}

runTemplateEngineUnitTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
