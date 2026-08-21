-- Add alert_sent column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS alert_sent BOOLEAN DEFAULT FALSE;
