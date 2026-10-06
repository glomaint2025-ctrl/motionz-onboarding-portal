/**
 * The onboarding form, defined once. The portal page draws the form from this list and the server
 * checks every submission against it, so a question can never be shown without being validated.
 *
 * The questions are the ones of the original GoHighLevel form "Onboarding Rejuvenation | Forms".
 * Answers are stored under the question LABEL (not the key), so submissions that came from
 * GoHighLevel and ones sent from the portal are shown the same way.
 *
 * This file has no server-only imports: pages and API routes both use it.
 */

export type OnboardingFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';

export interface OnboardingField {
  /** Stable name used in the form post and in error reports. Never shown to people. */
  key: string;
  /** The question as the client reads it. Answers are stored under this text. */
  label: string;
  type: OnboardingFieldType;
  required: boolean;
  /** Extra checking for a text answer. */
  format?: 'email' | 'phone';
  /** Choices for select, checkbox and radio questions. */
  options?: string[];
  /** Value a new form starts with. */
  defaultValue?: string;
  /** Example answer shown inside an empty box. */
  placeholder?: string;
  /** Short line shown under the question. */
  help?: string;
  /** Longest answer, in characters (text and textarea). */
  maxLength?: number;
  /** Names the same question had on older (GoHighLevel) submissions; used to pre-fill and to order answers. */
  aliases?: string[];
  /** Browser autofill hint. */
  autoComplete?: string;
}

export interface OnboardingSection {
  key: string;
  title: string;
  /** The line under the section heading. */
  description: string;
  fields: OnboardingField[];
}

export const TEXT_MAX_LENGTH = 300;
export const TEXTAREA_MAX_LENGTH = 5000;

/** Stored with a portal submission so staff tools can tell where it came from. Never displayed. */
export const SOURCE_KEY = '_source';
export const SOURCE_PORTAL = 'portal';

// ---- File uploads (limits follow Vercel's ~4.5 MB request body) ----
export const MAX_FILES_PER_FIELD = 5;
export const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'csv', 'xlsx', 'docx', 'txt'];
export const ALLOWED_UPLOAD_LABEL = 'PDF, PNG, JPG, WEBP, CSV, XLSX, DOCX or TXT';
export const UPLOAD_HELP = `Up to ${MAX_FILES_PER_FIELD} files (${ALLOWED_UPLOAD_LABEL}), 4 MB in total for the whole form. Videos are too large to upload here; send them to your CSM on Slack.`;

export const COUNTRY_OPTIONS = [
  'United States',
  'Canada',
  'United Kingdom',
  'Ireland',
  'Australia',
  'New Zealand',
  'Mexico',
  'Other',
];

const text = (key: string, label: string, required: boolean, extra: Partial<OnboardingField> = {}): OnboardingField => ({
  key,
  label,
  type: 'text',
  required,
  maxLength: TEXT_MAX_LENGTH,
  ...extra,
});

const textarea = (key: string, label: string, required: boolean, extra: Partial<OnboardingField> = {}): OnboardingField => ({
  key,
  label,
  type: 'textarea',
  required,
  maxLength: TEXTAREA_MAX_LENGTH,
  ...extra,
});

export const ONBOARDING_FORM_SECTIONS: OnboardingSection[] = [
  {
    key: 'business',
    title: 'Business details',
    description:
      'You acknowledge this data is taken from the onboarding forms to help us understand more about your rejuvenation business',
    fields: [
      text('full_name', 'Full Name', false, { placeholder: 'Joe Miller', aliases: ['full_name'], autoComplete: 'name' }),
      text('dba_business_name', 'DBA Business Name', true, { placeholder: 'Pro Toit', autoComplete: 'organization' }),
      text('business_email', 'Business Email', true, { format: 'email', placeholder: 'joe@protoit.ca', autoComplete: 'email' }),
      text('current_website', 'Current Website', true, { placeholder: 'https://protoit.ca', autoComplete: 'url' }),
      text('personal_phone', 'Personal Phone Number (For Communication)', true, {
        format: 'phone',
        placeholder: '+1 234-567-8901',
        aliases: ['Personnal Phone Number (For Communication)', 'phone'],
        autoComplete: 'tel',
      }),
      text('business_phone', 'Business Phone', true, { format: 'phone', placeholder: '+1 234-567-8901', autoComplete: 'tel' }),
      text('street_address', 'Street Address', false, { placeholder: 'Address', aliases: ['address1', 'address'], autoComplete: 'street-address' }),
      text('city', 'City', false, { placeholder: 'City', aliases: ['city'], autoComplete: 'address-level2' }),
      text('state', 'State', false, { placeholder: 'State', aliases: ['state'], autoComplete: 'address-level1' }),
      {
        key: 'country',
        label: 'Country',
        type: 'select',
        required: false,
        options: COUNTRY_OPTIONS,
        defaultValue: 'United States',
        aliases: ['country'],
      },
      text('postal_code', 'Postal Code', false, { placeholder: 'Postal Code', aliases: ['postal_code'], autoComplete: 'postal-code' }),
    ],
  },
  {
    key: 'marketing',
    title: 'Marketing',
    description: 'Provide Additional Information To Better Tailor the Marketing',
    fields: [
      {
        key: 'marketing_materials',
        label: 'Upload Useful Video / Materials for Marketing',
        type: 'file',
        required: false,
        help: UPLOAD_HELP,
      },
      textarea(
        'sales_process',
        'What is the process from coming to their house and signing a contract and how do you handle the fulfillment side as well?',
        true,
        {
          placeholder:
            'Start by greeting the customer, provide them with a step-by-step overview of the process, then get straight into inspecting the roof and completing the treatment process — no unnecessary fluff.',
        }
      ),
      textarea('what_makes_you_different', 'What makes your Rejuvenation Business different from the others?', true, {
        placeholder:
          'We don’t use any oil-based products. We are certified with XYZ partners and have been in the industry for X years.',
      }),
      textarea(
        'job_duration',
        "How long does a typical Rejuvenation Job usually take from start to finish, including inspection, treatment, and completion and what's the process?",
        true,
        {
          placeholder:
            'We usually take around 4 hours total for the entire process, including washing, spraying, and handling all equipment and materials with our staff.',
        }
      ),
      textarea('phrases_to_avoid', 'What are the phrases we should ABSOLUTELY avoid mentioning?', true, {
        placeholder:
          'A brand-new roof without replacing it\nYour roof will never need replacement again\nGuaranteed to last forever\nA lifetime roof guarantee',
      }),
    ],
  },
  {
    key: 'website',
    title: 'Website',
    description: 'Provide Additional Information To Better Tailor the Website Calculator',
    fields: [
      text('max_travel_distance', "What is the maximum distance you're willing to travel for a job?", false, {
        placeholder: 'The maximum distance we can service from this location is within a 1-hour drive.',
      }),
      text('ideal_project_size', 'What is the ideal project size?', false, {
        placeholder: 'Approximately 1,500 square feet, with an average price of $1.70 per square foot.',
      }),
      text('ideal_client_profile', 'What is your ideal client profile?', false, {
        placeholder:
          'I want to target a family of five who just bought their new home and want to protect their roof for the next 6–7 years.',
      }),
      text(
        'target_market',
        'Do you want to target residential (Homeowners), Commercial (Real Estate Agent) Industrial (Entrepreneurs)',
        false,
        {
          placeholder:
            'I wanna target real estate brokers restore roofs for a fraction of the cost of a replacement for like 30k',
          aliases: ['Do you wanna target residential (Homeowners), Commercial (Real Estate Agent) Industrial (Entrepreneurs)'],
        }
      ),
      text('price_per_square_foot', 'How much do you charge per square foot? (For the website)', false, {
        placeholder: 'We charge $1.9 per square foot in general',
      }),
      text('average_ticket_value', 'What is the average ticket value of your roof replacement jobs?', false, {
        placeholder: 'Ideal project value: $3,000–$7,000, depending on the roof size. Average job value: approximately $4,000.',
      }),
      {
        key: 'pricing_increases',
        label: 'Which of these increase your pricing?',
        type: 'checkbox',
        required: false,
        options: [
          'Steep pitch',
          'Multiple valleys',
          'Skylights',
          'Chimneys',
          'Solar panels',
          'Difficult access',
          'Multiple layers of shingles',
        ],
      },
      text('financing_providers', 'What financing providers do you use (If not use N/A) ?', false, {
        placeholder: 'We offer financing through Cherry, Affirm, and other financing providers.',
      }),
      text('service_areas', 'Which cities or zip/postal codes do you serve?', false, {
        placeholder: 'Glendale, Arizona 85303.',
      }),
    ],
  },
  {
    key: 'offer',
    title: 'Offer to advertise',
    description:
      'Advertise a Simpler, Lower-Friction Offer On The Frontend to Get Homeowners Fast, Then Upsell Them To A Larger Package On The Backend.',
    fields: [
      textarea('attraction_offer', 'Roof Rejuvenation Attraction Offer', true, {
        placeholder: 'Stop spending $15K on a new roof every few years. Extend your roof’s lifespan by up to 15 years.',
      }),
      textarea('attraction_offer_deliverables', 'Attraction Offer Deliverables', true, {
        placeholder:
          'We first clean the roof, remove any branches or debris, and clean the gutters. Then, we apply the roof treatment and take before-and-after photos to showcase the results.',
      }),
    ],
  },
  {
    key: 'sales',
    title: 'Sales refinement',
    description: 'We Highly Encourage Hiring a Virtual Salesperson If Your Sales Skills are not on point.',
    fields: [
      {
        key: 'taking_deposit',
        label: 'Are you taking a deposit?',
        type: 'radio',
        required: false,
        options: ['Yes', 'No'],
        help: 'Selling cold leads is HARDER than referrals',
      },
      textarea('appointment_manager_name', 'Appointment Manager Name / Front Desk Representative Name', true, {
        placeholder: 'The person managing the leads and making the calls is me. The person calling them is my receptionist, Maricia.',
      }),
      textarea('appointment_manager_email', 'Appointment Manager Email / Front Desk Email', true, {
        placeholder: 'Her email is sabrina@nanorejuvention.com',
      }),
      {
        key: 'old_leads_list',
        label: 'Upload A List Of Old Leads to Reactivate',
        type: 'file',
        required: false,
        help: UPLOAD_HELP,
      },
    ],
  },
];

/** Every question, in the order the form shows them. */
export const ONBOARDING_FORM_FIELDS: OnboardingField[] = ONBOARDING_FORM_SECTIONS.flatMap((s) => s.fields);

/** One uploaded file as it is kept in a submission's answers. */
export interface OnboardingFileRef {
  name: string;
  /** Object path in the private "onboarding-files" bucket: `<tenantId>/<folder>/<name>`. */
  path: string;
  size: number;
}

/** What the browser sends for one question: text, the ticked choices, or nothing. Files travel separately. */
export type OnboardingFormValues = Record<string, string | string[] | undefined>;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/** Checks the files chosen for the whole form by name, count and size. Returns a message per upload question. */
export function checkUploadSelection(
  selection: Record<string, { name: string; size: number }[]>,
  kept: Record<string, number> = {}
): Record<string, string> {
  const errors: Record<string, string> = {};
  let total = 0;
  for (const field of ONBOARDING_FORM_FIELDS.filter((f) => f.type === 'file')) {
    const files = selection[field.key] || [];
    if (files.length + (kept[field.key] || 0) > MAX_FILES_PER_FIELD) {
      errors[field.key] = `You can send up to ${MAX_FILES_PER_FIELD} files here.`;
      continue;
    }
    const wrong = files.find((f) => !ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(f.name)));
    if (wrong) {
      errors[field.key] = `"${wrong.name}" is not an allowed file type. Send ${ALLOWED_UPLOAD_LABEL} files.`;
      continue;
    }
    const empty = files.find((f) => f.size <= 0);
    if (empty) {
      errors[field.key] = `"${empty.name}" is empty.`;
      continue;
    }
    total += files.reduce((sum, f) => sum + f.size, 0);
    if (files.length > 0 && total > MAX_TOTAL_UPLOAD_BYTES) {
      errors[field.key] = 'Your files are larger than 4 MB in total. Remove a file, or send large files to your CSM on Slack.';
    }
  }
  return errors;
}
