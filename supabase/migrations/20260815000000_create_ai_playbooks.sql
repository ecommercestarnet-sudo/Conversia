-- Create ai_playbooks table
CREATE TABLE IF NOT EXISTS public.ai_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_context TEXT,
  knowledge_base TEXT,
  evaluation_criteria TEXT,
  custom_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar atualização automática de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it already exists to avoid errors on re-run
DROP TRIGGER IF EXISTS update_ai_playbooks_updated_at ON public.ai_playbooks;

CREATE TRIGGER update_ai_playbooks_updated_at
    BEFORE UPDATE ON public.ai_playbooks
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
