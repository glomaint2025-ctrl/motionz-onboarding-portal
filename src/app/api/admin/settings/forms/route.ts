import { NextResponse } from 'next/server';
import { appSettingsRepository, auditLogRepository } from '@/lib/db/repositories';
import { getFormSettings } from '@/lib/db/repositories/app-settings.repository';
import { FORM_SETTING_FIELDS, parseGhlFormId, type FormSettingKey } from '@/lib/ghl-forms';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';

/** Admin settings: which GoHighLevel forms the client portal shows. Only the form ids are stored. */
export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    const forms = await getFormSettings();
    return NextResponse.json({ success: true, forms });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to load the form settings.' }, { status: 500 });
  }
}

/**
 * Body: `a2p_form_id` (the Texting registration form) as a GoHighLevel form link, embed snippet or
 * bare id. Left out, it keeps its saved value; it can never be emptied.
 * `onboarding_form_id`, `lead_replacement_form_id` and `unresponsive_lead_form_id` are ignored if
 * sent: those forms are built into the portal now.
 */
export async function PUT(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = await request.json().catch(() => ({}));

    const previous = await getFormSettings();
    const value = { ...previous };
    const fields: Partial<Record<FormSettingKey, string>> = {};

    for (const { key, label, required } of FORM_SETTING_FIELDS) {
      const input = body?.[key];
      if (input === undefined) continue;

      if (input === null || (typeof input === 'string' && input.trim() === '')) {
        if (required) {
          fields[key] = `${label}: this form is always shown to clients, so it cannot be left empty. Paste the form link or ID from GoHighLevel.`;
        } else {
          value[key] = '';
        }
        continue;
      }

      const formId = parseGhlFormId(input);
      if (!formId) {
        fields[key] = `${label}: that does not look like a GoHighLevel form link or ID. Copy the link from GoHighLevel and paste it again.`;
        continue;
      }
      value[key] = formId;
    }

    const messages = Object.values(fields);
    if (messages.length > 0) {
      return NextResponse.json({ error: messages.join(' '), fields }, { status: 400 });
    }

    const changed = FORM_SETTING_FIELDS.filter(({ key }) => value[key] !== previous[key]);
    if (changed.length > 0) {
      await appSettingsRepository.set('forms', value, session!.email);
      await auditLogRepository.create({
        actor_email: session!.email,
        actor_role: 'admin',
        action: 'settings.forms_updated',
        resource_type: 'app_settings',
        resource_id: 'forms',
        details: {
          changed: changed.map(({ key }) => key),
          forms: changed.map(({ label }) => label),
          previous: Object.fromEntries(changed.map(({ key }) => [key, previous[key]])),
          current: Object.fromEntries(changed.map(({ key }) => [key, value[key]])),
        },
      });
    }

    return NextResponse.json({ success: true, forms: value, changed: changed.map(({ key }) => key) });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'Failed to save the form settings.' }, { status: 500 });
  }
}
