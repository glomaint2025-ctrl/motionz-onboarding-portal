import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { OnboardingSubmission } from '../schema';
import { DatabaseError } from '../../errors';

export class OnboardingSubmissionRepository {
  async create(submission: Omit<OnboardingSubmission, 'id' | 'submitted_at'>): Promise<OnboardingSubmission> {
    const record: OnboardingSubmission = {
      ...submission,
      id: randomUUID(),
      submitted_at: new Date().toISOString(),
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase.from('onboarding_submissions').insert(record).select('*').single();
      if (error) throw new DatabaseError(`Failed to save onboarding submission: ${error.message}`, error);
      return data as OnboardingSubmission;
    }

    getStore().onboardingSubmissions.unshift(record);
    return record;
  }

  /** Newest first. Pass null to list submissions that could not be matched to a client. */
  async listByTenant(tenantId: string | null, limit = 20): Promise<OnboardingSubmission[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase
        .from('onboarding_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(limit);
      query = tenantId === null ? query.is('tenant_id', null) : query.eq('tenant_id', tenantId);
      const { data, error } = await query;
      if (error) throw new DatabaseError(`Failed to list onboarding submissions: ${error.message}`, error);
      return (data || []) as OnboardingSubmission[];
    }

    return getStore()
      .onboardingSubmissions.filter((s) => s.tenant_id === tenantId)
      .slice(0, limit);
  }

  async assignTenant(id: string, tenantId: string): Promise<void> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from('onboarding_submissions').update({ tenant_id: tenantId }).eq('id', id);
      if (error) throw new DatabaseError(`Failed to link onboarding submission: ${error.message}`, error);
      return;
    }
    const item = getStore().onboardingSubmissions.find((s) => s.id === id);
    if (item) item.tenant_id = tenantId;
  }
}

export const onboardingSubmissionRepository = new OnboardingSubmissionRepository();
