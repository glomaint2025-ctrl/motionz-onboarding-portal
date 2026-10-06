-- Migration: 20261007000003_ghl_sync_unique_keys.sql
-- One row per GoHighLevel contact / appointment within a client.
--
-- Why: the webhook upserts were "look up, then insert". Two events arriving together (or a
-- GoHighLevel retry) could both insert, leaving two rows for the same contact or appointment.
-- These unique indexes make the database refuse the second insert; the application then updates
-- the existing row instead (see leads.repository.ts / appointments.repository.ts).
--
-- Safe to run more than once: the clean-up deletes nothing when there are no duplicates and the
-- indexes use IF NOT EXISTS. Rows without a GoHighLevel id (NULL) are never touched or constrained.
--
-- Run it in one go (the Supabase SQL editor runs a script as a single transaction), so the
-- clean-up and the indexes are applied together.

-- 1. Remove duplicate leads, keeping the most recently updated row per (tenant_id, ghl_contact_id).
--    Ties are broken by newest created_at, then by id, so the result is always the same.
DELETE FROM leads
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY tenant_id, ghl_contact_id
                   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
               ) AS position
        FROM leads
        WHERE ghl_contact_id IS NOT NULL
    ) ranked
    WHERE ranked.position > 1
);

-- 2. Remove duplicate appointments, keeping the newest row per (tenant_id, ghl_appointment_id).
--    Appointments have no updated_at column, so the most recently created row is kept.
DELETE FROM appointments
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY tenant_id, ghl_appointment_id
                   ORDER BY created_at DESC NULLS LAST, id
               ) AS position
        FROM appointments
        WHERE ghl_appointment_id IS NOT NULL
    ) ranked
    WHERE ranked.position > 1
);

-- 3. From now on the database itself refuses a second row for the same GoHighLevel id.
CREATE UNIQUE INDEX IF NOT EXISTS leads_tenant_ghl_contact_unique
    ON leads (tenant_id, ghl_contact_id)
    WHERE ghl_contact_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_tenant_ghl_appointment_unique
    ON appointments (tenant_id, ghl_appointment_id)
    WHERE ghl_appointment_id IS NOT NULL;
