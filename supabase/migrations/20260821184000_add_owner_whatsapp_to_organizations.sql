-- Add owner_whatsapp column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT;
