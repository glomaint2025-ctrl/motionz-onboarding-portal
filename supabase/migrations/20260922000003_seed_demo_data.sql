-- Migration: 20260922000003_seed_demo_data.sql
-- Description: Seed canonical Master Template, default scripts, and demo tenant (ABC Roofing)

-- 1. Insert Master Portal Template
INSERT INTO portal_templates (id, title, slug, description, is_default, default_features)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Motionz Standard Portal Template',
    'standard-template',
    'Canonical baseline portal template containing the 5 confirmed onboarding setup steps and default feature toggles.',
    TRUE,
    '{"onboarding": true, "leads": true, "tracking": true, "contracts": true, "orders": true, "tools": true, "roof_measurement": true, "video_scripts": true, "book_call": true, "team": true}'::JSONB
) ON CONFLICT (slug) DO NOTHING;

-- 2. Insert 5 Confirmed Master Template Setup Steps
INSERT INTO template_steps (id, template_id, step_key, name, owner, what_it_is, right_now, unlocks, sort_order)
VALUES
(
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'google_sheet',
    'Google Sheet',
    'we_handle',
    'Setting up your campaign tracking sheet with automated lead and performance metrics.',
    'Motionz team is preparing your custom tracking sheet.',
    'Live campaign tracking in the Tracking tab.',
    1
),
(
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'ghl_a2p',
    'GoHighLevel / A2P Verified',
    'we_handle',
    'Configuring your GoHighLevel sub-account, pipelines, and carrier A2P 10DLC registration.',
    'Registration submitted to carrier networks for verification.',
    'Direct lead synchronization, SMS messaging, and appointment booking.',
    2
),
(
    'b0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'facebook',
    'Facebook',
    'client_action',
    'Connecting your business Facebook page and ad account access for lead generation.',
    'Awaiting client access delegation or page confirmation.',
    'Targeted paid advertising and lead campaign launch.',
    3
),
(
    'b0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'domain_web',
    'Domain, email & website',
    'we_handle',
    'Provisioning your custom domain, business email accounts, and launching your company website.',
    'Domain records configured and SSL certificates generated.',
    'Professional online web presence and verified email delivery.',
    4
),
(
    'b0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'phone_system',
    'Phone system & A2P texting',
    'we_handle',
    'Provisioning your local business phone number and configuring call forwarding and texting.',
    'Phone system routing rules configured.',
    'Direct two-way calling and carrier-compliant customer SMS.',
    5
) ON CONFLICT DO NOTHING;

-- 3. Insert 3 Base Video Script Templates
INSERT INTO script_templates (id, title, script_content, sort_order)
VALUES
(
    'c0000000-0000-0000-0000-000000000001',
    'Script 1: Introduction and Brand Story',
    'Hello, I am {{client_name}} with {{company_name}}. We specialize in providing residential and commercial roof restoration and inspections throughout our local community. Our team is committed to safety, reliability, and long-lasting quality.',
    1
),
(
    'c0000000-0000-0000-0000-000000000002',
    'Script 2: Service Offer and Customer Value',
    'At {{company_name}}, we know your roof is your property first line of defense. My name is {{client_name}}, and we offer comprehensive roof assessments designed to identify issues before they lead to expensive structural damage.',
    2
),
(
    'c0000000-0000-0000-0000-000000000003',
    'Script 3: Call to Action and Inspection Booking',
    'Looking for honest, professional roofing services? Reach out to {{client_name}} at {{company_name}} today to schedule your complimentary inspection.',
    3
) ON CONFLICT DO NOTHING;

-- 4. Insert Demo Tenant: ABC Roofing
INSERT INTO tenants (id, name, slug, primary_email, primary_contact_name, phone, status, template_id, ghl_location_id)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'ABC Roofing',
    'abc-roofing',
    'john@abcroofing.com',
    'John Smith',
    '(555) 234-5678',
    'active',
    'a0000000-0000-0000-0000-000000000001',
    'loc_ghl_demo_abc'
) ON CONFLICT (slug) DO NOTHING;

-- 5. Insert Demo Users
-- Motionz Admin
INSERT INTO users (id, email, full_name, role)
VALUES ('e0000000-0000-0000-0000-000000000001', 'admin@motionz.ai', 'Motionz Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Motionz CSM
INSERT INTO users (id, email, full_name, role)
VALUES ('e0000000-0000-0000-0000-000000000002', 'csm@motionz.ai', 'Motionz CSM', 'csm')
ON CONFLICT (email) DO NOTHING;

-- ABC Roofing Client Owner
INSERT INTO users (id, email, full_name, role, tenant_id)
VALUES ('e0000000-0000-0000-0000-000000000003', 'john@abcroofing.com', 'John Smith', 'client', 'd0000000-0000-0000-0000-000000000001')
ON CONFLICT (email) DO NOTHING;

-- ABC Roofing Team Member
INSERT INTO users (id, email, full_name, role, tenant_id)
VALUES ('e0000000-0000-0000-0000-000000000004', 'sarah@abcroofing.com', 'Sarah Connor', 'client_member', 'd0000000-0000-0000-0000-000000000001')
ON CONFLICT (email) DO NOTHING;

-- 6. Assign CSM to ABC Roofing
INSERT INTO csm_assignments (csm_user_id, tenant_id)
VALUES ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- 7. Insert ABC Roofing Client Setup Steps (60% Progress: 3 Done, 1 In Progress, 1 Not Started)
INSERT INTO client_setup_steps (tenant_id, template_step_id, step_key, name, owner, status, what_it_is, right_now, unlocks, sort_order)
VALUES
(
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'google_sheet',
    'Google Sheet',
    'we_handle',
    'done',
    'Setting up your campaign tracking sheet with automated lead and performance metrics.',
    'Tracking sheet provisioned and linked.',
    'Live campaign tracking in the Tracking tab.',
    1
),
(
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'ghl_a2p',
    'GoHighLevel / A2P Verified',
    'we_handle',
    'in_progress',
    'Configuring your GoHighLevel sub-account, pipelines, and carrier A2P 10DLC registration.',
    'Registration submitted to carrier networks for verification.',
    'Direct lead synchronization, SMS messaging, and appointment booking.',
    2
),
(
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000003',
    'facebook',
    'Facebook',
    'client_action',
    'done',
    'Connecting your business Facebook page and ad account access for lead generation.',
    'Business page connected and ad account access verified.',
    'Targeted paid advertising and lead campaign launch.',
    3
),
(
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000004',
    'domain_web',
    'Domain, email & website',
    'we_handle',
    'done',
    'Provisioning your custom domain, business email accounts, and launching your company website.',
    'Domain active and verified with SSL.',
    'Professional online web presence and verified email delivery.',
    4
),
(
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000005',
    'phone_system',
    'Phone system & A2P texting',
    'we_handle',
    'not_started',
    'Provisioning your local business phone number and configuring call forwarding and texting.',
    'Queued for phone number selection.',
    'Direct two-way calling and carrier-compliant customer SMS.',
    5
) ON CONFLICT DO NOTHING;
