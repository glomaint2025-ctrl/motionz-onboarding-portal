import { NextRequest, NextResponse } from 'next/server';
import { listTenants, getClientSetupSteps } from '@/lib/db';
import { verifySession } from '@/lib/auth/session';
import { assertPermission } from '@/lib/auth/permissions';
import { calculateSetupProgress } from '@/lib/onboarding/progress';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('motionz_session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = verifySession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    if (session.role !== 'csm' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: CSM workspace restricted to staff' }, { status: 403 });
    }

    assertPermission(session.role, 'onboarding:view_guidance');

    const tenants = await listTenants();

    // Attach minimal progress summary per tenant
    const clientSummaries = await Promise.all(
      tenants.map(async (t) => {
        const steps = await getClientSetupSteps(t.id);
        const progress = calculateSetupProgress(steps);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          primary_email: t.primary_email,
          primary_contact_name: t.primary_contact_name,
          phone: t.phone,
          progressPercentage: progress.percentage,
          completedCount: progress.completedSteps,
          totalCount: progress.totalSteps,
        };
      })
    );

    return NextResponse.json(
      { clients: clientSummaries },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to retrieve CSM clients' },
      { status: 500 }
    );
  }
}
