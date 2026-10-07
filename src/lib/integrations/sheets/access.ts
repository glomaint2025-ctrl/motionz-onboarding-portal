/**
 * Google Drive access follows the portal's people.
 *
 * Who should be able to open a client's Google files is worked out from the portal
 * (`desiredDriveAccess`), compared with who can open them right now (the script's `list_access`),
 * and only the difference is sent back (`set_access`). Access is always given to named email
 * addresses; nothing here ever turns on "anyone with the link" sharing.
 *
 *   <parent folder>            admins: editor (reaches every client folder below)
 *   └── <Client>               the client's CSM: editor
 *       ├── tracking sheet     client owner + team members who may see Results Tracking: editor
 *       ├── calculator         same as the tracking sheet
 *       └── uploaded contract  client owner only: viewer
 *
 * The sync functions never throw. They do nothing when the script is not configured or the
 * client has no Drive folder yet, and they only warn when the deployed script is an older one.
 */
import {
  tenantRepository,
  userRepository,
  csmAssignmentRepository,
  contractRepository,
  auditLogRepository,
} from '../../db/repositories';
import type { Tenant, User } from '../../db/schema';
import { isStaffEmail } from '../../auth/staff';
import { callScript, isSheetsScriptConfigured, loadSavedFiles, sheetIdFromUrl, text } from './provision';
import { contractDriveFileId } from './contract-files';

export type DriveTarget = 'parent' | 'folder' | 'tracking' | 'calculator' | 'contract';
export type DriveRole = 'editor' | 'viewer';

export interface DriveAccessEntry {
  target: DriveTarget;
  /** Drive id of the folder or file. */
  id: string;
  email: string;
  role: DriveRole;
}

export interface DriveAccessContext {
  /** The client. Leave out when only the parent folder (admins) is of interest. */
  tenant?: Pick<Tenant, 'status' | 'deleted_at' | 'primary_email'> | null;
  /** Id of the folder that holds every client folder. */
  parentFolderId?: string;
  files?: {
    folderId?: string;
    trackingId?: string;
    calculatorId?: string;
    /** Contract files uploaded to the client's folder. */
    contractFileIds?: string[];
  };
  /** Everyone with a login for this client (owner and team), whatever their status. */
  users?: User[];
  /** The CSM assigned to this client, if any. */
  csm?: User | null;
  /** Every admin, whatever their status. */
  admins?: User[];
}

export interface DriveTargetRef {
  target: DriveTarget;
  id: string;
  /** Ties a client's folder to the files inside it (the client id). The parent folder has none. */
  group?: string;
}

/** Who can open one folder or file right now, as reported by the script. */
export interface DriveCurrentAccess {
  id: string;
  ok?: boolean;
  owner?: string;
  editors?: string[];
  viewers?: string[];
  error?: string;
}

export interface DriveAccessChange extends DriveTargetRef {
  email: string;
  role: DriveRole | 'none';
}

export interface DriveSyncResult {
  ok: boolean;
  /** True when there was nothing to do: no script configured, or the client has no Drive folder yet. */
  skipped?: boolean;
  /** People who were given access (or whose access level changed). */
  added: number;
  /** People whose access was taken away. */
  removed: number;
  warnings: string[];
}

export interface DriveSyncOptions {
  /** Who caused the sync, for the activity log. */
  actorEmail?: string;
  actorRole?: string;
  /** How long the whole sync may take before it gives up with a warning. */
  budgetMs?: number;
  /** Addresses that just stopped being staff (deleted, or an old email), to take off the parent folder. */
  removeEmails?: string[];
  /** The client is being deleted for good: nobody keeps access to its folder and files (the folder itself stays). */
  clientRemoved?: boolean;
}

export const OLD_SCRIPT_WARNING = 'The Google script needs updating before Drive access can be managed.';
const TIMEOUT_WARNING = 'Google Drive did not answer in time, so Drive access was not checked. Use "Re-sync Drive access" on the client page to try again.';
const DEFAULT_BUDGET_MS = 25_000;
const MAX_IDS_PER_CALL = 50;
/** How many clients' records are read from the database at the same time before a sync. */
const SCOPE_LOAD_CONCURRENCY = 10;
const MAX_CHANGES_PER_CALL = 100;

const norm = (email: unknown): string => String(email || '').trim().toLowerCase();
const isActive = (user: Pick<User, 'status'>): boolean => user.status !== 'suspended';
const RANK: Record<DriveRole, number> = { viewer: 1, editor: 2 };
const LEVEL: Record<DriveTarget, number> = { parent: 0, folder: 1, tracking: 2, calculator: 2, contract: 2 };

/**
 * Who should have which Drive access, according to the portal.
 *
 * - Admins (active): editor on the parent folder.
 * - The client's CSM (active): editor on the client's folder.
 * - Client owner (active): editor on the tracking sheet and calculator, viewer on each uploaded contract.
 *   Until the owner has accepted their invitation, the client's main email stands in for them,
 *   so the sheets are shared from the day the client is added.
 * - Team members (active): editor on the two sheets when they may see Results Tracking
 *   (or have no restriction list). Never the contract.
 * - Disabled people, and the people of a suspended, cancelled or archived client: nothing.
 */
export function desiredDriveAccess(ctx: DriveAccessContext): DriveAccessEntry[] {
  const best = new Map<string, DriveAccessEntry>();
  const add = (target: DriveTarget, id: string | undefined, email: unknown, role: DriveRole) => {
    const address = norm(email);
    if (!id || !address.includes('@')) return;
    const key = `${id}\n${address}`;
    const existing = best.get(key);
    if (!existing || RANK[role] > RANK[existing.role]) best.set(key, { target, id, email: address, role });
  };

  for (const admin of ctx.admins || []) {
    if (admin.role === 'admin' && isActive(admin)) add('parent', ctx.parentFolderId, admin.email, 'editor');
  }

  const files = ctx.files || {};
  if (ctx.csm && ctx.csm.role === 'csm' && isActive(ctx.csm)) add('folder', files.folderId, ctx.csm.email, 'editor');

  const tenant = ctx.tenant;
  const clientIsLive = Boolean(tenant) && !tenant!.deleted_at && (tenant!.status === 'active' || tenant!.status === 'onboarding');
  if (clientIsLive) {
    const users = ctx.users || [];
    const owners = users.filter((u) => u.role === 'client' && isActive(u)).map((u) => norm(u.email));
    const mainEmail = norm(tenant!.primary_email);
    if (mainEmail && !users.some((u) => norm(u.email) === mainEmail)) owners.push(mainEmail);

    for (const email of owners) {
      add('tracking', files.trackingId, email, 'editor');
      add('calculator', files.calculatorId, email, 'editor');
      for (const fileId of files.contractFileIds || []) add('contract', fileId, email, 'viewer');
    }

    for (const member of users) {
      if (member.role !== 'client_member' || !isActive(member)) continue;
      if (Array.isArray(member.allowed_modules) && !member.allowed_modules.includes('tracking')) continue;
      add('tracking', files.trackingId, member.email, 'editor');
      add('calculator', files.calculatorId, member.email, 'editor');
    }
  }

  return Array.from(best.values());
}

/**
 * The changes that turn today's access into the wanted access, parent folder first.
 *
 * - Compared without regard to upper/lower case.
 * - A file's owner and the `protectedEmails` (the account the script runs as) are never touched.
 * - Someone who reaches a file through the folder above it is left alone on the file itself:
 *   that access is given and taken away on the folder.
 * - `parentRemovable` limits who may be taken off the parent folder (default: anyone not wanted).
 */
/**
 * The Google account behind an address. Google treats name+anything@… as the mailbox name@…, and
 * ignores dots in gmail.com names, so those are one account and are shared with only once.
 */
export function googleAccountOf(email: string | null | undefined): string {
  const value = norm(email);
  const at = value.lastIndexOf('@');
  if (at <= 0) return value;
  let local = value.slice(0, at).split('+')[0];
  const domain = value.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.split('.').join('');
  return `${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}

export function diffDriveAccess(input: {
  targets: DriveTargetRef[];
  desired: DriveAccessEntry[];
  current: DriveCurrentAccess[];
  protectedEmails?: string[];
  parentRemovable?: (email: string) => boolean;
  /** Ids that are only read, to know what the level below inherits. Nothing is changed on them. */
  readOnlyIds?: string[];
}): DriveAccessChange[] {
  const isProtected = new Set((input.protectedEmails || []).map(googleAccountOf).filter(Boolean));
  const currentById = new Map(input.current.map((c) => [c.id, c]));
  const changes: DriveAccessChange[] = [];

  // Access as it will be once the changes are made, to know what the level below inherits.
  let parentAfter = new Map<string, DriveRole>();
  const folderAfter = new Map<string, Map<string, DriveRole>>();

  const seen = new Set<string>();
  const targets = input.targets
    .filter((t) => t.id && !seen.has(t.id) && Boolean(seen.add(t.id)))
    .sort((a, b) => LEVEL[a.target] - LEVEL[b.target]);

  for (const ref of targets) {
    const listed = currentById.get(ref.id);
    if (!listed || listed.ok === false) continue; // not found or not readable: change nothing there

    const owner = googleAccountOf(listed.owner);
    const have = new Map<string, DriveRole>();
    for (const email of listed.viewers || []) if (norm(email)) have.set(norm(email), 'viewer');
    for (const email of listed.editors || []) if (norm(email)) have.set(norm(email), 'editor');

    if (input.readOnlyIds?.includes(ref.id)) {
      if (ref.target === 'parent') parentAfter = have;
      if (ref.target === 'folder' && ref.group) folderAfter.set(ref.group, have);
      continue;
    }

    const inherited = new Map<string, DriveRole>();
    const inherit = (from?: Map<string, DriveRole>) =>
      from?.forEach((role, email) => {
        if (!inherited.has(email) || RANK[role] > RANK[inherited.get(email)!]) inherited.set(email, role);
      });
    if (LEVEL[ref.target] >= 1) inherit(parentAfter);
    if (LEVEL[ref.target] >= 2 && ref.group) inherit(folderAfter.get(ref.group));
    // The same people by Google account, so an alias of somebody already there is not shared with again.
    const byAccount = (from: Map<string, DriveRole>) => {
      const out = new Map<string, DriveRole>();
      from.forEach((role, email) => {
        const account = googleAccountOf(email);
        if (!out.has(account) || RANK[role] > RANK[out.get(account)!]) out.set(account, role);
      });
      return out;
    };
    const haveAccounts = byAccount(have);
    const inheritedAccounts = byAccount(inherited);

    const want = new Map<string, DriveRole>();
    for (const entry of input.desired) {
      if (entry.id !== ref.id) continue;
      const email = norm(entry.email);
      if (!want.has(email) || RANK[entry.role] > RANK[want.get(email)!]) want.set(email, entry.role);
    }

    const after = new Map(have);
    want.forEach((role, email) => {
      const account = googleAccountOf(email);
      if (account === owner || isProtected.has(account)) return;
      const fromAbove = inheritedAccounts.get(account);
      if (fromAbove && RANK[fromAbove] >= RANK[role]) return; // already reaches it through the folder above
      if (haveAccounts.get(account) === role) return;
      changes.push({ ...ref, email, role });
      after.set(email, role);
    });
    const wantAccounts = byAccount(want);
    have.forEach((_role, email) => {
      const account = googleAccountOf(email);
      if (wantAccounts.has(account) || account === owner || isProtected.has(account)) return;
      if (inheritedAccounts.has(account)) return; // comes from the folder above; handled there
      if (ref.target === 'parent' && input.parentRemovable && !input.parentRemovable(email)) return;
      changes.push({ ...ref, email, role: 'none' });
      after.delete(email);
    });

    if (ref.target === 'parent') parentAfter = after;
    if (ref.target === 'folder' && ref.group) folderAfter.set(ref.group, after);
  }

  return changes;
}

/** True when the answer came from a script that does not know the access actions yet. */
export function isOldScriptAnswer(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if ('spreadsheetId' in data || 'folderUrl' in data) return true; // it treated the call as "provision"
  if (/unknown action|clientname is required/i.test(String(data.error || ''))) return true;
  return data.ok === true; // said yes, but without the fields the access actions return
}

/** A short line for the admin: "Access is up to date", "Added 2, removed 1", or the warning. */
export function describeDriveSync(result: DriveSyncResult): string {
  if (result.skipped && result.warnings.length === 0) return 'There are no Google files to share yet.';
  const parts: string[] = [];
  if (result.added > 0) parts.push(`added ${result.added}`);
  if (result.removed > 0) parts.push(`removed ${result.removed}`);
  const line = parts.join(', ');
  const summary = parts.length === 0 ? '' : `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
  if (result.warnings.length === 0) return summary ? summary.slice(0, -1) : 'Access is up to date';
  // What worked is said first, so one refused address does not hide that everyone else is fine.
  // Only when the warnings are about single people: a sync that could not run at all has nothing to add.
  const perPerson = result.warnings.every((w) => /^Google (Drive could not share|would not remove)/.test(w));
  const lead = summary || (perPerson ? 'Everyone else is up to date.' : '');
  return [lead, ...result.warnings].filter(Boolean).join(' ');
}

/** The text to send along with an API answer when the sync needs a person's attention, else undefined. */
export function driveSyncWarning(result: DriveSyncResult | null | undefined): string | undefined {
  return result && result.warnings.length > 0 ? result.warnings.join(' ') : undefined;
}

/* ------------------------------------------------------------------ the sync */

const TARGET_LABEL: Record<DriveTarget, string> = {
  parent: 'the main Drive folder',
  folder: 'the client’s Drive folder',
  tracking: 'the tracking sheet',
  calculator: 'the calculator',
  contract: 'the contract file',
};

interface ListAnswer {
  ok?: boolean;
  error?: string;
  parentFolderId?: string;
  scriptUser?: string;
  parent?: DriveCurrentAccess;
  items?: DriveCurrentAccess[];
}

interface SetAnswer {
  ok?: boolean;
  error?: string;
  results?: Array<{ id?: string; email?: string; role?: string; ok?: boolean; error?: string }>;
}

class SyncStop extends Error {}

interface ClientScope {
  tenant: Tenant;
  context: DriveAccessContext;
  targets: DriveTargetRef[];
}

async function loadClientScope(tenantId: string): Promise<ClientScope | null> {
  const tenant = await tenantRepository.findById(tenantId, { includeArchived: true });
  if (!tenant) return null;
  const saved = await loadSavedFiles(tenant.id);
  const folderId = text(saved.folder_id);
  if (!folderId) return null; // no per-client folder yet: nothing to manage

  const [users, assignment, contracts] = await Promise.all([
    userRepository.listByTenant(tenant.id),
    csmAssignmentRepository.findByTenant(tenant.id),
    contractRepository.listByTenant(tenant.id),
  ]);
  const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;

  const files = {
    folderId,
    trackingId: text(saved.spreadsheet_id) || sheetIdFromUrl(saved.sheet_url),
    calculatorId: text(saved.calculator_id) || sheetIdFromUrl(saved.calculator_url),
    contractFileIds: contracts.map(contractDriveFileId).filter((id): id is string => Boolean(id)),
  };
  const group = tenant.id;
  const targets: DriveTargetRef[] = [{ target: 'folder', id: folderId, group }];
  if (files.trackingId) targets.push({ target: 'tracking', id: files.trackingId, group });
  if (files.calculatorId) targets.push({ target: 'calculator', id: files.calculatorId, group });
  for (const id of files.contractFileIds) targets.push({ target: 'contract', id, group });

  return { tenant, context: { tenant, files, users, csm }, targets };
}

const NOTHING: DriveSyncResult = { ok: true, skipped: true, added: 0, removed: 0, warnings: [] };

async function runSync(tenantIds: string[], clientOnly: boolean, options: DriveSyncOptions = {}): Promise<DriveSyncResult> {
  if (!isSheetsScriptConfigured()) return { ...NOTHING };

  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  const call = async <T>(payload: Record<string, unknown>): Promise<T | null> => {
    const left = deadline - Date.now();
    if (left < 500) throw new SyncStop(TIMEOUT_WARNING);
    try {
      const { data } = await callScript<T>(payload, left);
      return data;
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new SyncStop(timedOut ? TIMEOUT_WARNING : 'Could not reach the Google script, so Drive access was not checked.');
    }
  };

  const onlyTenantId = tenantIds.length === 1 ? tenantIds[0] : undefined;
  const result: DriveSyncResult = { ok: true, added: 0, removed: 0, warnings: [] };
  const attempted: Array<DriveAccessChange & { ok: boolean; error?: string }> = [];

  try {
    // 1. What the portal knows.
    // Several clients (a CSM's whole list) are read a few at a time instead of one after another.
    const scopes: ClientScope[] = [];
    const uniqueIds = Array.from(new Set(tenantIds));
    for (let i = 0; i < uniqueIds.length; i += SCOPE_LOAD_CONCURRENCY) {
      const loaded = await Promise.all(uniqueIds.slice(i, i + SCOPE_LOAD_CONCURRENCY).map((id) => loadClientScope(id)));
      for (const scope of loaded) if (scope) scopes.push(scope);
    }
    if (clientOnly && scopes.length === 0) return { ...NOTHING };

    const [admins, csms] = await Promise.all([userRepository.listAllByRole('admin'), userRepository.listAllByRole('csm')]);

    // 2. Who can open what right now. Reading changes nothing, so it is also how an older script is spotted.
    const refs = scopes.flatMap((s) => s.targets);
    const ids = Array.from(new Set(refs.map((r) => r.id)));
    const current: DriveCurrentAccess[] = [];
    let parent: DriveCurrentAccess | undefined;
    let scriptUser = '';
    for (let i = 0; i === 0 || i < ids.length; i += MAX_IDS_PER_CALL) {
      const answer = await call<ListAnswer>({ action: 'list_access', ids: ids.slice(i, i + MAX_IDS_PER_CALL) });
      if (!answer || answer.ok !== true || !Array.isArray(answer.items) || !answer.parent || typeof answer.parentFolderId !== 'string') {
        throw new SyncStop(
          isOldScriptAnswer(answer)
            ? OLD_SCRIPT_WARNING
            : `Google Drive access could not be checked: ${text(answer?.error) || 'the Google script did not answer as expected.'}`
        );
      }
      current.push(...answer.items);
      if (!parent) {
        parent = { ...answer.parent, id: answer.parentFolderId };
        scriptUser = norm(answer.scriptUser);
      }
    }

    // 3. What should be, and the difference.
    const activeAdmins = admins.filter((a) => a.role === 'admin' && isActive(a));
    // Without the parent folder's list there is no telling who reaches a client folder from above.
    if (!parent || parent.ok === false || !parent.id) {
      throw new SyncStop(`The main Drive folder could not be read, so Drive access was not changed: ${parent?.error || 'unknown problem'}`);
    }
    const targets: DriveTargetRef[] = [{ target: 'parent', id: parent.id }, ...refs];
    current.push(parent);
    // With no admin at all in sight something is wrong with the read; leave the parent folder as it is.
    const readOnlyIds = activeAdmins.length > 0 ? [] : [parent.id];

    const desired = [
      ...desiredDriveAccess({ parentFolderId: parent.id, admins }),
      ...(options.clientRemoved ? [] : scopes.flatMap((s) => desiredDriveAccess(s.context))),
    ];

    for (const ref of refs) {
      const listed = current.find((c) => c.id === ref.id);
      if (!listed || listed.ok === false) {
        const name = scopes.length > 1 ? ` of ${scopes.find((s) => s.tenant.id === ref.group)?.tenant.name}` : '';
        const label = TARGET_LABEL[ref.target].replace(/^the /, 'The ').replace('client’s ', '');
        result.warnings.push(`${label}${name} could not be read in Google Drive: ${listed?.error || 'not found.'}`);
      }
    }

    // Only people the portal knows about are ever taken off the parent folder, so somebody the
    // Drive owner shared it with by hand keeps their access.
    const portalPeople = new Set<string>([
      ...admins.map((u) => norm(u.email)),
      ...csms.map((u) => norm(u.email)),
      ...scopes.flatMap((s) => [norm(s.tenant.primary_email), ...(s.context.users || []).map((u) => norm(u.email))]),
      ...(options.removeEmails || []).map(norm),
    ]);
    const changes = diffDriveAccess({
      targets,
      desired,
      current,
      // The owner of the main folder reaches everything inside it and cannot be taken off by the script.
      protectedEmails: [scriptUser, norm(parent.owner)],
      readOnlyIds,
      parentRemovable: (email) => portalPeople.has(email) || isStaffEmail(email),
    });

    // 4. Send only the difference.
    for (let i = 0; i < changes.length; i += MAX_CHANGES_PER_CALL) {
      const batch = changes.slice(i, i + MAX_CHANGES_PER_CALL);
      // Only id, email and role are sent: nothing an older script could mistake for a new client.
      const answer = await call<SetAnswer>({
        action: 'set_access',
        changes: batch.map((c) => ({ id: c.id, email: c.email, role: c.role })),
      });
      if (!answer || answer.ok !== true || !Array.isArray(answer.results)) {
        batch.forEach((c) => attempted.push({ ...c, ok: false }));
        throw new SyncStop(
          isOldScriptAnswer(answer)
            ? OLD_SCRIPT_WARNING
            : `Google Drive access could not be changed: ${text(answer?.error) || 'the Google script did not answer as expected.'}`
        );
      }
      batch.forEach((change, index) => {
        const line =
          answer.results!.find((r) => r.id === change.id && norm(r.email) === change.email && r.role === change.role) || answer.results![index];
        attempted.push({ ...change, ok: Boolean(line?.ok), error: line?.ok ? undefined : text(line?.error) || 'no answer' });
      });
    }
  } catch (err: any) {
    result.ok = false;
    if (err instanceof SyncStop) {
      result.warnings.push(err.message);
    } else {
      console.error('[drive-access] Sync failed:', err?.message);
      result.warnings.push('Drive access could not be checked because the portal could not read its own records. Please try again.');
    }
  }

  // People, not single changes: a new CSM is "added 1" however many files that touches.
  const granted = new Set(attempted.filter((c) => c.ok && c.role !== 'none').map((c) => c.email));
  const taken = new Set(attempted.filter((c) => c.ok && c.role === 'none' && !granted.has(c.email)).map((c) => c.email));
  result.added = granted.size;
  result.removed = taken.size;

  const failed = attempted.filter((c) => !c.ok && c.error);
  for (const change of failed.slice(0, 5)) {
    result.warnings.push(
      change.role === 'none'
        ? `Google would not remove ${change.email} from ${TARGET_LABEL[change.target]}. Remove them by hand in Google Drive if they should not have access. (Google said: ${change.error})`
        : `Google Drive could not share ${TARGET_LABEL[change.target]} with ${change.email}. The usual reason is that ${change.email} is not a Google account. (Google said: ${change.error})`
    );
  }
  if (failed.length > 5) result.warnings.push(`...and ${failed.length - 5} more.`);
  if (failed.length > 0) result.ok = false;

  if (attempted.length > 0 || result.warnings.length > 0) {
    if (result.warnings.length > 0) console.warn(`[drive-access] ${result.warnings.join(' | ')}`);
    try {
      await auditLogRepository.create({
        tenant_id: onlyTenantId,
        actor_email: options.actorEmail || 'system',
        actor_role: options.actorRole || 'system',
        action: 'drive.access_synced',
        resource_type: onlyTenantId ? 'tenant' : 'drive',
        resource_id: onlyTenantId,
        details: {
          ok: result.ok,
          added: result.added,
          removed: result.removed,
          changes: attempted.slice(0, 50).map((c) => ({ email: c.email, on: c.target, access: c.role, ok: c.ok })),
          ...(result.warnings.length ? { warnings: result.warnings } : {}),
        },
      });
    } catch (err: any) {
      console.error('[drive-access] The activity log entry could not be written:', err?.message);
    }
  }

  return result;
}

/**
 * Brings one client's Google Drive access in line with the portal: the CSM on the client's folder,
 * the owner and team on the two sheets, the owner on uploaded contracts, and the admins on the
 * parent folder. Asks the script who has access now and sends only the difference.
 *
 * Never throws. Does nothing (ok: true, skipped: true) when the script is not configured or the
 * client has no Drive folder yet. Writes one "drive.access_synced" log entry, only when
 * something changed or went wrong.
 */
export async function syncClientDriveAccess(tenantId: string, options: DriveSyncOptions = {}): Promise<DriveSyncResult> {
  return runSync([tenantId], true, options);
}

/** Brings the parent folder in line with the list of admins (they reach every client folder through it). */
export async function syncAdminDriveAccess(options: DriveSyncOptions = {}): Promise<DriveSyncResult> {
  return runSync([], false, options);
}

/**
 * After a staff member is added, changed, disabled, enabled or deleted: the parent folder (admins),
 * plus the folders of the clients they look after as CSM. One round trip to Google for all of them.
 */
export async function syncStaffDriveAccess(staffUserId: string | null, options: DriveSyncOptions = {}): Promise<DriveSyncResult> {
  let tenantIds: string[] = [];
  if (staffUserId) {
    try {
      tenantIds = (await csmAssignmentRepository.listByCsm(staffUserId)).map((a) => a.tenant_id);
    } catch (err: any) {
      console.error('[drive-access] Could not list the clients of a CSM:', err?.message);
    }
  }
  return runSync(tenantIds, false, options);
}
