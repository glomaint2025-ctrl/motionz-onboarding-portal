-- Client answer (5 Oct 2026): Motionz does not take control of clients' Facebook accounts.
-- Remove the "Facebook" setup step from the standard template and from every client, then renumber the remaining steps 1..n.
DELETE FROM client_setup_steps WHERE step_key = 'facebook';
DELETE FROM template_steps WHERE step_key = 'facebook';

UPDATE template_steps t SET sort_order = r.rn
FROM (SELECT id, row_number() OVER (PARTITION BY template_id ORDER BY sort_order) AS rn FROM template_steps) r
WHERE t.id = r.id AND t.sort_order <> r.rn;

UPDATE client_setup_steps c SET sort_order = r.rn
FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY sort_order) AS rn FROM client_setup_steps) r
WHERE c.id = r.id AND c.sort_order <> r.rn;

UPDATE portal_templates SET description = 'The standard setup steps and portal sections every new client starts with.' WHERE slug = 'standard-template';
