import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { PortalTemplate, TemplateStep } from '../schema';
import { DatabaseError } from '../../errors';

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
}

export const portalTemplateRepository = new PortalTemplateRepository();
