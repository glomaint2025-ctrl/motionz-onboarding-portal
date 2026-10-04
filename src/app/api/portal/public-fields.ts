import type { Tenant, User, UserInvitation } from '@/lib/db/schema';

/**
 * The only fields of each record that portal APIs send to the browser.
 * Settings, template ids, suspension notes, password and token hashes stay on the server.
 */
export function publicTenant(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    primary_email: tenant.primary_email,
    primary_contact_name: tenant.primary_contact_name,
    phone: tenant.phone,
    logo_url: tenant.logo_url,
  };
}

export function publicTeamMember(user: User) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    allowed_modules: user.allowed_modules,
  };
}

export function publicInvitation(invitation: UserInvitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    full_name: invitation.full_name,
    phone: invitation.phone,
    role: invitation.role,
    allowed_modules: invitation.allowed_modules,
    expires_at: invitation.expires_at,
    created_at: invitation.created_at,
  };
}
