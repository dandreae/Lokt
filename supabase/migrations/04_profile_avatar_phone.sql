-- =============================================================================
-- Profile: avatar color + optional phone number
-- =============================================================================
-- Apply: Supabase Dashboard → SQL Editor → paste entire file → Run
--
-- Adds two nullable columns to public.profiles for the onboarding flow:
--   avatar_color — hex string the user picked for their own avatar. NULL
--                  means "not set", and the app falls back to its existing
--                  deterministic hash-based color for that user.
--   phone        — optional contact info collected at signup. NOT used for
--                  authentication (no SMS/phone-auth provider is configured
--                  on this project) — purely a profile field for now.
-- No RLS changes needed: existing profile update policies are row-level,
-- not column-level, so they already cover these new columns.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_color text,
  ADD COLUMN IF NOT EXISTS phone text;

-- Keep avatar_color restricted to the app's existing avatar palette
-- (utils/avatar.ts AVATAR_COLORS) so picked colors always match the
-- deterministic ones used elsewhere in the app.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_color_check
  CHECK (
    avatar_color IS NULL OR avatar_color IN (
      '#7c6ff7', '#6cb4f7', '#5ee8b0', '#f7a76c',
      '#f7d96c', '#f76cbf', '#f76c6c', '#5ee8e8'
    )
  );
