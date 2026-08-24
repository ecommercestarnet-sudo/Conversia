-- Add owner_name column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS owner_name TEXT;
