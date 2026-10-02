import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { PortalTemplate, TemplateStep, StepOwner } from '../schema';
import { DatabaseError } from '../../errors';

/** Editable copy fields of a template step. step_key, sort_order and template_id are fixed. */
export interface TemplateStepUpdate {
  name?: string;
  owner?: StepOwner;
  what_it_is?: string;
  right_now?: string;
  unlocks?: string;
}

const EDITABLE_STEP_FIELDS: (keyof TemplateStepUpdate)[] = ['name', 'owner', 'what_it_is', 'right_now', 'unlocks'];

export class PortalTemplateRepository {
  async getDefaultTemplate(): Promise<{ template: PortalTemplate; steps: TemplateStep[] }> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: template, error: tmplError } = await supabase
        .from('portal_templates')
        .select('*')
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();

      if (tmplError) throw new DatabaseError(`Failed to fetch default template: ${tmplError.message}`, tmplError);

      if (template) {
        const { data: steps, error: stepsError } = await supabase
          .from('template_steps')
          .select('*')
          .eq('template_id', template.id)
          .order('sort_order', { ascending: true });

        if (stepsError) throw new DatabaseError(`Failed to fetch template steps: ${stepsError.message}`, stepsError);

        return {
          template: template as PortalTemplate,
          steps: (steps || []) as TemplateStep[],
        };
      }
    }

    const store = getStore();
    const template = store.portalTemplates.find((t) => t.is_default) || store.portalTemplates[0];
    const steps = store.templateSteps
      .filter((s) => s.template_id === template.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    return { template, steps };
  }

  async listTemplates(): Promise<PortalTemplate[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('portal_templates')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw new DatabaseError(`Failed to list templates: ${error.message}`, error);
      return (data || []) as PortalTemplate[];
    }

    const store = getStore();
    return store.portalTemplates;
  }

  /**
   * Updates the copy of one step on a template (the default template when templateId is omitted).
   * Only affects clients provisioned afterwards; existing client_setup_steps are untouched.
   * Returns null when the template or step does not exist.
   */
  async updateStep(
    stepKey: string,
    updates: TemplateStepUpdate,
    templateId?: string
  ): Promise<TemplateStep | null> {
    const patch: TemplateStepUpdate = {};
    for (const field of EDITABLE_STEP_FIELDS) {
      if (updates[field] !== undefined) (patch as any)[field] = updates[field];
    }

    const resolvedTemplateId = templateId || (await this.getDefaultTemplate()).template?.id;
    if (!resolvedTemplateId) return null;

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (Object.keys(patch).length === 0) {
        const { data, error } = await supabase
          .from('template_steps')
          .select('*')
          .eq('template_id', resolvedTemplateId)
          .eq('step_key', stepKey)
          .maybeSingle();
        if (error) throw new DatabaseError(`Failed to fetch template step: ${error.message}`, error);
        return (data as TemplateStep) || null;
      }

      const { data, error } = await supabase
        .from('template_steps')
        .update(patch)
        .eq('template_id', resolvedTemplateId)
        .eq('step_key', stepKey)
        .select('*')
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to update template step: ${error.message}`, error);
      if (!data) return null;

      await supabase
        .from('portal_templates')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', resolvedTemplateId);

      return data as TemplateStep;
    }

    const store = getStore();
    const step = store.templateSteps.find(
      (s) => s.template_id === resolvedTemplateId && s.step_key === stepKey
    );
    if (!step) return null;

    Object.assign(step, patch);
    const template = store.portalTemplates.find((t) => t.id === resolvedTemplateId);
    if (template) template.updated_at = new Date().toISOString();
    return step;
  }
}

export const portalTemplateRepository = new PortalTemplateRepository();
