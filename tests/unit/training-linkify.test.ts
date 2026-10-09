import assert from 'assert';
import { splitTextWithLinks } from '../../src/lib/training/linkify';

async function runTrainingLinkifyUnitTests() {
  console.log('Running Training Link Helper Unit Tests...');

  const DOC = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit?usp=sharing';

  // No link: one text piece, unchanged. Empty text: nothing.
  assert.deepStrictEqual(splitTextWithLinks('Watch this first.'), [{ kind: 'text', text: 'Watch this first.' }]);
  assert.deepStrictEqual(splitTextWithLinks(''), []);

  // A link inside a sentence.
  assert.deepStrictEqual(splitTextWithLinks(`Read ${DOC} before the call`), [
    { kind: 'text', text: 'Read ' },
    { kind: 'link', text: DOC, href: DOC },
    { kind: 'text', text: ' before the call' },
  ]);

  // Only a link, and two links with line breaks kept in the text.
  assert.deepStrictEqual(splitTextWithLinks(DOC), [{ kind: 'link', text: DOC, href: DOC }]);
  const two = splitTextWithLinks('One https://a.example/x\nTwo https://b.example/y');
  assert.deepStrictEqual(
    two.filter((p) => p.kind === 'link').map((p) => (p as any).href),
    ['https://a.example/x', 'https://b.example/y']
  );
  assert.strictEqual(two.map((p) => p.text).join(''), 'One https://a.example/x\nTwo https://b.example/y', 'the text is never lost');

  // Punctuation after a link is not part of it.
  assert.deepStrictEqual(splitTextWithLinks('See https://a.example/x.'), [
    { kind: 'text', text: 'See ' },
    { kind: 'link', text: 'https://a.example/x', href: 'https://a.example/x' },
    { kind: 'text', text: '.' },
  ]);
  assert.strictEqual((splitTextWithLinks('(see https://a.example/x), then') [1] as any).href, 'https://a.example/x');
  assert.strictEqual((splitTextWithLinks('https://en.wikipedia.org/wiki/Tom_(film) ok')[0] as any).href, 'https://en.wikipedia.org/wiki/Tom_(film)');

  // Only https is linked: http, javascript: and bare domains stay plain text.
  for (const text of ['http://a.example/x', 'javascript:alert(1)', 'docs.google.com/document/d/abc', 'https://', 'ftp://a.example']) {
    assert.deepStrictEqual(splitTextWithLinks(text), [{ kind: 'text', text }], `${text} is not linked`);
  }

  // Markup is just text: the pieces are rendered by React, never as HTML.
  const markup = splitTextWithLinks('<script>alert(1)</script> https://a.example/x');
  assert.strictEqual(markup[0].kind, 'text');
  assert.strictEqual(markup[0].text, '<script>alert(1)</script> ');

  console.log('ALL TRAINING LINK HELPER UNIT TESTS PASSED CLEANLY.');
}

runTrainingLinkifyUnitTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
