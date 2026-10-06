-- "My profile": each signed-in person can add a profile picture.
-- The picture lives in the private "avatars" Storage bucket; this column stores the object path
-- (users/<userId>/<random>.<ext>), never a public URL. The application keeps working without
-- this column (pictures are simply unavailable until it exists).

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;
