import {
  Tenant,
  User,
  CsmAssignment,
  UserInvitation,
  PortalTemplate,
  TemplateStep,
  ClientSetupStep,
  FeatureToggle,
  IntegrationConfig,
  Contract,
  Order,
  ScriptTemplate,
  ClientScriptPreference,
  RoofMeasurement,
  Lead,
  Appointment,
  AuditLog,
  SecurityEvent,
  PasswordResetToken,
  OnboardingSubmission,
  LeadRequest,
  AppSetting,
} from './schema';
import { AD_SCRIPT_LIBRARY } from '../scripts/ad-script-library';

export interface DatabaseStore {
  tenants: Tenant[];
  users: User[];
  csmAssignments: CsmAssignment[];
  userInvitations: UserInvitation[];
  passwordResetTokens: PasswordResetToken[];
  onboardingSubmissions: OnboardingSubmission[];
  leadRequests: LeadRequest[];
  appSettings: AppSetting[];
  portalTemplates: PortalTemplate[];
  templateSteps: TemplateStep[];
  clientSetupSteps: ClientSetupStep[];
  featureToggles: FeatureToggle[];
  integrationConfigs: IntegrationConfig[];
  contracts: Contract[];
  orders: Order[];
  scriptTemplates: ScriptTemplate[];
  clientScriptPreferences: ClientScriptPreference[];
  roofMeasurements: RoofMeasurement[];
  leads: Lead[];
  appointments: Appointment[];
  auditLogs: AuditLog[];
  securityEvents: SecurityEvent[];
}

export const createInitialStore = (): DatabaseStore => {
  const masterTemplateId = 'tmpl-master-standard';
  const demoTenantId = '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f';

  return {
    portalTemplates: [
      {
        id: masterTemplateId,
        title: 'Motionz Standard Portal Template',
        slug: 'standard-template',
        description: 'Canonical baseline portal template containing the standard onboarding setup steps.',
        is_default: true,
        default_features: {
          onboarding: true,
          leads: true,
          tracking: true,
          contracts: true,
          orders: true,
          tools: true,
          roof_measurement: true,
          video_scripts: true,
          book_call: true,
          team: true,
        },
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ],

    templateSteps: [
      {
        id: 't-step-1',
        template_id: masterTemplateId,
        step_key: 'google_sheet',
        name: 'Google Sheet',
        owner: 'we_handle',
        what_it_is: 'Setting up your campaign tracking sheet with automated lead and performance metrics.',
        right_now: 'Motionz team is preparing your custom tracking sheet.',
        unlocks: 'Live campaign tracking in the Tracking tab.',
        sort_order: 1,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 't-step-2',
        template_id: masterTemplateId,
        step_key: 'ghl_a2p',
        name: 'GoHighLevel / A2P Verified',
        owner: 'we_handle',
        what_it_is: 'Configuring your GoHighLevel sub-account, pipelines, and carrier A2P 10DLC registration.',
        right_now: 'Registration submitted to carrier networks for verification.',
        unlocks: 'Direct lead synchronization, SMS messaging, and appointment booking.',
        sort_order: 2,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 't-step-4',
        template_id: masterTemplateId,
        step_key: 'domain_web',
        name: 'Domain, email & website',
        owner: 'we_handle',
        what_it_is: 'Provisioning your custom domain, business email accounts, and launching your company website.',
        right_now: 'Domain records configured and SSL certificates generated.',
        unlocks: 'Professional online web presence and verified email delivery.',
        sort_order: 3,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 't-step-5',
        template_id: masterTemplateId,
        step_key: 'phone_system',
        name: 'Phone system & A2P texting',
        owner: 'we_handle',
        what_it_is: 'Provisioning your local business phone number and configuring call forwarding and texting.',
        right_now: 'Phone system routing rules configured.',
        unlocks: 'Direct two-way calling and carrier-compliant customer SMS.',
        sort_order: 4,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],

    tenants: [
      {
        id: demoTenantId,
        name: 'ABC Roofing',
        slug: 'abc-roofing',
        primary_email: 'john@abcroofing.com',
        primary_contact_name: 'John Smith',
        phone: '(555) 234-5678',
        status: 'active',
        template_id: masterTemplateId,
        ghl_location_id: 'loc_ghl_demo_abc',
        created_at: '2026-09-10T00:00:00Z',
        updated_at: '2026-09-10T00:00:00Z',
      },
    ],

    users: [
      {
        id: 'user-admin-1',
        email: 'admin@motionz.ai',
        full_name: 'Motionz Admin',
        role: 'admin',
        password_hash: 'password',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'user-csm-1',
        email: 'csm@motionz.ai',
        full_name: 'Motionz CSM',
        role: 'csm',
        password_hash: 'password',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'user-csm-2',
        email: 'csm.agent@motionz.ai',
        full_name: 'Motionz CSM Agent',
        role: 'csm',
        password_hash: 'password',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'user-client-1',
        email: 'john@abcroofing.com',
        full_name: 'John Smith',
        role: 'client',
        tenant_id: demoTenantId,
        password_hash: 'password',
        created_at: '2026-09-10T00:00:00Z',
        updated_at: '2026-09-10T00:00:00Z',
      },
      {
        id: 'user-member-1',
        email: 'sarah@abcroofing.com',
        full_name: 'Sarah Connor',
        role: 'client_member',
        tenant_id: demoTenantId,
        password_hash: 'password',
        allowed_modules: [
          'onboarding',
          'leads',
          'tracking',
          'contracts',
          'orders',
          'tools',
          'roof_measurement',
          'video_scripts',
          'book_call',
          'team',
        ],
        created_at: '2026-09-12T00:00:00Z',
        updated_at: '2026-09-12T00:00:00Z',
      },
    ],

    csmAssignments: [
      {
        id: 'assign-1',
        csm_user_id: 'user-csm-1',
        tenant_id: demoTenantId,
        assigned_at: '2026-09-10T00:00:00Z',
      },
    ],

    userInvitations: [],
    passwordResetTokens: [],
    onboardingSubmissions: [],
    leadRequests: [],
    appSettings: [],

    clientSetupSteps: [
      {
        id: 'c-step-1',
        tenant_id: demoTenantId,
        template_step_id: 't-step-1',
        step_key: 'google_sheet',
        name: 'Google Sheet',
        owner: 'we_handle',
        status: 'done',
        what_it_is: 'Setting up your campaign tracking sheet with automated lead and performance metrics.',
        right_now: 'Tracking sheet provisioned and linked.',
        unlocks: 'Live campaign tracking in the Tracking tab.',
        sort_order: 1,
        completed_at: '2026-09-11T00:00:00Z',
        updated_at: '2026-09-11T00:00:00Z',
      },
      {
        id: 'c-step-2',
        tenant_id: demoTenantId,
        template_step_id: 't-step-2',
        step_key: 'ghl_a2p',
        name: 'GoHighLevel / A2P Verified',
        owner: 'we_handle',
        status: 'in_progress',
        what_it_is: 'Configuring your GoHighLevel sub-account, pipelines, and carrier A2P 10DLC registration.',
        right_now: 'Registration submitted to carrier networks for verification.',
        unlocks: 'Direct lead synchronization, SMS messaging, and appointment booking.',
        sort_order: 2,
        updated_at: '2026-09-12T00:00:00Z',
      },
      {
        id: 'c-step-4',
        tenant_id: demoTenantId,
        template_step_id: 't-step-4',
        step_key: 'domain_web',
        name: 'Domain, email & website',
        owner: 'we_handle',
        status: 'done',
        what_it_is: 'Provisioning your custom domain, business email accounts, and launching your company website.',
        right_now: 'Domain active and verified with SSL.',
        unlocks: 'Professional online web presence and verified email delivery.',
        sort_order: 3,
        completed_at: '2026-09-14T00:00:00Z',
        updated_at: '2026-09-14T00:00:00Z',
      },
      {
        id: 'c-step-5',
        tenant_id: demoTenantId,
        template_step_id: 't-step-5',
        step_key: 'phone_system',
        name: 'Phone system & A2P texting',
        owner: 'we_handle',
        status: 'not_started',
        what_it_is: 'Provisioning your local business phone number and configuring call forwarding and texting.',
        right_now: 'Queued for phone number selection.',
        unlocks: 'Direct two-way calling and carrier-compliant customer SMS.',
        sort_order: 4,
        updated_at: '2026-09-15T00:00:00Z',
      },
    ],

    featureToggles: [
      { id: 'ft-1', tenant_id: demoTenantId, feature_key: 'onboarding', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-2', tenant_id: demoTenantId, feature_key: 'leads', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-3', tenant_id: demoTenantId, feature_key: 'tracking', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-4', tenant_id: demoTenantId, feature_key: 'contracts', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-5', tenant_id: demoTenantId, feature_key: 'orders', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-6', tenant_id: demoTenantId, feature_key: 'tools', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-7', tenant_id: demoTenantId, feature_key: 'roof_measurement', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-8', tenant_id: demoTenantId, feature_key: 'video_scripts', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-9', tenant_id: demoTenantId, feature_key: 'book_call', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
      { id: 'ft-10', tenant_id: demoTenantId, feature_key: 'team', is_enabled: true, updated_at: '2026-09-10T00:00:00Z' },
    ],

    integrationConfigs: [
      {
        id: 'ic-1',
        tenant_id: demoTenantId,
        integration_type: 'ghl',
        config_data: { location_id: 'loc_ghl_demo_abc', sync_status: 'connected' },
        is_active: true,
        updated_at: '2026-09-10T00:00:00Z',
      },
      {
        id: 'ic-2',
        tenant_id: demoTenantId,
        integration_type: 'google_sheets',
        config_data: { spreadsheet_id: 'sheet_demo_123', tab_name: 'Campaign Leads' },
        is_active: true,
        updated_at: '2026-09-10T00:00:00Z',
      },
    ],

    contracts: [
      {
        id: 'contract-1',
        tenant_id: demoTenantId,
        title: 'Motionz Client Service Agreement',
        document_url: '/demo-contract.pdf',
        signed_at: '2026-09-10T14:30:00Z',
        ghl_document_id: 'doc_ghl_9874',
        created_at: '2026-09-10T14:30:00Z',
      },
    ],

    orders: [
      {
        id: 'order-1',
        tenant_id: demoTenantId,
        order_number: 'ORD-2026-001',
        label: 'Initial Contractor Marketing & Swag Package',
        stage: 'shipped',
        carrier: 'FedEx Freight',
        tracking_number: '784920194821',
        tracking_url: 'https://fedex.com/tracking?id=784920194821',
        batch_info: 'Batch 1 - Eastern Warehouse',
        created_at: '2026-09-12T00:00:00Z',
        updated_at: '2026-09-14T00:00:00Z',
      },
    ],

    scriptTemplates: [
      {
        id: 'st-1',
        title: 'Script 1: Introduction and Brand Story',
        script_content: 'Hello, I am {{client_name}} with {{company_name}}. We specialize in providing residential and commercial roof restoration and inspections throughout our local community. Our team is committed to safety, reliability, and long-lasting quality.',
        category: 'ai_video',
        sort_order: 1,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'st-2',
        title: 'Script 2: Service Offer and Customer Value',
        script_content: 'At {{company_name}}, we know your roof is your property\'s first line of defense. My name is {{client_name}}, and we offer comprehensive roof assessments designed to identify issues before they lead to expensive structural damage.',
        category: 'ai_video',
        sort_order: 2,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'st-3',
        title: 'Script 3: Call to Action and Inspection Booking',
        script_content: 'Looking for honest, professional roofing services? Reach out to {{client_name}} at {{company_name}} today to schedule your complimentary inspection.',
        category: 'ai_video',
        sort_order: 3,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      // Self-filmed ad script library (Google Doc "Motionz AI | Ad Scripts").
      ...AD_SCRIPT_LIBRARY.map((script) => ({
        ...script,
        created_at: '2026-10-04T00:00:00Z',
        updated_at: '2026-10-04T00:00:00Z',
      })),
    ],

    clientScriptPreferences: [
      {
        id: 'pref-1',
        tenant_id: demoTenantId,
        video_preference: 'ai_video',
        custom_name: 'John Smith',
        custom_company: 'ABC Roofing',
        selected_scripts: {},
        updated_at: '2026-09-15T00:00:00Z',
      },
    ],

    roofMeasurements: [],

    leads: [
      {
        id: 'lead-1',
        tenant_id: demoTenantId,
        ghl_contact_id: 'cnt_101',
        first_name: 'Robert',
        last_name: 'Johnson',
        email: 'robert.j@example.com',
        phone: '(555) 101-2020',
        status: 'Appointment Booked',
        source: 'Facebook Ads',
        created_at: '2026-09-18T09:00:00Z',
        updated_at: '2026-09-18T09:00:00Z',
      },
      {
        id: 'lead-2',
        tenant_id: demoTenantId,
        ghl_contact_id: 'cnt_102',
        first_name: 'Mary',
        last_name: 'Williams',
        email: 'mary.w@example.com',
        phone: '(555) 303-4040',
        status: 'Contacted',
        source: 'Google Ads',
        created_at: '2026-09-19T11:30:00Z',
        updated_at: '2026-09-19T11:30:00Z',
      },
      {
        id: 'lead-3',
        tenant_id: demoTenantId,
        ghl_contact_id: 'cnt_103',
        first_name: 'Michael',
        last_name: 'Brown',
        email: 'michael.b@example.com',
        phone: '(555) 505-6060',
        status: 'Inspection Completed',
        source: 'Facebook Ads',
        created_at: '2026-09-20T14:15:00Z',
        updated_at: '2026-09-20T14:15:00Z',
      },
    ],

    appointments: [
      {
        id: 'apt-1',
        tenant_id: demoTenantId,
        ghl_appointment_id: 'apt_ghl_501',
        contact_name: 'Robert Johnson',
        appointment_time: '2026-09-24T10:00:00Z',
        status: 'confirmed',
        notes: 'Residential roof inspection - 2,400 sq ft home',
        created_at: '2026-09-18T09:30:00Z',
      },
    ],

    auditLogs: [
      {
        id: 'log-1',
        tenant_id: demoTenantId,
        actor_email: 'admin@motionz.ai',
        actor_role: 'admin',
        action: 'tenant.provision',
        resource_type: 'tenant',
        resource_id: demoTenantId,
        details: { company: 'ABC Roofing', template: 'standard-template' },
        created_at: '2026-09-10T00:00:00Z',
      },
    ],

    securityEvents: [],
  };
};

// Global singleton store for local/testing execution
let globalStore: DatabaseStore | null = null;

export const getStore = (): DatabaseStore => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_MOCK_IN_PROD) {
    throw new Error(
      'CRITICAL DATABASE FAULT: Attempted to access in-memory mock datastore in PRODUCTION environment. Production strictly requires persistent Supabase database connection.'
    );
  }
  if (!globalStore) {
    globalStore = createInitialStore();
  }
  return globalStore;
};

export const resetStore = (): void => {
  globalStore = createInitialStore();
};
