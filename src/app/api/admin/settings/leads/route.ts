import { NextResponse } from 'next/server';
import { auditLogRepository } from '@/lib/db/repositories';
import { getLeadSettings, setLeadSettings, cleanLeadTag, LEAD_TAG_MAX_LENGTH } from '@/lib/db/repositories/app-settings.repository';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

/** Admin setting: when a GoHighLevel contact counts as a lead (always, or only with a tag). */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    return NextResponse.json({ success: true, leads: await getLeadSettings() });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load the lead settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode;

    if (mode !== 'opportunity' && mode !== 'tag') {
      return NextResponse.json({ error: 'Choose when a contact counts as a lead.' }, { status: 400 });
    }

    let requiredTag = '';
    if (mode === 'tag') {
      const typed = typeof body?.required_tag === 'string' ? body.required_tag.trim().replace(/\s+/g, ' ') : '';
      if (!typed) return NextResponse.json({ error: 'Type the tag name.', field: 'required_tag' }, { status: 400 });
      if (typed.length > LEAD_TAG_MAX_LENGTH) {
        return NextResponse.json(
          { error: `Keep the tag name to ${LEAD_TAG_MAX_LENGTH} characters or fewer.`, field: 'required_tag' },
          { status: 400 }
        );
      }
      // GoHighLevel sends a contact's tags as one comma-separated list, so a comma can never be part of a tag.
      if (typed.includes(',')) {
        return NextResponse.json({ error: 'Type one tag name, without commas.', field: 'required_tag' }, { status: 400 });
      }
      requiredTag = cleanLeadTag(typed);
    }

    const previous = await getLeadSettings();
    const value = { required_tag: requiredTag };
    await setLeadSettings(value, session!.email);
    await auditLogRepository.create({
      actor_email: session!.email,
      actor_role: 'admin',
      action: 'settings.leads_updated',
      resource_type: 'app_settings',
      resource_id: 'leads',
      // "(none)" = no tag needed. An empty value would not be shown in the audit log.
      details: { required_tag: value.required_tag || '(none)', previous_tag: previous.required_tag || '(none)' },
    });

    return NextResponse.json({ success: true, leads: value });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save the lead settings.' }, { status: 500 });
  }
}
