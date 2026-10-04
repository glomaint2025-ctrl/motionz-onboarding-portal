import { ScriptCategory, normalizeScriptCategory } from './ad-script-library';

export interface ScriptVariableContext {
  client_name: string;
  company_name: string;
  /** Name of a real customer for testimonial scripts. Left as a visible blank when unknown. */
  testimonial_name?: string;
}

export interface GeneratedScript {
  id: string;
  title: string;
  content: string;
  rawTemplate: string;
  category: ScriptCategory;
}

/** Shown in place of {{testimonial_name}} when no customer name is known: never invent one. */
export const TESTIMONIAL_NAME_PLACEHOLDER = "[a happy customer's name]";

/** Typical spoken pace for read-aloud video scripts. */
export const WORDS_PER_MINUTE = 150;

/**
 * Interpolates variables ({{client_name}}, {{company_name}}, {{testimonial_name}}) into a script template.
 * Strictly template-based; NO AI generation dependencies.
 */
export function interpolateScript(template: string, context: ScriptVariableContext): string {
  if (!template) return '';

  const clientName = context.client_name?.trim() || 'Owner';
  const companyName = context.company_name?.trim() || 'Our Roofing Company';
  const testimonialName = context.testimonial_name?.trim() || TESTIMONIAL_NAME_PLACEHOLDER;

  // Function replacers so a "$" in a name is never treated as a replacement pattern.
  return template
    .replace(/\{\{\s*client_name\s*\}\}/g, () => clientName)
    .replace(/\{\{\s*company_name\s*\}\}/g, () => companyName)
    .replace(/\{\{\s*testimonial_name\s*\}\}/g, () => testimonialName);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimated seconds to read a script aloud at ~150 words per minute. 0 for empty text. */
export function estimateReadSeconds(text: string): number {
  const words = countWords(text);
  if (words === 0) return 0;
  return Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60));
}

/** Baseline educational (AI video) scripts, used when no database templates are available. */
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

/**
 * Interpolates a list of stored script templates (e.g. rows from script_templates) for one client.
 */
export function generateScriptsFromTemplates(
  templates: { id: string; title: string; script_content: string; category?: string | null }[],
  context: ScriptVariableContext
): GeneratedScript[] {
  return templates.map((item) => ({
    id: item.id,
    title: item.title,
    rawTemplate: item.script_content,
    content: interpolateScript(item.script_content, context),
    category: normalizeScriptCategory(item.category),
  }));
}

export function generateAllScripts(context: ScriptVariableContext): GeneratedScript[] {
  return DEFAULT_SCRIPT_TEMPLATES.map((item) => ({
    id: item.id,
    title: item.title,
    rawTemplate: item.template,
    content: interpolateScript(item.template, context),
    category: 'ai_video' as const,
  }));
}
