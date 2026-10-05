import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceKey));
};

let browserClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

/**
 * Next.js 14 keeps server-side fetch() responses in its Data Cache by default, which made
 * Supabase reads (users, tenants) come back stale after an update. Database reads must
 * always be live, so every Supabase request opts out of that cache.
 */
const uncachedFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

export const getSupabaseBrowserClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: uncachedFetch } });
  }
  return browserClient;
};

export const getSupabaseServiceClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured() || !supabaseServiceKey) return null;
  if (!serviceClient) {
    serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: uncachedFetch },
    });
  }
  return serviceClient;
};

export { DEMO_TENANT_UUID, LEGACY_DEMO_TENANT_UUID, resolveTenantId } from '../auth/edge-session';

