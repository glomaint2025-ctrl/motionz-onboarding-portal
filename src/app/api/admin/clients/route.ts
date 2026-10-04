import { NextResponse } from 'next/server';
import { validateEmail, validatePhone, validateText } from '@/lib/validation';
import { isStaffEmail } from '@/lib/auth/staff';
import {
  tenantRepository,
  csmAssignmentRepository,
  userRepository,
  clientSetupStepRepository,
} from '@/lib/db/repositories';
import { tenantService } from '@/lib/services/tenant.service';
import { createInvitation } from '@/lib/auth/invitations';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { provisionClientSheet } from '@/lib/integrations/sheets/provision';

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

    // 1. Fetch all tenants with relationships for enrichment
    const allTenants = await tenantRepository.list({
      includeArchived: true,
      limit: 1000,
    });

    const enrichedTenants = await Promise.all(
      allTenants.map(async (tenant) => {
        const [assignment, steps] = await Promise.all([
          csmAssignmentRepository.findByTenant(tenant.id),
          clientSetupStepRepository.listByTenant(tenant.id),
        ]);
        const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;
        const completedSteps = steps.filter((s) => s.status === 'done').length;
        const progressPercent = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

        return {
          ...tenant,
          csm_name: csm ? csm.full_name : 'Unassigned',
          csm_email: csm ? csm.email : null,
          total_steps: steps.length,
          completed_steps: completedSteps,
          progress_percent: progressPercent,
          is_archived: Boolean(tenant.deleted_at || tenant.status === 'cancelled'),
        };
      })
    );

    // 2. Global telemetry calculation across all records
    const now = new Date();
    const globalStats = {
      totalClients: enrichedTenants.length,
      activeClients: enrichedTenants.filter((c) => !c.is_archived && c.status === 'active').length,
      // "Onboarding" and "Active" never overlap: each client has exactly one status.
      pendingSetup: enrichedTenants.filter((c) => !c.is_archived && c.status === 'onboarding').length,
      suspendedClients: enrichedTenants.filter((c) => !c.is_archived && c.status === 'suspended').length,
      archivedClients: enrichedTenants.filter((c) => c.is_archived).length,
      newThisMonth: enrichedTenants.filter((c) => {
        const d = new Date(c.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    };

    // 3. Unique list of assigned CSMs
    const availableCsms = Array.from(
      new Set(
        enrichedTenants
          .map((c) => c.csm_name)
          .filter((name) => name && name !== 'Unassigned')
      )
    );

    // 4. Server-side Filtering
    const filtered = enrichedTenants.filter((client) => {
      const isArchived = Boolean(client.is_archived);

      // Search matching
      let matchesSearch = true;
      if (search) {
        const q = search.toLowerCase();
        matchesSearch = Boolean(
          client.name.toLowerCase().includes(q) ||
          client.primary_email.toLowerCase().includes(q) ||
          (client.primary_contact_name && client.primary_contact_name.toLowerCase().includes(q)) ||
          (client.csm_name && client.csm_name.toLowerCase().includes(q))
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
        matchesCsm = client.csm_name === csmParam;
      }

      // Same rule as the dashboard's "Still in setup" number.
      const setupDone = client.total_steps > 0 && client.completed_steps === client.total_steps;
      const matchesSetup = setupParam === 'in_progress' ? !isArchived && !setupDone : true;

      return matchesSearch && matchesStatus && matchesCsm && matchesSetup;
    });

    // 5. Server-side Pagination
    const total = filtered.length;
    const paginatedItems = hasPagination
      ? filtered.slice(offset, offset + pageSize)
      : filtered;

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

    // Each new client gets their own copy of the tracking sheet (client answer P1.4).
    const sheet = await provisionClientSheet({
      tenantId: newTenant.id,
      clientName: newTenant.name,
      clientEmail: normalizedEmail,
    });

    return NextResponse.json({
      success: true,
      tenant: newTenant,
      magicLinkUrl,
      // Whether the invite email actually went out; the success screen words itself on this.
      emailDelivered: Boolean(emailDelivered),
      sheet,
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
