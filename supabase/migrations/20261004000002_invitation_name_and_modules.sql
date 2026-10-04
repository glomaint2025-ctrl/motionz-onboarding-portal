-- Invitations carry the invitee's name and (for team members) the modules they may open.
-- Until this is applied the app keeps both in tenants.settings.invitation_meta.
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS allowed_modules TEXT[];
