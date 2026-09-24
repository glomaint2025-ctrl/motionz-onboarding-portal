import { NextResponse } from 'next/server';
import {
  tenantRepository,
  csmAssignmentRepository,
  userRepository,
  clientSetupStepRepository,
  featureToggleRepository,
  invitationRepository,
  auditLogRepository,
} from '@/lib/db/repositories';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenant = await tenantRepository.findById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    const [assignment, steps, toggles, members, invitations] = await Promise.all([
      csmAssignmentRepository.findByTenant(tenant.id),
      clientSetupStepRepository.listByTenant(tenant.id),
      featureToggleRepository.getTogglesForTenant(tenant.id),
      userRepository.listByTenant(tenant.id),
      invitationRepository.listByTenant(tenant.id),
    ]);

    const csm = assignment ? await userRepository.findById(assignment.csm_user_id) : null;

    return NextResponse.json({
      success: true,
      tenant,
      csm: csm ? { id: csm.id, name: csm.full_name, email: csm.email } : null,
      steps,
      features: toggles,
      members,
      invitations,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to get client.' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenant = await tenantRepository.findById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { name, phone, status, ghl_location_id, csm_user_id, feature_toggles } = body;

    const updates: any = {};
    if (name) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (status) updates.status = status;
    if (ghl_location_id !== undefined) updates.ghl_location_id = ghl_location_id;

    const updatedTenant = Object.keys(updates).length > 0
      ? await tenantRepository.update(tenant.id, updates)
      : tenant;

    // Update CSM assignment if supplied
    if (csm_user_id) {
      await csmAssignmentRepository.assign(csm_user_id, tenant.id);
    }

    // Update feature toggles if supplied
    if (feature_toggles && typeof feature_toggles === 'object') {
      await Promise.all(
        Object.entries(feature_toggles).map(([key, isEnabled]) =>
          featureToggleRepository.setToggle(tenant.id, key, Boolean(isEnabled))
        )
      );
    }

    await auditLogRepository.create({
      tenant_id: tenant.id,
      actor_email: 'admin@motionz.ai',
      actor_role: 'admin',
      action: 'client.updated',
      resource_type: 'tenant',
      resource_id: tenant.id,
      details: { updates: body },
    });

    return NextResponse.json({ success: true, tenant: updatedTenant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update client.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenant = await tenantRepository.findById(params.id);
    if (!tenant) {
      return NextResponse.json({ error: 'Client portal not found.' }, { status: 404 });
    }

    await tenantRepository.softDelete(tenant.id);

    await auditLogRepository.create({
      tenant_id: tenant.id,
      actor_email: 'admin@motionz.ai',
      actor_role: 'admin',
      action: 'client.deleted',
      resource_type: 'tenant',
      resource_id: tenant.id,
    });

    return NextResponse.json({ success: true, message: 'Portal archived successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete portal.' }, { status: 500 });
  }
}
