import { NextResponse } from 'next/server';
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
      pendingSetup: enrichedTenants.filter((c) => !c.is_archived && (c.status === 'onboarding' || c.progress_percent < 100)).length,
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

      return matchesSearch && matchesStatus && matchesCsm;
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

    if (!name || !primary_email) {
      return NextResponse.json(
        { error: 'Company name and primary client email are required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = primary_email.trim().toLowerCase();
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    const existingTenant = await tenantRepository.findByEmail(normalizedEmail);
    if (existingTenant) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    const generatedSlug = await tenantRepository.generateUniqueSlug(slug || name);

    const { tenant: newTenant } = await tenantService.provisionClient({
      name,
      slug: generatedSlug,
      primary_email: normalizedEmail,
      primary_contact_name,
      phone,
      csm_user_id,
      template_id,
      feature_overrides,
      actorEmail,
      actorRole: 'admin',
    });

    // Automatically generate magic link invitation for client primary email
    const { magicLinkUrl } = await createInvitation({
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
      sheet,
    });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return handleAuthError(err);
    }

    let message = err.message || 'Failed to create client.';
    if (message.includes('23505') || message.toLowerCase().includes('email')) {
      message = 'An account with this email already exists.';
    } else if (message.includes('tenants_slug_key') || message.includes('slug')) {
      message = 'A client with this name or identifier already exists.';
    } else if (err.name === 'AppError' || err.statusCode === 400) {
      message = err.message;
    }

    return NextResponse.json(
      { error: message },
      { status: err.statusCode || (err.name === 'AppError' ? 400 : 500) }
    );
  }
}
