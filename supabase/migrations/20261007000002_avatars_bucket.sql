-- Private Storage bucket for profile pictures ("My profile").
-- Objects are written and read only by the server (service role); the app hands out
-- short-lived signed URLs. No storage.objects policies are added, so anon/authenticated
-- roles have no access. The application also creates this bucket lazily if it is missing.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'avatars',
            'avatars',
            false,
            2097152,
            ARRAY['image/png', 'image/jpeg', 'image/webp']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
    END IF;
END
$$;
