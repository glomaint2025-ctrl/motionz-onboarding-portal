import { NextRequest, NextResponse } from 'next/server';
import {
  getTenantById,
  getClientScriptPreference,
  setClientScriptPreference,
  setClientSelectedScripts,
  logAuditEvent,
  DEMO_TENANT_UUID,
} from '@/lib/db';
import { scriptRepository } from '@/lib/db/repositories';
import { assertPortalAccess, handleAuthError } from '@/lib/auth/guard';
import { hasPermission } from '@/lib/auth/permissions';
import {
  SELF_FILMED_CATEGORIES,
  SCRIPT_CATEGORY_LABELS,
  SelectedScripts,
  isAdScriptCategory,
  sanitizeSelectedScripts,
} from '@/lib/scripts/ad-script-library';

const MAX_NAME_LENGTH = 255;

function isAuthError(error: any): boolean {
  return Boolean(
    error.code ||
      error.message?.includes('suspended') ||
      error.message?.includes('Forbidden') ||
      error.message?.includes('Unauthorized')
  );
}

/**
 * GET /api/portal/[clientId]/video-preference
 * The tenant's saved production choice (AI video / self-filmed) and self-filmed script picks.
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
    await assertPortalAccess(request, targetTenant, rawClientId);

    const pref = await getClientScriptPreference(tenantId);
    // Picks pointing at scripts that no longer exist (or moved category) are dropped.
    const selectedScripts = pref?.selected_scripts
      ? sanitizeSelectedScripts(pref.selected_scripts, await scriptRepository.listTemplates())
      : {};

    return NextResponse.json({
      // No saved preference yet: report that honestly (null) and expose the tenant's real
      // names so the page can personalise scripts without inventing anything.
      preference: pref || null,
      selected_scripts: selectedScripts,
      defaults: {
        custom_name: targetTenant?.primary_contact_name || '',
        custom_company: targetTenant?.name || '',
      },
    });
  } catch (error: any) {
    if (isAuthError(error)) return handleAuthError(error);
    return NextResponse.json(
      { error: 'Failed to retrieve video preference' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portal/[clientId]/video-preference
 * Saves the production choice (`video_preference`) and/or the self-filmed script picks
 * (`selected_scripts`: one script id per category, null to clear). Account owner only.
 */
export async function POST(
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

    // Writes always require a signed-in user; there is no anonymous fallback actor.
    if (!session) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.', code: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (!hasPermission(session.role, 'client:video_preference')) {
      return NextResponse.json({ error: 'You do not have permission to make this change. Ask the account owner.', code: 'FORBIDDEN' }, { status: 403 });
    }
    const actorRole: any = session.role;
    const actorEmail = session.email;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const { video_preference, custom_name, custom_company, selected_scripts } = body;

    const hasPreference = video_preference !== undefined;
    const hasPicks = selected_scripts !== undefined;
    if (!hasPreference && !hasPicks) {
      return NextResponse.json(
        { error: 'Provide a video preference or script picks to save.' },
        { status: 400 }
      );
    }

    if (hasPreference && video_preference !== 'ai_video' && video_preference !== 'self_filmed') {
      return NextResponse.json(
        { error: 'Preference must be either "ai_video" or "self_filmed"' },
        { status: 400 }
      );
    }
    for (const value of [custom_name, custom_company]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > MAX_NAME_LENGTH)) {
        return NextResponse.json({ error: 'Name and company must be text of 255 characters or fewer.' }, { status: 400 });
      }
    }

    // Validate the picks before anything is written.
    let picks: SelectedScripts | undefined;
    if (hasPicks) {
      if (!selected_scripts || typeof selected_scripts !== 'object' || Array.isArray(selected_scripts)) {
        return NextResponse.json({ error: 'Script picks must be an object of category to script id.' }, { status: 400 });
      }
      const templates = await scriptRepository.listTemplates();
      picks = {};
      for (const [category, scriptId] of Object.entries(selected_scripts as Record<string, unknown>)) {
        if (!isAdScriptCategory(category)) {
          return NextResponse.json(
            { error: `Unknown script category. Use one of: ${SELF_FILMED_CATEGORIES.join(', ')}.` },
            { status: 400 }
          );
        }
        if (scriptId === null || scriptId === '') continue; // cleared pick
        const script = typeof scriptId === 'string' ? templates.find((t) => t.id === scriptId) : undefined;
        if (!script || script.category !== category) {
          return NextResponse.json(
            { error: `That script is not available in ${SCRIPT_CATEGORY_LABELS[category]}. Refresh the page and pick again.` },
            { status: 400 }
          );
        }
        picks[category] = script.id;
      }
    }

    let updated = null;
    if (hasPreference) {
      updated = await setClientScriptPreference(tenantId, video_preference, custom_name, custom_company);
      await logAuditEvent({
        tenantId,
        actorEmail,
        actorRole,
        action: 'client.video_preference_updated',
        resourceType: 'script_preference',
        resourceId: updated.id,
        details: { video_preference, custom_name, custom_company },
      });
    }
    if (picks) {
      updated = await setClientSelectedScripts(tenantId, picks);
      await logAuditEvent({
        tenantId,
        actorEmail,
        actorRole,
        action: 'client.script_picks_updated',
        resourceType: 'script_preference',
        resourceId: updated.id,
        details: { selected_scripts: picks },
      });
    }

    return NextResponse.json({
      success: true,
      preference: updated,
      selected_scripts: picks ?? updated?.selected_scripts ?? {},
    });
  } catch (error: any) {
    if (isAuthError(error)) return handleAuthError(error);
    return NextResponse.json(
      { error: 'Failed to update video preference' },
      { status: 500 }
    );
  }
}
