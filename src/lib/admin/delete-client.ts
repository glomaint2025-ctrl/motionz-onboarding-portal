/**
 * Deleting a client for good ("Delete permanently" on the admin client pages).
 *
 * What goes, and how:
 * - The tenant row. Every table that holds a client's data points at it with ON DELETE CASCADE
 *   (users, csm_assignments, user_invitations, client_setup_steps, feature_toggles,
 *   integration_configs, contracts, orders, client_script_preferences, roof_measurements, leads,
 *   appointments, onboarding_submissions, lead_requests), so the database removes those rows itself.
 * - Not covered by a foreign key, so removed here: the Supabase Auth sign-ins of the client's
 *   people, their password reset links (kept by email) and the files in the portal's own storage
 *   buckets (website-requests, onboarding-files, avatars).
 *
 * What stays:
 * - audit_logs and security_events (their tenant_id becomes NULL: ON DELETE SET NULL).
 * - The client's Google Drive folder and files. Only the access to them is taken away.
 *
 * Order: Drive access -> sign-ins -> tenant row (cascade) -> reset links and stored files.
 * Sign-ins go before the rows so a failure can be finished by pressing the button again; the
 * other way round would leave sign-ins that nothing in the portal points at any more.
 */
import { getStore, type DatabaseStore } from '../db/mock-db';
import { getSupabaseServiceClient } from '../db/supabase-client';
import {
  auditLogRepository,
  integrationConfigRepository,
  securityEventRepository,
  tenantRepository,
  userRepository,
} from '../db/repositories';
import type { Tenant, User } from '../db/schema';
import { syncClientDriveAccess } from '../integrations/sheets/access';
import {
  AVATAR_BUCKET,
  ONBOARDING_FILES_BUCKET,
  WEBSITE_REQUEST_BUCKET,
  getMockOnboardingFiles,
  getMockStoredAvatars,
  getMockStoredFiles,
} from '../storage';

export const CONFIRM_NAME_ERROR = "Type the client's name exactly to confirm.";
export const DRIVE_KEPT_NOTE = 'Their Google Drive folder was kept. Delete it in Drive if you no longer need it.';

type ServiceClient = NonNullable<ReturnType<typeof getSupabaseServiceClient>>;

/** Tables whose rows the database removes together with the tenant (ON DELETE CASCADE), with their in-memory twin. */
const CASCADING: Array<{ key: keyof ClientDeleteCounts; table: string; store: keyof DatabaseStore }> = [
  { key: 'people', table: 'users', store: 'users' },
  { key: 'invitations', table: 'user_invitations', store: 'userInvitations' },
  { key: 'csmAssignments', table: 'csm_assignments', store: 'csmAssignments' },
  { key: 'setupSteps', table: 'client_setup_steps', store: 'clientSetupSteps' },
  { key: 'moduleSwitches', table: 'feature_toggles', store: 'featureToggles' },
  { key: 'integrations', table: 'integration_configs', store: 'integrationConfigs' },
  { key: 'contracts', table: 'contracts', store: 'contracts' },
  { key: 'orders', table: 'orders', store: 'orders' },
  { key: 'videoPreferences', table: 'client_script_preferences', store: 'clientScriptPreferences' },
  { key: 'roofMeasurements', table: 'roof_measurements', store: 'roofMeasurements' },
  { key: 'leads', table: 'leads', store: 'leads' },
  { key: 'appointments', table: 'appointments', store: 'appointments' },
  { key: 'onboardingSubmissions', table: 'onboarding_submissions', store: 'onboardingSubmissions' },
  { key: 'leadRequests', table: 'lead_requests', store: 'leadRequests' },
];

export interface ClientDeleteCounts {
  people: number;
  signIns: number;
  invitations: number;
  csmAssignments: number;
  setupSteps: number;
  moduleSwitches: number;
  integrations: number;
  contracts: number;
  orders: number;
  videoPreferences: number;
  roofMeasurements: number;
  leads: number;
  appointments: number;
  onboardingSubmissions: number;
  leadRequests: number;
  passwordResetLinks: number;
  files: number;
}

export type ClientDeleteResult =
  | {
      ok: true;
      name: string;
      counts: ClientDeleteCounts;
      /** Leftovers that could not be cleaned up (stored files, reset links). The client itself is gone. */
      warnings: string[];
      driveNote: string;
      driveFolderUrl: string | null;
      /** Set when Drive access could not be taken away. */
      driveAccessWarning?: string;
    }
  | { ok: false; status: number; error: string; deleted: string[]; notDeleted: string[] };

const norm = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The typed name must be the client's name; upper/lower case and outer spaces do not matter. */
export function confirmNameMatches(tenant: Pick<Tenant, 'name'>, typed: unknown): boolean {
  return typeof typed === 'string' && norm(typed) !== '' && norm(typed) === norm(tenant.name);
}

async function countRows(supabase: ServiceClient | null, tenantId: string): Promise<Partial<ClientDeleteCounts>> {
  const counts: Partial<ClientDeleteCounts> = {};
  if (!supabase) {
    const store = getStore();
    for (const t of CASCADING) counts[t.key] = (store[t.store] as Array<{ tenant_id?: string }>).filter((r) => r.tenant_id === tenantId).length;
    return counts;
  }
  await Promise.all(
    CASCADING.map(async (t) => {
      try {
        const { count } = await supabase.from(t.table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
        counts[t.key] = count ?? 0;
      } catch {
        counts[t.key] = 0; // only a number for the history entry; never a reason to stop
      }
    })
  );
  return counts;
}

/** Every object below a folder of a bucket (the portal's folders are at most two levels deep). */
async function listObjects(supabase: ServiceClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(error.message);
    for (const entry of data || []) {
      const path = `${prefix}/${entry.name}`;
      // A folder has no id.
      if (entry.id === null && depth < 3) paths.push(...(await listObjects(supabase, bucket, path, depth + 1)));
      else if (entry.id !== null) paths.push(path);
    }
    if (!data || data.length < 1000) return paths;
  }
}

/** Removes the client's files from the portal's own storage. Returns how many went and what could not be removed. */
async function removeStoredFiles(supabase: ServiceClient | null, tenantId: string, users: User[]): Promise<{ removed: number; problems: string[] }> {
  const folders: Array<{ bucket: string; prefix: string; mock: Map<string, unknown> }> = [
    { bucket: WEBSITE_REQUEST_BUCKET, prefix: tenantId, mock: getMockStoredFiles() },
    { bucket: ONBOARDING_FILES_BUCKET, prefix: tenantId, mock: getMockOnboardingFiles() },
    ...users.map((u) => ({ bucket: AVATAR_BUCKET, prefix: `users/${u.id}`, mock: getMockStoredAvatars() })),
  ];
  let removed = 0;
  const failed = new Set<string>();
  for (const folder of folders) {
    if (!supabase) {
      for (const path of Array.from(folder.mock.keys())) {
        if (path.startsWith(`${folder.prefix}/`) && folder.mock.delete(path)) removed++;
      }
      continue;
    }
    try {
      const paths = await listObjects(supabase, folder.bucket, folder.prefix);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await supabase.storage.from(folder.bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error(error.message);
        removed += Math.min(100, paths.length - i);
      }
    } catch (err: any) {
      // A bucket that was never created simply has nothing in it.
      if (/not found|does not exist/i.test(err?.message || '')) continue;
      console.error(`[client-delete] Files in ${folder.bucket}/${folder.prefix} could not be removed: ${err?.message}`);
      failed.add(folder.bucket);
    }
  }
  return {
    removed,
    problems: failed.size
      ? [`Some uploaded files could not be removed from the portal's storage (${Array.from(failed).join(', ')}). They are private and no longer linked to anyone.`]
      : [],
  };
}

async function removeResetLinks(supabase: ServiceClient | null, emails: string[]): Promise<{ removed: number; problems: string[] }> {
  if (emails.length === 0) return { removed: 0, problems: [] };
  if (!supabase) {
    const store = getStore();
    const before = store.passwordResetTokens.length;
    store.passwordResetTokens = store.passwordResetTokens.filter((t) => !emails.includes(norm(t.email)));
    return { removed: before - store.passwordResetTokens.length, problems: [] };
  }
  try {
    const { data, error } = await supabase.from('password_reset_tokens').delete().in('email', emails).select('id');
    if (error) throw new Error(error.message);
    return { removed: data?.length ?? 0, problems: [] };
  } catch (err: any) {
    console.error(`[client-delete] Password reset links could not be removed: ${err?.message}`);
    return { removed: 0, problems: ['Old password reset links could not be removed. They no longer work, because the accounts are gone.'] };
  }
}

/** Removes each person's Supabase Auth sign-in. A person with no sign-in is fine: there is nothing to remove. */
async function removeSignIns(supabase: ServiceClient, users: User[]): Promise<{ removed: string[]; failed: string[] }> {
  const notFound = (error: { status?: number; message: string } | null) =>
    Boolean(error && (error.status === 404 || /not found/i.test(error.message)));

  // Older rows can have an id that differs from their auth id; those are found by email, read once.
  let byEmail: Map<string, string> | null = null;
  const authIdByEmail = async (email: string): Promise<string | null> => {
    if (!byEmail) {
      byEmail = new Map();
      for (let page = 1; page <= 25; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        for (const u of data?.users || []) if (u.email) byEmail.set(norm(u.email), u.id);
        if (!data?.users || data.users.length < 200) break;
      }
    }
    return byEmail.get(norm(email)) || null;
  };

  const removed: string[] = [];
  const failed: string[] = [];
  for (const user of users) {
    try {
      let res = UUID.test(user.id) ? await supabase.auth.admin.deleteUser(user.id) : null;
      if (res && !res.error) {
        removed.push(user.email);
        continue;
      }
      if (!res || notFound(res.error)) {
        const fallbackId = await authIdByEmail(user.email);
        res = fallbackId && fallbackId !== user.id ? await supabase.auth.admin.deleteUser(fallbackId) : null;
        if (res && !res.error) removed.push(user.email);
      }
      if (res?.error && !notFound(res.error)) throw new Error(res.error.message);
    } catch (err: any) {
      console.error(`[client-delete] Sign-in for ${user.id} could not be removed: ${err?.message}`);
      failed.push(user.email);
    }
  }
  return { removed, failed };
}

/** The in-memory store has no foreign keys, so it does by hand what the database does on its own. */
function cascadeInMemory(tenantId: string): void {
  const store = getStore() as unknown as Record<string, Array<{ tenant_id?: string }>>;
  for (const t of CASCADING) store[t.store] = store[t.store].filter((r) => r.tenant_id !== tenantId);
  // ON DELETE SET NULL: the history stays, without the link to the client.
  for (const key of ['auditLogs', 'securityEvents']) {
    for (const row of store[key]) if (row.tenant_id === tenantId) row.tenant_id = undefined;
  }
}

async function recordIncomplete(tenant: Tenant, actorEmail: string, details: Record<string, unknown>): Promise<void> {
  try {
    await securityEventRepository.record({
      tenant_id: tenant.id,
      event_type: 'client_delete_incomplete',
      severity: 'high',
      details: { client: tenant.name, actorEmail, ...details },
    });
  } catch (err: any) {
    console.error(`[client-delete] The security event for ${tenant.id} could not be written: ${err?.message}`);
  }
}

/**
 * Deletes one client and everything that belongs to it. The caller has already checked that the
 * actor is an admin and that the client's name was typed. Never throws.
 */
export async function deleteClientPermanently(tenant: Tenant, actor: { email: string }): Promise<ClientDeleteResult> {
  const supabase = getSupabaseServiceClient();
  const deleted: string[] = [];
  const everything = ['the client and all of its portal data'];

  // ---- 1. What is there (nothing is changed yet).
  let users: User[];
  let driveFolderUrl: string | null = null;
  let rowCounts: Partial<ClientDeleteCounts>;
  try {
    users = await userRepository.listByTenant(tenant.id);
    const integrations = await integrationConfigRepository.listByTenant(tenant.id);
    driveFolderUrl = integrations.find((i) => i.integration_type === 'google_sheets')?.config_data?.folder_url || null;
    rowCounts = await countRows(supabase, tenant.id);
  } catch (err: any) {
    console.error(`[client-delete] Could not read client ${tenant.id}: ${err?.message}`);
    return { ok: false, status: 500, error: `Could not read ${tenant.name}. Nothing was deleted. Please try again.`, deleted, notDeleted: everything };
  }

  // Deleting the tenant row removes every user that points at it. Staff must never go that way.
  const staff = users.filter((u) => u.role === 'admin' || u.role === 'csm');
  if (staff.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `${staff.map((u) => u.email).join(', ')} is a Motionz staff account linked to this client, so it would be deleted too. Nothing was deleted.`,
      deleted,
      notDeleted: everything,
    };
  }
  const emails = Array.from(new Set(users.map((u) => norm(u.email)).filter(Boolean)));

  // ---- 2. Google Drive: nobody keeps access to this client's folder and files. The folder itself stays.
  let driveAccessWarning: string | undefined;
  try {
    const access = await syncClientDriveAccess(tenant.id, { actorEmail: actor.email, actorRole: 'admin', clientRemoved: true });
    // Only problems with THIS client's files matter here. A staff address Google cannot share the main
    // folder with (not a Google account) has nothing to do with the client being deleted.
    const relevant = access.warnings.filter((w) => !/the main Drive folder/i.test(w));
    if (!access.skipped && relevant.length > 0) {
      driveAccessWarning = `Google Drive access could not be fully removed. Check who can open the folder in Drive. ${relevant.join(' ')}`.trim();
    }
  } catch (err: any) {
    driveAccessWarning = 'Google Drive access could not be removed. Check who can open the folder in Drive.';
    console.error(`[client-delete] Drive access for ${tenant.id} could not be removed: ${err?.message}`);
  }

  // ---- 3. Sign-ins (Supabase Auth). Not linked by a foreign key, so they are removed one by one.
  let signIns = 0;
  if (supabase && users.length > 0) {
    const result = await removeSignIns(supabase, users);
    signIns = result.removed.length;
    if (result.removed.length > 0) deleted.push(`${plural(result.removed.length, 'sign-in')} (${result.removed.join(', ')})`);
    if (result.failed.length > 0) {
      if (result.removed.length > 0) {
        await recordIncomplete(tenant, actor.email, {
          problem: 'Some sign-ins were removed, but the client was not deleted.',
          signInsRemoved: result.removed,
          signInsNotRemoved: result.failed,
        });
      }
      return {
        ok: false,
        status: 500,
        error:
          `Could not remove the sign-in for ${result.failed.join(', ')}, so ${tenant.name} was not deleted. ` +
          (result.removed.length > 0 ? `Already removed: the sign-in for ${result.removed.join(', ')}. ` : 'Nothing was deleted. ') +
          'Press Delete permanently again to finish.',
        deleted,
        notDeleted: [`the sign-in for ${result.failed.join(', ')}`, ...everything],
      };
    }
  }

  // ---- 4. The tenant row. The database removes everything that belongs to it in the same step.
  try {
    await tenantRepository.hardDelete(tenant.id);
    if (!supabase) cascadeInMemory(tenant.id);
  } catch (err: any) {
    console.error(`[client-delete] Client ${tenant.id} could not be deleted: ${err?.message}`);
    if (signIns > 0) {
      // Sign-ins without their client must never go unnoticed.
      await recordIncomplete(tenant, actor.email, {
        problem: 'The sign-ins were removed, but the client and its data could not be deleted.',
        signInsRemoved: users.map((u) => u.email),
      });
    }
    return {
      ok: false,
      status: 500,
      error:
        signIns > 0
          ? `The people at ${tenant.name} can no longer sign in, but the client and its data could not be deleted. Press Delete permanently again to finish.`
          : `${tenant.name} could not be deleted. Nothing was deleted. Please try again.`,
      deleted,
      notDeleted: everything,
    };
  }

  // ---- 5. Leftovers that no foreign key reaches. The client is gone; a problem here is only reported.
  const resetLinks = await removeResetLinks(supabase, emails);
  const files = await removeStoredFiles(supabase, tenant.id, users);
  const warnings = [...resetLinks.problems, ...files.problems];

  const counts: ClientDeleteCounts = {
    people: 0, invitations: 0, csmAssignments: 0, setupSteps: 0, moduleSwitches: 0, integrations: 0, contracts: 0, orders: 0,
    videoPreferences: 0, roofMeasurements: 0, leads: 0, appointments: 0, onboardingSubmissions: 0, leadRequests: 0,
    ...rowCounts,
    signIns,
    passwordResetLinks: resetLinks.removed,
    files: files.removed,
  };

  // ---- 6. History. Written once the client is really gone; it carries the name, because the id now leads nowhere.
  try {
    await auditLogRepository.create({
      actor_email: actor.email,
      actor_role: 'admin',
      action: 'tenant.deleted_permanently',
      resource_type: 'tenant',
      resource_id: tenant.id,
      details: {
        client: tenant.name,
        clientEmail: tenant.primary_email,
        statusBefore: tenant.deleted_at ? 'archived' : tenant.status,
        people: counts.people,
        leads: counts.leads,
        leadRequests: counts.leadRequests,
        removed: counts,
        driveFolderKept: true,
        ...(driveFolderUrl ? { driveFolderUrl } : {}),
        ...(driveAccessWarning ? { driveAccessWarning } : {}),
        ...(warnings.length ? { warnings } : {}),
      },
    });
  } catch (err: any) {
    console.error(`[client-delete] The history entry for ${tenant.id} could not be written: ${err?.message}`);
  }

  return { ok: true, name: tenant.name, counts, warnings, driveNote: DRIVE_KEPT_NOTE, driveFolderUrl, ...(driveAccessWarning ? { driveAccessWarning } : {}) };
}
