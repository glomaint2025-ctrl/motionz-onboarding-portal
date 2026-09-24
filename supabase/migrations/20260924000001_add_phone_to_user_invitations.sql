-- Migration: 20260924000001_add_phone_to_user_invitations.sql
-- Description: Add phone column to user_invitations for SMS notification and invitation tracking

ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
