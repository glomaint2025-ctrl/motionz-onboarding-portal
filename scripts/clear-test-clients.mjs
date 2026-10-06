// Clears every CLIENT from the database in .env.local (staging test data): tenants with all their
// data, their portal users and Supabase Auth logins, and unmatched onboarding submissions.
// Staff accounts, settings, templates, scripts and audit logs are kept.
// Usage: node scripts/clear-test-clients.mjs [--only=<tenant id>] [--apply --yes-this-is-staging]
//   (without --apply it only reports; with --only it removes just that one client)
// Safety: refuses to run when NODE_ENV=production, and deleting needs BOTH --apply and
// --yes-this-is-staging. It prints the database host first: check it is the staging project.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const apply = process.argv.includes('--apply');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length) || null;

// This script deletes EVERY client. It must never touch the production database.
const dbHost = (() => {
  try {
    return new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
  } catch {
    return '(no database configured in .env.local)';
  }
})();
if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
  console.error('Refusing to run: NODE_ENV is "production". This script is for the staging database only.');
  process.exit(1);
}
if (apply && !process.argv.includes('--yes-this-is-staging')) {
  console.error(
    `Refusing to delete: --apply also needs --yes-this-is-staging.\n` +
      `The database in .env.local is ${dbHost}. Check that it is the STAGING project, then run:\n` +
      `  node scripts/clear-test-clients.mjs ${only ? `--only=${only} ` : ''}--apply --yes-this-is-staging`
  );
  process.exit(1);
}
console.log(`Database: ${dbHost}`);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function listAuthUsers() {
  const all = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < 200) return all;
  }
}

const tenants = (await must(db.from('tenants').select('id, name, status'))).filter((t) => !only || t.id === only);
const clientUsers = (await must(db.from('users').select('id, email, role, tenant_id').in('role', ['client', 'client_member']))).filter((u) => !only || u.tenant_id === only);
const unmatched = only ? [] : await must(db.from('onboarding_submissions').select('id').is('tenant_id', null));
const clientEmails = new Set(clientUsers.map((u) => u.email.toLowerCase()));
const authUsers = (await listAuthUsers()).filter((u) => u.email && clientEmails.has(u.email.toLowerCase()));

console.log(`Clients: ${tenants.map((t) => `${t.name} (${t.status})`).join(', ') || 'none'}`);
console.log(`Client users: ${clientUsers.map((u) => `${u.email} [${u.role}]`).join(', ') || 'none'}`);
console.log(`Auth logins to remove: ${authUsers.length}; unmatched onboarding submissions: ${unmatched.length}`);

if (!apply) {
  console.log('Dry run only. Re-run with --apply --yes-this-is-staging to delete.');
  process.exit(0);
}

if (clientUsers.length) await must(db.from('users').delete().in('id', clientUsers.map((u) => u.id)));
for (const u of authUsers) {
  const { error } = await db.auth.admin.deleteUser(u.id);
  if (error) console.error(`Could not remove login ${u.email}: ${error.message}`);
}
await must(only ? db.from('user_invitations').delete().eq('tenant_id', only) : db.from('user_invitations').delete().in('role', ['client', 'client_member']));
if (unmatched.length) await must(db.from('onboarding_submissions').delete().is('tenant_id', null));
for (const t of tenants) {
  const { error } = await db.from('tenants').delete().eq('id', t.id);
  console.log(error ? `Could not delete ${t.name}: ${error.message}` : `Deleted ${t.name}`);
}
console.log('Done.');
