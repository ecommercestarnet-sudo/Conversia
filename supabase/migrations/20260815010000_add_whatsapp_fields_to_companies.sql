-- Add whatsapp connection columns to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_status TEXT DEFAULT 'disconnected';
