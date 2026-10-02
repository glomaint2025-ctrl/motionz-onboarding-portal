import { ValidationError } from '../errors';
import { SetupStatus, UserRole } from '../db/schema';

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export function parsePaginationParams(params: {
  limit?: string | number | null;
  offset?: string | number | null;
  defaultLimit?: number;
  maxLimit?: number;
}): { limit: number; offset: number } {
  const defaultLimit = params.defaultLimit || 25;
  const maxLimit = params.maxLimit || 100;

  let limit = defaultLimit;
  if (params.limit !== undefined && params.limit !== null) {
    const parsed = typeof params.limit === 'number' ? params.limit : parseInt(params.limit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, maxLimit);
    }
  }

  let offset = 0;
  if (params.offset !== undefined && params.offset !== null) {
    const parsed = typeof params.offset === 'number' ? params.offset : parseInt(params.offset, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  return { limit, offset };
}

export function validateEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email address is required.');
  }
  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    throw new ValidationError(`Invalid email format: "${email}".`);
  }
  return normalized;
}

/**
 * Accepts common phone formats (+1 (555) 234-5678, 555.234.5678, +94771234567).
 * Requires 7-15 digits and only phone punctuation, so passwords or notes cannot be saved as phones.
 */
export function validatePhone(phone: unknown, options: { required?: boolean } = {}): string | undefined {
  const value = typeof phone === 'string' ? phone.trim() : phone == null ? '' : String(phone).trim();
  if (!value) {
    if (options.required) throw new ValidationError('A phone number is required.');
    return undefined;
  }
  const digits = value.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
    throw new ValidationError('Enter a valid phone number, for example +1 555 234 5678.');
  }
  return value;
}

/** Trims a free-text field and enforces a length limit. */
export function validateText(value: unknown, field: string, options: { required?: boolean; max?: number } = {}): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    if (options.required) throw new ValidationError(`${field} is required.`);
    return undefined;
  }
  if (text.length > (options.max ?? 255)) throw new ValidationError(`${field} is too long.`);
  return text;
}

export function validateTenantPayload(data: {
  name?: string;
  slug?: string;
  primary_email?: string;
  phone?: string;
}): { name: string; slug: string; primary_email: string; phone?: string } {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    throw new ValidationError('Tenant organization name is required.');
  }
  const name = data.name.trim();

  const primary_email = validateEmail(data.primary_email || '');

  const rawSlug = data.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!rawSlug) {
    throw new ValidationError('A valid tenant slug is required.');
  }

  return {
    name,
    slug: rawSlug,
    primary_email,
    phone: data.phone?.trim(),
  };
}

export function validateSetupStatus(status: any): SetupStatus {
  const validStatuses: SetupStatus[] = ['not_started', 'in_progress', 'done'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(
      `Invalid setup status: "${status}". Must be one of: ${validStatuses.join(', ')}.`
    );
  }
  return status;
}

export function validateUserRole(role: any): UserRole {
  const normalized = role === 'client_team' ? 'client_member' : role;
  const validRoles: UserRole[] = ['admin', 'csm', 'client', 'client_member'];
  if (!validRoles.includes(normalized)) {
    throw new ValidationError(
      `Invalid user role: "${role}". Must be one of: ${validRoles.join(', ')}.`
    );
  }
  return normalized;
}
