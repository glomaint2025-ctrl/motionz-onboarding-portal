import { NextRequest, NextResponse } from 'next/server';
import { getTenantById, DEMO_TENANT_UUID } from '@/lib/db';
import { onboardingSubmissionRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { assertModuleEnabled } from '@/lib/auth/modules';
import { displayAnswers } from '@/lib/onboarding/answers';

/**
 * GET /api/portal/[clientId]/onboarding-answers
 * The onboarding form answers this client has sent, newest first (up to 10), so they can check
 * what they told us. Only for someone who can open Setup Progress.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const rawClientId = params.clientId;
    const targetTenant = await getTenantById(rawClientId);

    if (!targetTenant && rawClientId !== 'demo') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = targetTenant ? targetTenant.id : DEMO_TENANT_UUID;

    // Enforce active account, tenant suspension, and tenant isolation
    const session = await assertPortalAccess(request, targetTenant, rawClientId);
    await assertModuleEnabled(session, tenantId, 'onboarding');

    const rows = await onboardingSubmissionRepository.listByTenant(tenantId, 10);
    const submissions = rows
      // Belt and braces: never another client's answers, never ones not linked to a client yet.
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => ({
        id: row.id,
        submittedAt: row.submitted_at,
        submitterEmail: row.submitter_email || null,
        // Text answers and uploaded files only, in the order of the form; nothing internal gets out.
        answers: displayAnswers(row.answers),
      }));

    return NextResponse.json(
      { submissions },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    if (
      error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
    ) {
      return handleAuthError(error);
    }
    return NextResponse.json({ error: 'Failed to retrieve your answers' }, { status: 500 });
  }
}
