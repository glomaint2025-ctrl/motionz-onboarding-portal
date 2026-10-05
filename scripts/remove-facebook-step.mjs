// One-off data fix matching migration 20261005000001_remove_facebook_step.sql, for databases
// where the SQL editor is not at hand. Uses the service-role key from .env.local.
// Usage: node scripts/remove-facebook-step.mjs [--apply]   (without --apply it only reports)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const apply = process.argv.includes('--apply');

async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function renumber(table, groupColumn) {
  const rows = await must(db.from(table).select(`id, ${groupColumn}, sort_order`).order('sort_order'));
  const groups = new Map();
  for (const row of rows) {
    const list = groups.get(row[groupColumn]) || [];
    list.push(row);
    groups.set(row[groupColumn], list);
  }
  let changed = 0;
  for (const list of groups.values()) {
    for (const [i, row] of list.entries()) {
      if (row.sort_order !== i + 1) {
        changed++;
        if (apply) await must(db.from(table).update({ sort_order: i + 1 }).eq('id', row.id));
      }
    }
  }
  return changed;
}

const clientSteps = await must(db.from('client_setup_steps').select('id').eq('step_key', 'facebook'));
const templateSteps = await must(db.from('template_steps').select('id').eq('step_key', 'facebook'));
console.log(`Facebook steps: ${clientSteps.length} client, ${templateSteps.length} template`);

if (apply) {
  await must(db.from('client_setup_steps').delete().eq('step_key', 'facebook'));
  await must(db.from('template_steps').delete().eq('step_key', 'facebook'));
}
console.log(`Renumbered: ${await renumber('template_steps', 'template_id')} template rows, ${await renumber('client_setup_steps', 'tenant_id')} client rows`);
console.log(apply ? 'Applied.' : 'Dry run only. Re-run with --apply to change data.');
