import assert from 'assert';
import {
  interpolateScript,
  generateAllScripts,
  generateScriptsFromTemplates,
  countWords,
  estimateReadSeconds,
  TESTIMONIAL_NAME_PLACEHOLDER,
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
    assert.strictEqual(s.category, 'ai_video', 'baseline scripts are the educational AI video scripts');
  });

  // Testimonial token: a real name when known, a visible blank (never an invented name) when not
  const testimonialTpl = 'Homeowners like {{testimonial_name}} trust {{ company_name }}.';
  assert.strictEqual(
    interpolateScript(testimonialTpl, { client_name: 'Al', company_name: 'Apex', testimonial_name: 'Maria Lopez' }),
    'Homeowners like Maria Lopez trust Apex.'
  );
  assert.strictEqual(
    interpolateScript(testimonialTpl, { client_name: 'Al', company_name: 'Apex' }),
    `Homeowners like ${TESTIMONIAL_NAME_PLACEHOLDER} trust Apex.`
  );
  // "$" in a company name is inserted literally
  assert.strictEqual(interpolateScript('{{company_name}}', { client_name: '', company_name: 'Save $& Co' }), 'Save $& Co');

  // Stored templates keep their category; unknown/missing categories fall back to bonus
  const generated = generateScriptsFromTemplates(
    [
      { id: 'a', title: 'A', script_content: 'Hi {{client_name}}', category: 'pain_point' },
      { id: 'b', title: 'B', script_content: 'Hi', category: null },
    ],
    { client_name: 'Pat', company_name: 'Peak' }
  );
  assert.strictEqual(generated[0].content, 'Hi Pat');
  assert.strictEqual(generated[0].category, 'pain_point');
  assert.strictEqual(generated[1].category, 'bonus');

  // Read time at ~150 words per minute
  assert.strictEqual(countWords('  one two\nthree  '), 3);
  assert.strictEqual(estimateReadSeconds('word '.repeat(75)), 30);
  assert.strictEqual(estimateReadSeconds(''), 0);

  console.log('ALL TEMPLATE ENGINE UNIT TESTS PASSED CLEANLY.');
}

runTemplateEngineUnitTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
