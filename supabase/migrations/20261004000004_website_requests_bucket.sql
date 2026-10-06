-- Private Storage bucket for files clients attach to website change requests.
-- Objects are written and read only by the server (service role); staff get signed URLs by email.
-- No storage.objects policies are added, so anon/authenticated roles have no access.
-- The application also creates this bucket lazily if it is missing.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'website-requests',
            'website-requests',
            false,
            10485760,
            ARRAY['image/png', 'image/jpeg', 'image/pjpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;
END
$$;
