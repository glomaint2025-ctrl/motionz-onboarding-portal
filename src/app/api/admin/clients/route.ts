import { NextResponse } from 'next/server';
import { validateEmail, validatePhone, validateText } from '@/lib/validation';
import { isStaffEmail } from '@/lib/auth/staff';
import {
  tenantRepository,
  csmAssignmentRepository,
  userRepository,
  clientSetupStepRepository,
  contractRepository,
} from '@/lib/db/repositories';
import { tenantService } from '@/lib/services/tenant.service';
import { createInvitation } from '@/lib/auth/invitations';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { provisionClientSheet } from '@/lib/integrations/sheets/provision';
import { driveSyncWarning, syncClientDriveAccess } from '@/lib/integrations/sheets/access';

import { parsePaginationParams, buildPaginationMeta } from '@/lib/utils/pagination';

export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });

    const { searchParams } = new URL(request.url);
    const hasPagination = searchParams.has('page') || searchParams.has('pageSize') || searchParams.has('limit');
    const { page, pageSize, offset, search } = parsePaginationParams(request, 10);
    const statusParam = searchParams.get('status')?.trim() || 'all';
    const csmParam = searchParams.get('csm')?.trim() || undefined;
    const includeArchived = searchParams.get('includeArchived') !== 'false';
    // "Still in setup" on the dashboard: live clients whose setup steps are not all done.
    const setupParam = searchParams.get('setup')?.trim() || '';

    // 1. Every client, every CSM assignment and the contract flags: one read per table
    // (never one per client), joined here.
    const [allTenants, withContract, assignments] = await Promise.all([
      tenantRepository.listAll({ includeArchived: true }),
      contractRepository.listTenantIdsWithContract(),
      csmAssignmentRepository.listAll(),
    ]);

    const csmIdByTenant = new Map<string, string>();
    for (const a of assignments) if (!csmIdByTenant.has(a.tenant_id)) csmIdByTenant.set(a.tenant_id, a.csm_user_id);

    // The CSMs themselves: a handful of people, read together.
    const csmIds = Array.from(new Set(csmIdByTenant.values()));
    const csmById = new Map((await userRepository.findByIds(csmIds)).map((u) => [u.id, u]));
    await Promise.all(
      csmIds
        .filter((id) => !csmById.has(id))
        .map(async (id) => {
          const user = await userRepository.findById(id);
          if (user) csmById.set(id, user);
        })
    );

    const baseTenants = allTenants.map((tenant) => {
      const csmId = csmIdByTenant.get(tenant.id);
      const csm = csmId ? csmById.get(csmId) || null : null;
      return {
        tenant,
        csm_name: csm ? csm.full_name : 'Unassigned',
        csm_email: csm ? csm.email : null,
        is_archived: Boolean(tenant.deleted_at || tenant.status === 'cancelled'),
      };
    });

    // 2. Global telemetry calculation across all records
    const now = new Date();
    const globalStats = {
      totalClients: baseTenants.length,
      activeClients: baseTenants.filter((c) => !c.is_archived && c.tenant.status === 'active').length,
      // "Onboarding" and "Active" never overlap: each client has exactly one status.
      pendingSetup: baseTenants.filter((c) => !c.is_archived && c.tenant.status === 'onboarding').length,
      suspendedClients: baseTenants.filter((c) => !c.is_archived && c.tenant.status === 'suspended').length,
      archivedClients: baseTenants.filter((c) => c.is_archived).length,
      newThisMonth: baseTenants.filter((c) => {
        const d = new Date(c.tenant.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    };

    // 3. Unique list of assigned CSMs
    const availableCsms = Array.from(
      new Set(
        baseTenants
          .map((c) => c.csm_name)
          .filter((name) => name && name !== 'Unassigned')
      )
    );

    // 4. Server-side Filtering (everything except setup progress, which needs the steps)
    const matched = baseTenants.filter((entry) => {
      const client = entry.tenant;
      const isArchived = entry.is_archived;

      // Search matching
      let matchesSearch = true;
      if (search) {
        const q = search.toLowerCase();
        matchesSearch = Boolean(
          client.name.toLowerCase().includes(q) ||
          client.primary_email.toLowerCase().includes(q) ||
          (client.primary_contact_name && client.primary_contact_name.toLowerCase().includes(q)) ||
          (entry.csm_name && entry.csm_name.toLowerCase().includes(q))
        );
      }

      // Status matching
      let matchesStatus = true;
      if (statusParam === 'all' || statusParam === 'all_including_archived' || !statusParam) {
        matchesStatus = true;
      } else if (statusParam === 'active') {
        matchesStatus = !isArchived && client.status === 'active';
      } else if (statusParam === 'onboarding') {
        matchesStatus = !isArchived && client.status === 'onboarding';
      } else if (statusParam === 'banned' || statusParam === 'suspended') {
        matchesStatus = !isArchived && client.status === 'suspended';
      } else if (statusParam === 'cancelled' || statusParam === 'archived') {
        matchesStatus = isArchived;
      } else {
        matchesStatus = !isArchived && client.status === statusParam;
      }

      // CSM matching
      let matchesCsm = true;
      if (csmParam && csmParam !== 'all') {
        matchesCsm = entry.csm_name === csmParam;
      }

      // "Still in setup" only ever shows live clients.
      const matchesSetup = setupParam === 'in_progress' ? !isArchived : true;

      return matchesSearch && matchesStatus && matchesCsm && matchesSetup;
    });

    // Setup steps are read for the rows that need them only: the page being shown, or every
    // matching client when the list is filtered by setup progress or not paged at all.
    const withProgress = (entries: typeof baseTenants, stepsByTenant: Awaited<ReturnType<typeof clientSetupStepRepository.listByTenants>>) =>
      entries.map(({ tenant, csm_name, csm_email, is_archived }) => {
        const steps = stepsByTenant.get(tenant.id) || [];
        const completedSteps = steps.filter((s) => s.status === 'done').length;
        const progressPercent = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
        return {
          ...tenant,
          csm_name,
          csm_email,
          total_steps: steps.length,
          completed_steps: completedSteps,
          progress_percent: progressPercent,
          // Staff-only reminder: false until an admin attaches the client's contract.
          hasContract: withContract.has(tenant.id),
          is_archived,
        };
      });
    const stepsFor = (entries: typeof baseTenants) => clientSetupStepRepository.listByTenants(entries.map((e) => e.tenant.id));

    // 5. Server-side Pagination
    let total: number;
    let paginatedItems: ReturnType<typeof withProgress>;
    if (setupParam === 'in_progress') {
      // Same rule as the dashboard's "Still in setup" number.
      const filtered = withProgress(matched, await stepsFor(matched)).filter(
        (client) => !(client.total_steps > 0 && client.completed_steps === client.total_steps)
      );
      total = filtered.length;
      paginatedItems = hasPagination ? filtered.slice(offset, offset + pageSize) : filtered;
    } else {
      total = matched.length;
      const pageEntries = hasPagination ? matched.slice(offset, offset + pageSize) : matched;
      paginatedItems = withProgress(pageEntries, await stepsFor(pageEntries));
    }

    const paginationMeta = buildPaginationMeta(total, page, pageSize);

    return NextResponse.json({
      success: true,
      tenants: paginatedItems,
      pagination: paginationMeta,
      stats: globalStats,
      availableCsms,
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: err.message || 'Failed to list clients.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const actorEmail = session?.email || 'admin@motionz.ai';

    const body = await request.json();
    const {
      name,
      slug,
      primary_email,
      primary_contact_name,
      phone,
      csm_user_id,
      template_id,
      feature_overrides,
    } = body;

    let validName: string;
    let validContact: string | undefined;
    let normalizedEmail: string;
    let validPhone: string | undefined;
    // Every validation error names its field, so the form can mark the right input.
    const invalid = (field: string, error: string) => NextResponse.json({ error, field }, { status: 400 });
    try {
      validName = validateText(name, 'Company name', { required: true, max: 255 })!;
    } catch (e: any) {
      return invalid('name', e.message);
    }
    // The Add client form requires a contact name; other callers may leave it out, but it must be text.
    if (primary_contact_name != null && typeof primary_contact_name !== 'string') {
      return invalid('primary_contact_name', 'Contact name must be text.');
    }
    try {
      validContact = validateText(primary_contact_name, 'Contact name', { max: 255 });
    } catch (e: any) {
      return invalid('primary_contact_name', e.message);
    }
    if (typeof primary_email !== 'string' || !primary_email.trim()) {
      return invalid('primary_email', 'The client’s email address is required.');
    }
    if (primary_email.trim().length > 254) {
      return invalid('primary_email', 'That email address is too long.');
    }
    try {
      normalizedEmail = validateEmail(primary_email);
    } catch {
      return invalid('primary_email', 'Enter a valid email address, for example name@company.com.');
    }
    try {
      validPhone = validatePhone(phone);
    } catch (e: any) {
      return invalid('phone', e.message);
    }
    if (slug !== undefined && slug !== null && typeof slug !== 'string') {
      return NextResponse.json({ error: 'The client short name must be text.' }, { status: 400 });
    }

    if (isStaffEmail(normalizedEmail)) {
      return invalid('primary_email', '@motionz.ai addresses are for Motionz staff only. Use the client’s own email.');
    }
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      return invalid('primary_email', 'An account with this email already exists.');
    }

    const existingTenant = await tenantRepository.findByEmail(normalizedEmail);
    if (existingTenant) {
      return invalid('primary_email', 'An account with this email already exists.');
    }

    const generatedSlug = await tenantRepository.generateUniqueSlug(slug || validName);

    const { tenant: newTenant } = await tenantService.provisionClient({
      name: validName,
      slug: generatedSlug,
      primary_email: normalizedEmail,
      primary_contact_name: validContact,
      phone: validPhone,
      csm_user_id,
      template_id,
      feature_overrides,
      actorEmail,
      actorRole: 'admin',
    });

    // Automatically generate magic link invitation for client primary email
    const { magicLinkUrl, emailDelivered } = await createInvitation({
      tenantId: newTenant.id,
      email: normalizedEmail,
      role: 'client',
      createdBy: actorEmail,
      request,
    });

    // Each new client gets their own Drive folder with a tracking sheet and a Money Leak Calculator copy.
    const sheet = await provisionClientSheet({
      tenantId: newTenant.id,
      clientName: newTenant.name,
      clientEmail: normalizedEmail,
    });

    // The assigned CSM gets the new folder; admins reach it through the parent folder.
    const driveAccessWarning = sheet.ok
      ? driveSyncWarning(await syncClientDriveAccess(newTenant.id, { actorEmail, actorRole: 'admin' }))
      : undefined;

    return NextResponse.json({
      success: true,
      tenant: newTenant,
      ...(driveAccessWarning ? { driveAccessWarning } : {}),
      magicLinkUrl,
      // Whether the invite email actually went out; the success screen words itself on this.
      emailDelivered: Boolean(emailDelivered),
      // sheet.ok: the tracking sheet was created. sheet.calculatorOk: the calculator copy was created.
      sheet,
      googleFiles: { trackingSheet: sheet.ok, calculator: Boolean(sheet.calculatorOk) },
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }

    // Only a real "already exists" database error is reported as a duplicate;
    // any other failure keeps its own message.
    const raw = String(err.message || '');
    const isUniqueViolation = err.code === '23505' || raw.includes('23505') || /duplicate key|unique constraint/i.test(raw);
    if (isUniqueViolation) {
      const isSlug = /slug/i.test(raw);
      return NextResponse.json(
        {
          error: isSlug ? 'A client with this name already exists.' : 'An account with this email already exists.',
          field: isSlug ? 'name' : 'primary_email',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: raw || 'Could not add the client. Please try again.' },
      { status: err.statusCode || (err.name === 'AppError' ? 400 : 500) }
    );
  }
}
