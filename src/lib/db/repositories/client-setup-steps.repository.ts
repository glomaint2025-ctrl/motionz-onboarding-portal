import { randomUUID } from 'crypto';
import { getSupabaseServiceClient, resolveTenantId } from '../supabase-client';
import { getStore } from '../mock-db';
import { ClientSetupStep, SetupStatus } from '../schema';
import { DatabaseError, NotFoundError } from '../../errors';

export class ClientSetupStepRepository {
  async listByTenant(tenantId: string): Promise<ClientSetupStep[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const targetTenantId = resolveTenantId(tenantId);
      const { data, error } = await supabase
        .from('client_setup_steps')
        .select('*')
        .eq('tenant_id', targetTenantId)
        .order('sort_order', { ascending: true });

      if (error) throw new DatabaseError(`Failed to fetch setup steps: ${error.message}`, error);
      return (data || []) as ClientSetupStep[];
    }

    const store = getStore();
    return store.clientSetupSteps
      .filter((s) => s.tenant_id === tenantId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  async cloneStepsForTenant(tenantId: string, steps: Omit<ClientSetupStep, 'id'>[]): Promise<ClientSetupStep[]> {
    const records: ClientSetupStep[] = steps.map((s, idx) => ({
      ...s,
      id: randomUUID(),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    }));

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('client_setup_steps')
        .insert(records)
        .select('*');

      if (error) throw new DatabaseError(`Failed to clone setup steps: ${error.message}`, error);
      return (data || []) as ClientSetupStep[];
    }

    const store = getStore();
    store.clientSetupSteps.push(...records);
    return records;
  }

  async updateStep(
    tenantId: string,
    stepKey: string,
    updates: Partial<Pick<ClientSetupStep, 'status' | 'name' | 'what_it_is' | 'right_now' | 'we_need_from_you' | 'unlocks'>>
  ): Promise<ClientSetupStep> {
    const now = new Date().toISOString();
    const cleanUpdates: any = {
      ...updates,
      updated_at: now,
    };
    if (updates.status === 'done') {
      cleanUpdates.completed_at = now;
    }

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('client_setup_steps')
        .update(cleanUpdates)
        .eq('tenant_id', tenantId)
        .eq('step_key', stepKey)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to update step: ${error.message}`, error);
      if (!data) throw new NotFoundError('ClientSetupStep', `${tenantId}:${stepKey}`);
      return data as ClientSetupStep;
    }

    const store = getStore();
    const step = store.clientSetupSteps.find(
      (s) => s.tenant_id === tenantId && s.step_key === stepKey
    );
    if (!step) throw new NotFoundError('ClientSetupStep', `${tenantId}:${stepKey}`);

    Object.assign(step, cleanUpdates);
    return step;
  }
}

export const clientSetupStepRepository = new ClientSetupStepRepository();
