-- Optional demo data for local/staging databases ONLY. Do not run on production.
-- Requires migration 20260922000003 (master template) to have run first.

-- 4. Insert Demo Tenant: ABC Roofing
INSERT INTO tenants (id, name, slug, primary_email, primary_contact_name, phone, status, template_id, ghl_location_id)
VALUES (
    '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f',
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
VALUES ('e0000000-0000-0000-0000-000000000003', 'john@abcroofing.com', 'John Smith', 'client', '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f')
ON CONFLICT (email) DO NOTHING;

-- ABC Roofing Team Member
INSERT INTO users (id, email, full_name, role, tenant_id)
VALUES ('e0000000-0000-0000-0000-000000000004', 'sarah@abcroofing.com', 'Sarah Connor', 'client_member', '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f')
ON CONFLICT (email) DO NOTHING;

-- 6. Assign CSM to ABC Roofing
INSERT INTO csm_assignments (csm_user_id, tenant_id)
VALUES ('e0000000-0000-0000-0000-000000000002', '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f')
ON CONFLICT DO NOTHING;

-- 7. Insert ABC Roofing Client Setup Steps (60% Progress: 3 Done, 1 In Progress, 1 Not Started)
INSERT INTO client_setup_steps (tenant_id, template_step_id, step_key, name, owner, status, what_it_is, right_now, unlocks, sort_order)
VALUES
(
    '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f',
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
    '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f',
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
    '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f',
    'b0000000-0000-0000-0000-000000000004',
    'domain_web',
    'Domain, email & website',
    'we_handle',
    'done',
    'Provisioning your custom domain, business email accounts, and launching your company website.',
    'Domain active and verified with SSL.',
    'Professional online web presence and verified email delivery.',
    3
),
(
    '4f3c7e8a-92b1-4d3a-8f5c-1a2b3c4d5e6f',
    'b0000000-0000-0000-0000-000000000005',
    'phone_system',
    'Phone system & A2P texting',
    'we_handle',
    'not_started',
    'Provisioning your local business phone number and configuring call forwarding and texting.',
    'Queued for phone number selection.',
    'Direct two-way calling and carrier-compliant customer SMS.',
    4
) ON CONFLICT DO NOTHING;
