export interface ScriptVariableContext {
  client_name: string;
  company_name: string;
}

export interface GeneratedScript {
  id: string;
  title: string;
  content: string;
  rawTemplate: string;
}

/**
 * Interpolates variables ({{client_name}}, {{company_name}}) into a script template.
 * Strictly template-based; NO AI generation dependencies.
 */
export function interpolateScript(template: string, context: ScriptVariableContext): string {
  if (!template) return '';

  const clientName = context.client_name?.trim() || 'Owner';
  const companyName = context.company_name?.trim() || 'Our Roofing Company';

  return template
    .replace(/\{\{\s*client_name\s*\}\}/g, clientName)
    .replace(/\{\{\s*company_name\s*\}\}/g, companyName);
}

export const DEFAULT_SCRIPT_TEMPLATES = [
  {
    id: 'script-1',
    title: 'Script 1: Introduction & Local Brand Story',
    template:
      'Hello, I am {{client_name}} with {{company_name}}. We specialize in providing residential and commercial roof restoration and inspections throughout our local community. Our team is committed to safety, reliability, and long-lasting quality.',
  },
  {
    id: 'script-2',
    title: 'Script 2: Service Offer & Preventive Inspection',
    template:
      'At {{company_name}}, we know your roof is your property first line of defense. My name is {{client_name}}, and we offer comprehensive roof assessments designed to identify issues before they lead to expensive structural damage.',
  },
  {
    id: 'script-3',
    title: 'Script 3: Call to Action & Complimentary Assessment',
    template:
      'Looking for honest, professional roofing services? Reach out to {{client_name}} at {{company_name}} today to schedule your complimentary roof inspection.',
  },
];

export function generateAllScripts(context: ScriptVariableContext): GeneratedScript[] {
  return DEFAULT_SCRIPT_TEMPLATES.map((item) => ({
    id: item.id,
    title: item.title,
    rawTemplate: item.template,
    content: interpolateScript(item.template, context),
  }));
}
