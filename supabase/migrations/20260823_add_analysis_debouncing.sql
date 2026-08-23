-- Add debouncing columns to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS message_count_at_analysis INTEGER DEFAULT 0;
