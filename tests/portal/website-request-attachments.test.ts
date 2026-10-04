/**
 * Website change request attachments: multipart uploads are validated server-side
 * (session, count, size, type by MIME + extension + content), stored under the tenant's
 * prefix, linked in the staff email and recorded (names + paths only) in the audit log.
 */
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { resetStore, getStore, getTenantById } from '../../src/lib/db';
import { createSessionToken } from '../../src/lib/auth/session';
import { POST as websiteUpdateHandler } from '../../src/app/api/portal/[clientId]/website-update/route';
import { websiteChangeRequestEmail } from '../../src/lib/email';
import {
  getMockStoredFiles,
  resetMockStoredFiles,
  sanitizeFilename,
  MAX_ATTACHMENT_BYTES,
} from '../../src/lib/storage';

// Tests must never send real email.
for (const key of ['RESEND_API_KEY', 'BREVO_API_KEY']) delete process.env[key];

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_HEADER);
  return bytes;
}

interface TestFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

function multipartReq(
  clientId: string,
  fields: Record<string, string>,
  files: TestFile[],
  session?: string
): NextRequest {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) form.append('files', new Blob([file.bytes as unknown as BlobPart], { type: file.type }), file.name);
  const headers = new Headers();
  if (session) headers.set('cookie', `motionz_session=${session}`);
  // No explicit content-type: the multipart boundary is derived from the FormData body.
  return new NextRequest(`${BASE_URL}/api/portal/${clientId}/website-update`, { method: 'POST', headers, body: form });
}

/** Captures outgoing provider calls by pretending a Resend key is set and stubbing fetch. */
async function withCapturedEmail<T>(fn: () => Promise<T>): Promise<{ result: T; sent: any[] }> {
  const sent: any[] = [];
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key-not-real';
  globalThis.fetch = (async (url: any, init?: any) => {
    sent.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ id: `msg-${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fn();
    return { result, sent };
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
}

async function run() {
  console.log('--- Website change request attachment tests ---');
  resetStore();
  resetMockStoredFiles();

  const tenant = await getTenantById('abc-roofing');
  assert(tenant, 'demo tenant must exist');
  const clientId = 'abc-roofing';
  const ctx = { params: { clientId } };
  const session = createSessionToken('user-client-1', 'john@abcroofing.com', 'client', tenant!.id);
  const fields = { title: 'New logo', description: 'Please use the attached logo in the header.' };
  const requestCount = () => getStore().auditLogs.filter((l) => l.action === 'client.website_change_requested').length;

  // 1. Anonymous multipart requests are rejected and nothing is stored
  const anonRes = await websiteUpdateHandler(
    multipartReq(clientId, fields, [{ name: 'logo.png', type: 'image/png', bytes: pngBytes() }]),
    ctx
  );
  assert.strictEqual(anonRes.status, 401, 'anonymous upload must be 401');
  assert.strictEqual(getMockStoredFiles().size, 0, 'anonymous upload must not store files');
  assert.strictEqual(requestCount(), 0);
  console.log(' PASS: anonymous multipart request is rejected with 401.');

  // 2. Disallowed types are rejected with 400 (extension, MIME and content are all checked)
  const rejected: Array<[string, TestFile[]]> = [
    ['.exe file', [{ name: 'setup.exe', type: 'application/x-msdownload', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) }]],
    ['.exe claiming an image MIME type', [{ name: 'setup.exe', type: 'image/png', bytes: pngBytes() }]],
    ['image extension with a non-image MIME type', [{ name: 'logo.png', type: 'application/x-msdownload', bytes: pngBytes() }]],
    ['executable content renamed to .png', [{ name: 'logo.png', type: 'image/png', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]) }]],
    ['HTML file', [{ name: 'page.html', type: 'text/html', bytes: new TextEncoder().encode('<html></html>') }]],
    [
      'more than 3 files',
      [1, 2, 3, 4].map((i) => ({ name: `photo-${i}.png`, type: 'image/png', bytes: pngBytes() })),
    ],
  ];
  for (const [label, files] of rejected) {
    const res = await websiteUpdateHandler(multipartReq(clientId, fields, files, session), ctx);
    assert.strictEqual(res.status, 400, `${label} must be rejected with 400`);
    const data = await res.json();
    assert(!data.success, `${label} must not report success`);
    assert(typeof data.error === 'string' && data.error.length > 0, `${label} must explain the problem`);
  }
  assert.strictEqual(getMockStoredFiles().size, 0, 'rejected files must not be stored');
  assert.strictEqual(requestCount(), 0, 'rejected uploads must not be recorded');
  console.log(' PASS: disallowed types (.exe, mismatched MIME/extension/content, HTML) and a 4th file are rejected with 400.');

  // 3. Oversize file is rejected with 400
  const oversize = await websiteUpdateHandler(
    multipartReq(clientId, fields, [{ name: 'huge.png', type: 'image/png', bytes: pngBytes(MAX_ATTACHMENT_BYTES + 1) }], session),
    ctx
  );
  assert.strictEqual(oversize.status, 400, 'a file over 10 MB must be rejected with 400');
  assert(/10 MB/.test((await oversize.json()).error));
  assert.strictEqual(getMockStoredFiles().size, 0);
  assert.strictEqual(requestCount(), 0);
  console.log(' PASS: oversize file is rejected with 400.');

  // 4. Text validation still applies to multipart requests, and no file is stored when it fails
  const noTitle = await websiteUpdateHandler(
    multipartReq(clientId, { description: 'x' }, [{ name: 'logo.png', type: 'image/png', bytes: pngBytes() }], session),
    ctx
  );
  assert.strictEqual(noTitle.status, 400);
  assert.strictEqual(getMockStoredFiles().size, 0, 'no file may be stored for an invalid request');
  console.log(' PASS: multipart request without a title is rejected and stores nothing.');

  // 5. Allowed image succeeds: stored under the tenant prefix, linked in the email, recorded in the audit log
  const { result: okRes, sent } = await withCapturedEmail(() =>
    websiteUpdateHandler(
      multipartReq(
        clientId,
        { ...fields, targetPageUrl: 'abcroofing.com' },
        [{ name: '../My Logo (final).PNG', type: 'image/png', bytes: pngBytes(2048) }],
        session
      ),
      ctx
    )
  );
  assert.strictEqual(okRes.status, 200);
  const okData = await okRes.json();
  assert.strictEqual(okData.success, true);
  assert.strictEqual(okData.notified, 1);
  assert.deepStrictEqual(okData.attachments, [{ name: 'My-Logo-final.png', size: 2048 }]);

  const stored = Array.from(getMockStoredFiles().entries());
  assert.strictEqual(stored.length, 1, 'exactly one file is stored');
  const [storedPath, storedFile] = stored[0];
  assert(
    new RegExp(`^${tenant!.id}/[0-9a-f-]{36}-My-Logo-final\\.png$`).test(storedPath),
    `object path must be <tenantId>/<uuid>-<sanitized name>, got ${storedPath}`
  );
  assert.strictEqual(storedFile.bytes.byteLength, 2048);
  assert.strictEqual(storedFile.contentType, 'image/png');

  const record = getStore().auditLogs.find((l) => l.action === 'client.website_change_requested');
  assert(record, 'request must be recorded in the audit log');
  const details = record!.details as any;
  assert.deepStrictEqual(details.attachments, [
    { name: 'My-Logo-final.png', path: storedPath, size: 2048, contentType: 'image/png' },
  ]);
  assert(!JSON.stringify(details).includes('mock://'), 'audit log must not contain download URLs');
  assert.strictEqual(details.targetPageUrl, 'https://abcroofing.com/');

  assert.strictEqual(sent.length, 1, 'the assigned CSM is emailed');
  const expectedUrl = `mock://website-requests/${storedPath}`;
  assert(String(sent[0].body.text).includes('My-Logo-final.png'), 'email text names the attachment');
  assert(String(sent[0].body.text).includes(expectedUrl), 'email text links the attachment');
  assert(String(sent[0].body.html).includes(`href="${expectedUrl}"`), 'email html links the attachment');
  console.log(' PASS: allowed image is stored, linked in the email and recorded in the audit log.');

  // 6. A multipart request without files behaves like the JSON form
  const before = getMockStoredFiles().size;
  const noFiles = await websiteUpdateHandler(multipartReq(clientId, fields, [], session), ctx);
  assert.strictEqual(noFiles.status, 200);
  const noFilesData = await noFiles.json();
  assert.deepStrictEqual(noFilesData.attachments, []);
  assert.strictEqual(getMockStoredFiles().size, before);
  const latest = getStore().auditLogs.find((l) => l.id === noFilesData.requestId);
  assert(latest, 'request without files must be recorded');
  assert.strictEqual((latest!.details as any).attachments, undefined);
  console.log(' PASS: multipart request without files is accepted.');

  // 7. Filename sanitizing and email escaping
  assert.strictEqual(sanitizeFilename('..\\..\\etc/passwd.png'), 'passwd.png');
  assert.strictEqual(sanitizeFilename('.htaccess'), 'htaccess');
  assert.strictEqual(sanitizeFilename('a b<c>"d".jpg'), 'a-b-c-d.jpg');
  assert(!/[^A-Za-z0-9._-]/.test(sanitizeFilename('phöto \u{1F4CE} #1.webp')));
  const email = websiteChangeRequestEmail({
    to: 'csm@motionz.ai',
    companyName: 'ABC Roofing',
    requestedBy: 'john@abcroofing.com',
    title: 'Header',
    description: 'Swap the logo',
    portalUrl: 'http://localhost:3000/admin/clients/1',
    attachments: [{ name: '<b>logo</b>.png', url: 'https://example.com/a?x=1&y="2"', size: 5 * 1024 * 1024 }],
  });
  assert(!email.html.includes('<b>logo</b>'), 'attachment names are escaped in html');
  assert(email.html.includes('href="https://example.com/a?x=1&amp;y=&quot;2&quot;"'), 'attachment urls are escaped in html');
  assert(email.text.includes('<b>logo</b>.png (5.0 MB): https://example.com/a?x=1&y="2"'));
  console.log(' PASS: filenames are sanitized and attachment links are escaped in the email.');

  console.log('All website change request attachment tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
