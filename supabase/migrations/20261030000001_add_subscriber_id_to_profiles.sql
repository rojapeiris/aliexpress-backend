-- ====================================================================
-- Supabase Migration: Add subscriber_id to profiles table
-- Stores Ideamart subscriber ID token (e.g. tel:encrypted_hash)
-- ====================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscriber_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_subscriber_id 
ON public.profiles(subscriber_id);

