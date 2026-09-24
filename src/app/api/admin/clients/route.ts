import { NextResponse } from 'next/server';
import {
  tenantRepository,
  csmAssignmentRepository,
  userRepository,
  clientSetupStepRepository,
} from '@/lib/db/repositories';
import { tenantService } from '@/lib/services/tenant.service';
import { createInvitation } from '@/lib/auth/invitations';

export async function GET() {
  try {
    const tenants = await tenantRepository.list();

    const enrichedTenants = await Promise.all(
      tenants.map(async (tenant) => {
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
        };
      })
    );

    return NextResponse.json({ success: true, tenants: enrichedTenants });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list clients.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const { tenant: newTenant } = await tenantService.provisionClient({
      name,
      slug: generatedSlug,
      primary_email,
      primary_contact_name,
      phone,
      csm_user_id,
      template_id,
      feature_overrides,
      actorEmail: 'admin@motionz.ai',
      actorRole: 'admin',
    });

    // Automatically generate magic link invitation for client primary email
    const { magicLinkUrl } = await createInvitation({
      tenantId: newTenant.id,
      email: primary_email,
      role: 'client',
      createdBy: 'admin@motionz.ai',
    });

    return NextResponse.json({
      success: true,
      tenant: newTenant,
      magicLinkUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create client.' }, { status: 500 });
  }
}
